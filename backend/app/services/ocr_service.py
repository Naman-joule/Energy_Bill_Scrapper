from PIL import Image, ImageOps
import pdfplumber
from pdf2image import convert_from_bytes
import io
import logging

logger = logging.getLogger(__name__)

# Lazy loaded surya predictors to keep startup latency minimal
_foundation_predictor = None
_det_predictor = None
_rec_predictor = None


def get_surya_predictors():
    """Lazily load Surya OCR predictors and models to minimize startup latency."""
    global _foundation_predictor, _det_predictor, _rec_predictor
    if _foundation_predictor is None:
        logger.info("Initializing Surya OCR Predictors and loading PyTorch weights...")
        from surya.foundation import FoundationPredictor
        from surya.detection import DetectionPredictor
        from surya.recognition import RecognitionPredictor
        
        _foundation_predictor = FoundationPredictor()
        _det_predictor = DetectionPredictor()
        _rec_predictor = RecognitionPredictor(_foundation_predictor)
    return _det_predictor, _rec_predictor

# Minimum width (px) we want before running OCR. Low-res phone photos (e.g.
# 960px wide) render dense table digits at ~8px tall, below Tesseract's reliable
# range, so we upscale aggressively. Upscaling can't invent detail, but it gives
# the LSTM engine more pixels per glyph and measurably recovers dropped digits.
MIN_OCR_WIDTH = 2800
# DPI used when rasterising PDF pages for the scanned-PDF fallback. 300 DPI is
# the sweet spot for OCR accuracy on financial documents.
PDF_RENDER_DPI = 300


def preprocess_image(image: Image.Image) -> Image.Image:
    """
    Clean up an image so Tesseract/Surya can read every value on a dense bill.

    NOTE: we deliberately do NOT binarise (hard black/white threshold). Testing
    on real low-res bill photos showed a global threshold WIPES the faint
    lower-section rows and corrupts digits (e.g. turning 2,386,211 into
    2,586,211). The LSTM engine reads grayscale well, so we keep a
    high-bit-depth grayscale image and only normalise contrast.

    Steps:
      1. Respect EXIF orientation (phone photos are often rotated).
      2. Convert to grayscale.
      3. Upscale small images so thin strokes / decimals survive.
      4. Auto-contrast to normalise faded scans and uneven lighting.
    """
    # 1. Auto-rotate based on EXIF so text is upright.
    try:
        image = ImageOps.exif_transpose(image)
    except Exception:
        pass

    # 2. Grayscale.
    image = image.convert("L")

    # 3. Upscale if the image is smaller than our target width.
    if image.width < MIN_OCR_WIDTH:
        scale = MIN_OCR_WIDTH / float(image.width)
        new_size = (int(image.width * scale), int(image.height * scale))
        image = image.resize(new_size, Image.LANCZOS)

    # 4. Normalise contrast (drops the faintest 1% of pixels at each end).
    image = ImageOps.autocontrast(image, cutoff=1)

    return image


def group_lines_into_rows(lines, y_threshold=8) -> str:
    """
    Group lines that share overlapping vertical coordinates (representing a table row)
    and sort columns horizontally from left to right.
    """
    sorted_lines = sorted(lines, key=lambda l: l.bbox[1])
    rows = []
    
    for line in sorted_lines:
        bbox = line.bbox  # [xmin, ymin, xmax, ymax]
        placed = False
        for row in rows:
            row_ymin = min(l.bbox[1] for l in row)
            row_ymax = max(l.bbox[3] for l in row)
            row_height = row_ymax - row_ymin
            
            overlap = min(bbox[3], row_ymax) - max(bbox[1], row_ymin)
            line_height = bbox[3] - bbox[1]
            
            if overlap > 0.4 * min(line_height, row_height) or abs(bbox[1] - row_ymin) < y_threshold:
                row.append(line)
                placed = True
                break
                
        if not placed:
            rows.append([line])
            
    reconstructed_lines = []
    for row in rows:
        sorted_row = sorted(row, key=lambda l: l.bbox[0])
        row_text = " | ".join(l.text.strip() for l in sorted_row)
        reconstructed_lines.append(row_text)
        
    return "\n".join(reconstructed_lines)


