from fastapi import APIRouter, UploadFile, File, Form
from ..controllers.bill_controller import BillController
from ..models.bill_models import BillData, RecalculateResponse, AnalysisResponse

router = APIRouter(prefix="/api")

@router.get("/models")
async def get_models():
    """
    Fetches the list of models available from the Ollama model server.
    """
    return await BillController.get_models()

@router.post("/analyze")
async def analyze_bill(
    file: UploadFile = File(...),
    model: str = Form("gemma4:12b")
):
    """
    Uploads a bill (JPEG, PNG, PDF), runs OCR to extract raw text, and queries LLM.
    """
    return await BillController.analyze_bill(file, model)

@router.post("/calculate")
async def calculate_bill(payload: BillData):
    """
    Recalculates the bill data using the backend python engine and the user's 5-step billing formulas.
    """
    return BillController.calculate_bill(payload)

@router.post("/block-data")
async def get_block_data(payload: BillData):
    """
    Generates 15-minute interval (block-wise) energy consumption data
    for the entire billing month, distributed by TOD zone.
    Returns total_days × 96 records (e.g. 30 × 96 = 2880 rows).
    """
    return BillController.get_block_data(payload)

