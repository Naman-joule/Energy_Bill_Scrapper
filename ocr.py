import pytesseract
from PIL import Image, ImageOps, ImageFilter
import pdfplumber
from pdf2image import convert_from_bytes
import io
import logging

logger = logging.getLogger(__name__)

# Configure pytesseract binary path (installed via homebrew on Mac)
pytesseract.pytesseract.tesseract_cmd = "/opt/homebrew/bin/tesseract"

# Tesseract tuning.
# --oem 3  : default LSTM engine.
# --psm 6  : assume a single uniform block of text. Works far better than the
#            default (psm 3) for the dense tabular layout of an energy bill,
#            because it stops Tesseract from splitting columns into separate
#            blocks and dropping numbers.
# preserve_interword_spaces=1 : keep the column spacing so the LLM can still
#            see which number belongs to which column.
TESSERACT_CONFIG = r"--oem 3 --psm 6 -c preserve_interword_spaces=1"
# Fallback config used if psm 6 yields very little text (e.g. sparse layouts).
TESSERACT_CONFIG_FALLBACK = r"--oem 3 --psm 4 -c preserve_interword_spaces=1"

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
    Clean up an image so Tesseract can read every value on a dense bill.

    NOTE: we deliberately do NOT binarise (hard black/white threshold). Testing
    on real low-res bill photos showed a global threshold WIPES the faint
    lower-section rows and corrupts digits (e.g. turning 2,386,211 into
    2,586,211). Tesseract 5's LSTM engine reads grayscale well, so we keep a
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


def _ocr_image(image: Image.Image) -> str:
    """
    Run Tesseract with psm 6 (best for dense bill tables), falling back to psm 4
    only if psm 6 returns almost nothing. A single clean pass is given to the
    LLM: feeding it two overlapping noisy passes was found to confuse column
    alignment on small models rather than help.
    """
    text = pytesseract.image_to_string(image, config=TESSERACT_CONFIG).strip()
    if len(text) < 50:
        logger.info("Primary OCR pass returned little text; retrying with psm 4.")
        fallback = pytesseract.image_to_string(image, config=TESSERACT_CONFIG_FALLBACK).strip()
        if len(fallback) > len(text):
            text = fallback
    return text


def extract_text_from_image(image_bytes: bytes) -> str:
    """
    Extracts text from image bytes (JPEG, PNG, etc.) using Tesseract OCR.
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
    preprocesses them, and runs Tesseract OCR.
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
