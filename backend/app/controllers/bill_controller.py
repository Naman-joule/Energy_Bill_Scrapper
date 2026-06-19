import os
import io
import time
import base64
import logging
from fastapi import UploadFile, HTTPException

from ..services import ocr_service, llm_service, billing_service
from ..models.bill_models import BillData

logger = logging.getLogger(__name__)

VISION_TILE_WIDTH = 2800
VISION_TILE_BANDS = ((0.0, 0.36), (0.24, 0.50), (0.46, 1.0))


def _tile_image(pil_image) -> list[str]:
    """Split a PIL image into overlapping vertical band tiles, upscale each
    toward VISION_TILE_WIDTH, and return them as base64 PNG strings."""
    from PIL import Image as _Image
    img = pil_image.convert("RGB")
    W, H = img.size
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
    """Return base64-encoded image tiles for the vision model."""
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


class BillController:
    @staticmethod
    async def get_models():
        """Fetches list of available models from Ollama."""
        models = await llm_service.fetch_available_models()
        if not models:
            # Fallback default models if server is unreachable
            models = ["gemma4:12b", "gemma4:e4b"]
        return {"models": models}

    @staticmethod
    async def analyze_bill(file: UploadFile, model: str):
        """Uploads a bill (JPEG, PNG, PDF), runs OCR, and queries LLM."""
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
        
        try:
            ext = os.path.splitext(filename.lower())[1]
            if content_type == "application/pdf" or ext == ".pdf":
                is_pdf = True
                ocr_text = ocr_service.extract_text_from_pdf(file_bytes)
            elif content_type in ["image/jpeg", "image/png", "image/jpg", "image/webp"] or ext in [".png", ".jpg", ".jpeg", ".webp"]:
                ocr_text = ocr_service.extract_text_from_image(file_bytes)
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

        # Build base64 image(s) for the vision model
        vision_images = build_vision_images(file_bytes, is_pdf)

        try:
            logger.info(f"Running LLM analysis with model: {model} (vision images: {len(vision_images)})...")
            structured_data = await llm_service.analyze_bill_text(
                ocr_text, model, image_b64=vision_images or None, ocr_text_for_snap=ocr_text
            )
        except Exception as e:
            logger.error(f"LLM analysis failed for {filename}: {e}")
            # Return raw text even if LLM fails
            raise HTTPException(
                status_code=502,
                detail={
                    "message": f"LLM Analysis failed: {str(e)}",
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

        # Whole document as a data URL for UI display
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
                "used_vision": bool(vision_images) and model in llm_service.VISION_MODELS,
            }
        }

    @staticmethod
    def calculate_bill(payload: BillData):
        """Recalculates bill data based on 5-step billing formulas."""
        try:
            # We serialize the request schema to dict first to reuse the recalculation service
            data_dict = payload.model_dump()
            result = billing_service.calculate_bill_formulas(data_dict)
            return {
                "success": True,
                "data": result["data"],
                "calculations": result["calculations"]
            }
        except Exception as e:
            logger.error(f"Calculation failed: {e}")
            raise HTTPException(status_code=400, detail=f"Recalculation failed: {str(e)}")

    @staticmethod
    def get_block_data(payload: BillData):
        """Generates 15-minute interval block-wise energy data for the billing period."""
        try:
            data_dict = payload.model_dump()
            result = billing_service.generate_block_data(data_dict)
            return result
        except Exception as e:
            logger.error(f"Block data generation failed: {e}")
            raise HTTPException(status_code=400, detail=f"Block data generation failed: {str(e)}")

