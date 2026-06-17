from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import base64
import io
import logging
import os
import time

from ocr import extract_text_from_image, extract_text_from_pdf
from llm import fetch_available_models, analyze_bill_text


# Target width (px) for each image tile sent to the vision model. A dense bill
# table is unreadable when the whole page is shrunk into the model's vision
# frame; splitting the page into overlapping vertical tiles and upscaling each
# makes the table fill the frame and dramatically improves digit accuracy.
VISION_TILE_WIDTH = 2800


# Overlapping vertical bands of a standard-format bill, as fractions of height:
#   header/meta (provider, customer, account, meter, demand, tariff),
#   meter-reading tables, and the charges + summary ledger.
# Giving each dense block its OWN upscaled tile (instead of squashing the whole
# page) is what makes the vision model read the small digits accurately.
VISION_TILE_BANDS = ((0.0, 0.36), (0.24, 0.50), (0.46, 1.0))


def _tile_image(pil_image) -> list[str]:
    """Split a PIL image into overlapping vertical band tiles, upscale each
    toward VISION_TILE_WIDTH, and return them as base64 PNG strings. The
    overlaps ensure no row is cut between tiles."""
    from PIL import Image as _Image
    img = pil_image.convert("RGB")
    W, H = img.size
    # Target VISION_TILE_WIDTH per tile: upscale low-res photos AND downscale
    # over-large scans to the model's sweet spot for consistent legibility.
    scale = VISION_TILE_WIDTH / float(W)
    out = []
    for top_frac, bot_frac in VISION_TILE_BANDS:
        crop = img.crop((0, int(H * top_frac), W, int(H * bot_frac)))
        crop = crop.resize((int(crop.width * scale), int(crop.height * scale)), _Image.LANCZOS)
        buf = io.BytesIO()
        crop.save(buf, format="PNG")
        out.append(base64.b64encode(buf.getvalue()).decode("utf-8"))
    return out


def build_vision_images(file_bytes: bytes, is_pdf: bool) -> list[str]:
    """
    Return base64-encoded image tiles for the vision model (upscaled so the
    dense table is legible). Images are tiled directly; PDFs are rasterised
    (first page) then tiled. Returns [] if no image could be produced.
    """
    try:
        from PIL import Image
        if is_pdf:
            from pdf2image import convert_from_bytes
            pages = convert_from_bytes(file_bytes, dpi=200)
            if not pages:
                return []
            return _tile_image(pages[0])
        return _tile_image(Image.open(io.BytesIO(file_bytes)))
    except Exception as e:
        logger.warning(f"Could not build vision tiles: {e}")
        return []


def build_full_image_data_url(file_bytes: bytes, is_pdf: bool, content_type: str | None) -> str | None:
    """Return a data URL of the WHOLE bill (un-tiled) for display in the UI."""
    try:
        if is_pdf:
            from pdf2image import convert_from_bytes
            pages = convert_from_bytes(file_bytes, dpi=150)
            if not pages:
                return None
            buf = io.BytesIO()
            pages[0].save(buf, format="PNG")
            return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")
        mime = content_type or "image/jpeg"
        return f"data:{mime};base64," + base64.b64encode(file_bytes).decode("utf-8")
    except Exception as e:
        logger.warning(f"Could not build full image data URL: {e}")
        return None

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Energy Bill OCR & LLM Scrapper",
    description="Extracts data from energy bills using OCR and organizes it using LLM.",
    version="1.0.0"
)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create static directories if they don't exist
os.makedirs("static/css", exist_ok=True)
os.makedirs("static/js", exist_ok=True)

@app.get("/api/models")
async def get_models():
    """
    Fetches the list of models available from the Ollama model server.
    """
    models = await fetch_available_models()
    if not models:
        # Fallback default models if server is unreachable or lists empty.
        # (Larger models parse the dense bill table far more reliably.)
        models = ["gemma4:12b", "gemma4:e4b"]
    return {"models": models}

@app.post("/api/analyze")
async def analyze_bill(
    file: UploadFile = File(...),
    model: str = Form("gemma4:12b")
):
    """
    Uploads a bill (JPEG, PNG, PDF), runs OCR to extract raw text, and queries LLM.
    """
    start_time = time.time()
    filename = file.filename
    content_type = file.content_type
    
    logger.info(f"Received file: {filename}, type: {content_type}, model: {model}")
    
    # Read file content
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        
    ocr_text = ""
    is_pdf = False
    # Process OCR based on file type
    try:
        ext = os.path.splitext(filename.lower())[1]
        if content_type == "application/pdf" or ext == ".pdf":
            is_pdf = True
            ocr_text = extract_text_from_pdf(file_bytes)
        elif content_type in ["image/jpeg", "image/png", "image/jpg", "image/webp"] or ext in [".png", ".jpg", ".jpeg", ".webp"]:
            ocr_text = extract_text_from_image(file_bytes)
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format: {content_type or ext}. Please upload JPEG, PNG, or PDF."
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OCR failed for {filename}: {e}")
        raise HTTPException(status_code=500, detail=f"OCR Processing failed: {str(e)}")

    if not ocr_text or not ocr_text.strip():
        raise HTTPException(
            status_code=422,
            detail="No readable text could be extracted from the document. Please verify the image quality or document content."
        )

    # Build base64 image(s) for the vision model (hybrid image + OCR extraction).
    vision_images = build_vision_images(file_bytes, is_pdf)

    # Send to LLM (hybrid: OCR text + bill image when the model supports vision).
    try:
        logger.info(f"Running LLM analysis with model: {model} (vision images: {len(vision_images)})...")
        structured_data = await analyze_bill_text(ocr_text, model, image_b64=vision_images or None, ocr_text_for_snap=ocr_text)
    except Exception as e:
        logger.error(f"LLM analysis failed for {filename}: {e}")
        # Provide the raw OCR text even if LLM fails, so the user knows what was read
        return JSONResponse(
            status_code=502,
            content={
                "detail": f"LLM Analysis failed: {str(e)}",
                "raw_text": ocr_text,
                "metadata": {
                    "filename": filename,
                    "content_type": content_type,
                    "processing_time_seconds": round(time.time() - start_time, 2)
                }
            }
        )
        
    processing_time = round(time.time() - start_time, 2)
    logger.info(f"Analysis completed in {processing_time}s")

    # Whole (un-tiled) document as a data URL so the UI shows the full bill.
    image_data_url = build_full_image_data_url(file_bytes, is_pdf, content_type)

    return {
        "success": True,
        "raw_text": ocr_text,
        "data": structured_data,
        "image_data_url": image_data_url,
        "metadata": {
            "filename": filename,
            "content_type": content_type,
            "model": model,
            "processing_time_seconds": processing_time,
            "used_vision": bool(vision_images) and model in __import__("llm").VISION_MODELS,
        }
    }

# Mount static files (React Vite production build) at root
app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")