def _ocr_image(image: Image.Image) -> str:
    """
    Run Surya OCR on the image and reconstruct the layout into structured Markdown.
    """
    det_predictor, rec_predictor = get_surya_predictors()
    
    # Run recognition (Surya automatically handles English and Hindi)
    predictions = rec_predictor([image], det_predictor=det_predictor)
    
    page_result = predictions[0]
    text_lines = page_result.text_lines
    
    # Reconstruct column-aligned layout
    text = group_lines_into_rows(text_lines)
    return text.strip()


def extract_text_from_image(image_bytes: bytes) -> str:
    """
    Extracts text from image bytes (JPEG, PNG, etc.) using Surya OCR.
    The image is preprocessed first to maximise the number of values captured.
    """
    try:
        image = Image.open(io.BytesIO(image_bytes))
        image = preprocess_image(image)
        text = _ocr_image(image)
        return text.strip()
    except Exception as e:
        logger.error(f"Error in image OCR: {e}")
        raise RuntimeError(f"Failed to process image OCR: {str(e)}")


def _extract_pdf_tables(pdf) -> str:
    """
    Pull tabular data out of a digital PDF using pdfplumber's table detector.
    Energy bills are mostly tables, and the plain text extractor often loses
    the column alignment; the tables are appended so the LLM sees both views.
    """
    table_blocks = []
    for page_num, page in enumerate(pdf.pages, start=1):
        try:
            tables = page.extract_tables()
        except Exception as e:
            logger.warning(f"Table extraction failed on page {page_num}: {e}")
            continue
        for t_idx, table in enumerate(tables, start=1):
            rows = []
            for row in table:
                cells = [(c or "").replace("\n", " ").strip() for c in row]
                rows.append(" | ".join(cells))
            if rows:
                table_blocks.append(
                    f"[Page {page_num} Table {t_idx}]\n" + "\n".join(rows)
                )
    return "\n\n".join(table_blocks).strip()


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extracts text from PDF bytes.
    First tries to extract digital text + tables using pdfplumber.
    If no text is found (scanned PDF), converts pages to images at high DPI,
    preprocesses them, and runs Surya OCR.
    """
    extracted_text = ""

    # 1. Try digital text + table extraction first.
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text_pages = []
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_pages.append(page_text)
            extracted_text = "\n--- Page Separator ---\n".join(text_pages).strip()

            # Append detected tables so column-aligned values are preserved.
            tables_text = _extract_pdf_tables(pdf)
            if tables_text:
                extracted_text = (
                    extracted_text
                    + "\n\n--- Extracted Tables ---\n"
                    + tables_text
                ).strip()
    except Exception as e:
        logger.warning(f"Digital PDF extraction failed, falling back to OCR: {e}")

    # 2. If little/no digital text found, fall back to high-DPI image OCR.
    if len(extracted_text) < 50:
        logger.info("PDF has very little or no digital text. Fallback to image-based OCR.")
        try:
            # Render pages at high DPI for accurate OCR of small digits.
            images = convert_from_bytes(pdf_bytes, dpi=PDF_RENDER_DPI)
            ocr_pages = []
            for i, img in enumerate(images):
                logger.info(f"Running OCR on PDF page {i + 1}/{len(images)}...")
                processed = preprocess_image(img)
                page_text = _ocr_image(processed)
                ocr_pages.append(page_text)
            extracted_text = "\n--- Page Separator ---\n".join(ocr_pages).strip()
        except Exception as e:
            logger.error(f"Error in scanned PDF OCR: {e}")
            raise RuntimeError(f"Failed to perform OCR on scanned PDF: {str(e)}")

    return extracted_text
