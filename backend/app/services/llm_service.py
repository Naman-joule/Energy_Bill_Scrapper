import httpx
import json
import logging
import re
import json_repair

from .billing_service import reconcile_bill_data

logger = logging.getLogger(__name__)

OLLAMA_HOST = "http://122.186.70.126:11434"
BASE_URL = f"{OLLAMA_HOST}/v1"  # OpenAI-compatible endpoint (used for /models listing)

# Models on the server that can accept images (vision capability).
VISION_MODELS = {"gemma4:12b", "gemma4:e4b"}


async def fetch_available_models() -> list[str]:
    """
    Fetches available models from the Ollama API endpoint.
    """
    url = f"{BASE_URL}/models"
    headers = {"Authorization": "Bearer ollama"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
            if response.status_code == 200:
                data = response.json()
                models = [model["id"] for model in data.get("data", [])]
                return models
            else:
                logger.error(f"Failed to fetch models, status: {response.status_code}")
                return []
    except Exception as e:
        logger.error(f"Error fetching models: {e}")
        return []


SYSTEM_PROMPT = """You are an expert energy-bill data extractor. You receive an electricity bill (as an IMAGE and/or its OCR text) and return ONE valid JSON object describing it.

IMPORTANT OUTPUT DISCIPLINE: respond with ONLY the JSON object — no explanation, no reasoning, no markdown fences. Your entire reply is the JSON.

When BOTH an image and OCR text are provided:
- The OCR TEXT is AUTHORITATIVE for every numeric digit and amount. Copy amounts, consumptions, rates and readings VERBATIM from the OCR text — do not shorten, round, or drop digits.
- Use the IMAGE to understand the table LAYOUT and WHICH SECTION each charge belongs to, and to spot rows the OCR may have missed.
- If a number is legible in the OCR text, always prefer that exact figure over what you think you see in the image.

Your job is EXTRACTION ONLY. Do NOT compute totals/percentages/net yourself — a downstream program does all arithmetic and reconciliation. Just transcribe what you see.

The JSON MUST match this structure:
{
  "utility_provider": "Name of the utility company",
  "customer_details": { "name": ..., "billing_address": ..., "service_address": ... },
  "billing_details": {
    "account_number": ..., "meter_number": ..., "invoice_number": ...,
    "bill_date": "YYYY-MM-DD", "due_date": "YYYY-MM-DD", "discont_date": "YYYY-MM-DD",
    "billing_period": { "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD" },
    "contracted_demand_kva": 0.0, "billable_demand_kva": 0.0,
    "tariff_code": ..., "supply_voltage": ...
  },
  "reading_tables": [
    { "reading_from": "date range",
      "readings": [ { "zone_name": ..., "present_reading": 0.0, "past_reading": 0.0,
                      "difference": 0.0, "multiplying_factor": 0.0, "total_consumption": 0.0 } ] }
  ],
  "bill_components": [
    { "sno": "1/2/A/B...", "category": "<one of the four category strings>",
      "component_name": "...", "consumption": 0.0, "rate": 0.0, "unit": "...", "amount": 0.0 }
  ],
  "billing_summary": {
    "total_energy_charges": 0.0, "total_additional_charges": 0.0,
    "total_miscellaneous_charges": 0.0, "total_arrears_lps": 0.0,
    "net_bill_amount": 0.0, "rebate": 0.0,
    "payable_till_due_date": 0.0, "payable_after_due_date": 0.0
  },
  "raw_ocr_analysis_notes": "..."
}

Rules:
- Use null for fields not present. Convert dates to YYYY-MM-DD. Clean numbers (strip commas/currency) to plain numbers. Never write arithmetic expressions in any value.
- Extract every reading-period table separately with its date range and every TOD zone present.
- Capture EVERY row of the 'Bill Component' table: each charge line AND each subtotal/total row (Sno A, B, C, D, E, F, etc. when printed).
- Classify each row into one of the four categories under the `category` field:
  * 'Current Demand and Energy Charges After Open Access': Fixed/Demand Charges, Energy Charges TOD-1..n, and Total Energy Charges (A).
  * 'Additional Charges': FPPA/fuel surcharge, Excess Demand Penalty, and Total Additional Charges (B) / Total (A+B) (C).
  * 'Miscellaneous Charges': Electricity Duty, Due date rebate adjustment, other misc. charges, and Total Miscellaneous Charge (D).
  * 'Arrear and LPS Charges': Arrears, Surcharge LPS, and Total Arrears & LPS (E).
- Do NOT duplicate any row. If FPPA Surcharge, Electricity Duty, or Due date rebate adjustment are listed in a separate breakdown table (like 'Details of Miscellaneous Charges'), extract them once under their correct categories and do NOT duplicate them. Prefer extracting the detailed breakdown components over general aggregated rows (e.g. extract individual 'FPPA Surcharge' and 'Due date rebate adjustment' lines instead of a single general 'Misc. Charges' total row).
- If a subtotal or total row is not explicitly printed on the bill, do NOT synthesize it. Just extract the printed rows.
- Reconcile names and categories:
  - Fixed/Demand Charges (िफकसड/मांग पभार) -> 'Current Demand and Energy Charges After Open Access'
  - TOD Energy Charges / Time of Day Charges -> 'Current Demand and Energy Charges After Open Access'
  - FPPA Surcharge (ईधन और िबजली अिधभार) -> 'Additional Charges'
  - Electricity Duty (िवदुत कर) -> 'Miscellaneous Charges'
  - Due date rebate adjustment (देय ितिथ छूट समायोजन) -> 'Miscellaneous Charges'
  - Arrear Amount (बकाया धनरािश) -> 'Arrear and LPS Charges'
- Do NOT move a line into a section it is not printed under, and do NOT force a printed amount to zero (use 0 only when the bill shows 0/blank).

FORMAT EXAMPLE (FICTITIOUS numbers — show mapping only, NEVER copy them):
  1 Demand Charges 5000 300 /KVA/Mth 1500000 -> {"sno":"1","category":"Current Demand and Energy Charges After Open Access","component_name":"Demand Charges","consumption":5000,"rate":300,"unit":"/KVA/Mth","amount":1500000}
  2 Energy ChargesTOD-1 100000 6.0 /KVAh 600000 -> category 'Current Demand and Energy Charges After Open Access'
  A Total Energy Charges 2100000 -> category 'Current Demand and Energy Charges After Open Access'
  1 Exc Dmd Penalty /KVA 0 -> category 'Additional Charges'
  2 FPPA Charges @ 10% 210000 -> category 'Additional Charges'
  B Total Additional Charges 210000 / C Total (A+B) 2310000 -> category 'Additional Charges'
  1 Other Misc Charges 0.00 / 2 Electricity Duty 7.5% Of (Demand & Energy Charges) 173250 -> category 'Miscellaneous Charges'
  D Total Miscellaneous Charge 173250 -> category 'Miscellaneous Charges'
  1 Arrear 0.00 / 2 Surcharge LPS 5000 / E Total Arrears & LPS 5000 -> category 'Arrear and LPS Charges'
Apply this same structure to the real bill regardless of the actual amounts."""


async def analyze_bill_text(ocr_text: str, model: str, image_b64: list[str] | str | None = None,
                             ocr_text_for_snap: str | None = None) -> dict:
    """
    Extract structured energy-bill data using a HYBRID of OCR text + the bill
    image. When the model supports vision and an image is supplied, the image is
    sent alongside the OCR text (image -> layout/classification, OCR -> exact
    digits). Falls back to text-only otherwise. Output is reconciled
    deterministically before returning.

    image_b64: a base64 string (or list of them for multi-page PDFs), no data
    URL prefix. Pass None for text-only extraction.
    """
    url = f"{OLLAMA_HOST}/api/chat"

    images = []
    if image_b64:
        images = [image_b64] if isinstance(image_b64, str) else list(image_b64)
    use_vision = bool(images) and model in VISION_MODELS

    if use_vision:
        user_text = (
            "Extract the structured JSON for this electricity bill. You are given "
            "the bill IMAGE plus its OCR text below. Use the image for layout and "
            "section classification; use the OCR text for exact digits.\n\nOCR TEXT:\n"
            + ocr_text
        )
        user_message = {"role": "user", "content": user_text, "images": images}
    else:
        if images and not use_vision:
            logger.info(f"Model {model} is not vision-capable; using OCR text only.")
        user_message = {"role": "user", "content": f"Here is the raw energy bill OCR text:\n\n{ocr_text}"}

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            user_message,
        ],
        "stream": False,
        "think": False,          # disable reasoning channel (native API only)
        "format": "json",        # constrain output to a JSON object
        "options": {
            "temperature": 0.1,
            "num_predict": 8192,
            "num_ctx": 16384,
        },
    }

    headers = {"Authorization": "Bearer ollama", "Content-Type": "application/json"}

    content = ""
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            if response.status_code == 401:
                raise RuntimeError("Unauthorized access to LLM model. (Model might require cloud credentials).")
            if response.status_code != 200:
                raise RuntimeError(f"LLM API returned non-200 status: {response.status_code} - {response.text}")

            result_json = response.json()
            message = result_json.get("message", {})
            content = (message.get("content") or "").strip()

            # Fallback: recover JSON from a 'thinking' channel if content empty.
            if not content:
                thinking = message.get("thinking") or ""
                brace = thinking.find("{")
                if brace != -1:
                    content = thinking[brace:thinking.rfind("}") + 1].strip()
                    logger.warning("LLM 'content' empty; recovered JSON from 'thinking' channel.")
            if not content:
                raise RuntimeError(
                    f"LLM returned empty content (done_reason={result_json.get('done_reason')})."
                )

            # Strip markdown fences if present.
            if content.startswith("```"):
                content = re.sub(r"^```(?:json)?\n", "", content)
                content = re.sub(r"\n```$", "", content).strip()

            # Remove trailing commas.
            content = re.sub(r",\s*([\}\]])", r"\1", content)

            # Resolve any stray arithmetic expressions the model wrote in values.
            def evaluate_match(m):
                expr = m.group(1).strip()
                if re.match(r"^\d{4}-\d{2}-\d{2}$", expr):
                    return m.group(0)
                try:
                    if re.match(r"^[\d\.\s\+\-\*\/]+$", expr):
                        return f": {eval(expr)}"
                except Exception:
                    pass
                return m.group(0)

            content = re.sub(r":\s*([\d\.]+(?:\s*[\+\-\*\/]\s*[\d\.]+)+)", evaluate_match, content)

            try:
                parsed_data = json_repair.loads(content)
            except Exception as jre:
                logger.warning(f"json_repair failed: {jre}, falling back to json.loads")
                parsed_data = json.loads(content)

            if isinstance(parsed_data, dict):
                parsed_data = reconcile_bill_data(parsed_data, ocr_text_for_snap or ocr_text)
            return parsed_data

    except httpx.TimeoutException as te:
        logger.error(f"LLM request timed out: {te}")
        raise RuntimeError("LLM request timed out. The model took too long to respond.")
    except Exception as e:
        logger.error(f"Error in LLM analysis: {e}. Raw content (if any): {content[:300]}")
        raise RuntimeError(f"Failed to analyze bill text: {str(e)}")
