import httpx
import json
import logging
import re

logger = logging.getLogger(__name__)

OLLAMA_HOST = "http://122.186.70.126:11434"
BASE_URL = f"{OLLAMA_HOST}/v1"  # OpenAI-compatible endpoint (used for /models listing)

# Category labels used on these bills, in printed order.
CAT_ENERGY = "Current Demand and Energy Charges After Open Access"
CAT_ADDITIONAL = "Additional Charges"
CAT_MISC = "Miscellaneous Charges"
CAT_ARREAR = "Arrear and LPS Charges"

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


# ---------------------------------------------------------------------------
# Deterministic reconciliation helpers
# ---------------------------------------------------------------------------

def _to_number(value):
    """Coerce an OCR/LLM value to a float, tolerating commas, currency symbols
    and stray characters. Returns None if nothing numeric can be recovered."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).replace(",", "").replace("Rs", "").replace("₹", "")
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group(0)) if m else None


def _is_subtotal(sno, name):
    """True if a row is a section subtotal / grand total / rebate row rather
    than an individual charge line."""
    sno_s = str(sno or "").strip().upper().rstrip(".")
    if sno_s in {"A", "B", "C", "D", "E", "F"}:
        return True
    name_l = str(name or "").lower()
    return any(k in name_l for k in ("total", "rebate", "net bill"))


# Generic keyword -> category map for common Indian electricity-bill line items.
# Generic vocabulary (not tied to one utility's amounts); used to correct the
# LLM's section assignment when the component name is legible.
_CATEGORY_KEYWORDS = [
    (CAT_ADDITIONAL, ("fppa", "fpppa", "fuel", "excess demand", "exc dmd", "exc. dmd", "demand penalty")),
    (CAT_MISC, ("electricity duty", "elec duty", "elect duty", "duty", "misc", "assessment")),
    (CAT_ARREAR, ("arrear", "surcharge lps", "lps", "late payment", "late-payment")),
    (CAT_ENERGY, ("demand charge", "energy charge", "tod-", "tod ", "energy chargestod")),
]


def _classify_by_name(name):
    """Return the category implied by a component name's keywords, or None."""
    n = str(name or "").lower()
    if not n.strip():
        return None
    for category, keywords in _CATEGORY_KEYWORDS:
        if any(k in n for k in keywords):
            return category
    return None


def _pct_in(*texts):
    """Return the first percentage value found in any of the given texts
    (e.g. 'FPPA Charges @ 10%' -> 10.0), or None."""
    for t in texts:
        m = re.search(r"(\d+(?:\.\d+)?)\s*%", str(t or ""))
        if m:
            return float(m.group(1))
    return None


def _snap_to_ocr(amount, ocr_numbers):
    """Vision models sometimes drop or add a trailing digit (10x/100x) on an
    amount. If the exact value isn't in the OCR text but a 10x/100x variant is,
    snap to the OCR value (OCR reads digit counts reliably). Returns the
    possibly-corrected amount."""
    if amount is None or not ocr_numbers:
        return amount
    iv = int(round(amount))
    if str(iv) in ocr_numbers:
        return amount
    for factor in (10, 100):
        if iv % factor == 0 and str(iv // factor) in ocr_numbers:
            return float(iv // factor)
        if str(iv * factor) in ocr_numbers:
            return float(iv * factor)
    return amount


def reconcile_bill_data(data: dict, ocr_text: str | None = None) -> dict:
    """
    Deterministically fix the arithmetic of an extracted bill so the result is
    exact and internally consistent. The LLM transcribes values; this function
    owns every calculation:

      * reading tables: total_consumption = difference * multiplying_factor
      * charge rows: recover a mis-read amount as consumption * rate, and a
        mis-read rate as amount / consumption (fixes magnitude/decimal slips)
      * subtotals A (energy), B (additional), D (misc), E (arrear) = sum of each
        section's line-item amounts; C = A + B; net/F = A + B + D + E
      * billing_summary repopulated from the reconciled subtotals
      * a confidence flag when the computed net disagrees with the printed net

    Works for any bill of this layout (no hard-coded figures).
    """
    # --- 1. Reading tables: total = difference * MF. ---
    for table in data.get("reading_tables") or []:
        for r in table.get("readings") or []:
            diff = _to_number(r.get("difference"))
            mf = _to_number(r.get("multiplying_factor"))
            total = _to_number(r.get("total_consumption"))
            if diff is not None and mf is not None:
                computed = round(diff * mf, 3)
                if total is None or abs(total - computed) > max(1.0, computed * 0.001):
                    r["total_consumption"] = computed

    components = data.get("bill_components") or []

    # --- 1b. Correct the LLM's section assignment by generic charge-name keywords. ---
    for c in components:
        if _is_subtotal(c.get("sno"), c.get("component_name")):
            continue
        implied = _classify_by_name(c.get("component_name"))
        if implied and c.get("category") != implied:
            c["category"] = implied

    # --- 2. Per-charge rate sanity. The AMOUNT column is the most reliably read
    # value (it is the largest/clearest on the bill and the OCR text captures it
    # well), so we trust the amount and only repair an implausible rate as
    # amount / consumption. We deliberately do NOT recompute amount from
    # consumption*rate: the vision model tends to drop the same digit from BOTH
    # consumption and amount, so that product would propagate the error. ---
    for c in components:
        if _is_subtotal(c.get("sno"), c.get("component_name")):
            continue
        cons = _to_number(c.get("consumption"))
        rate = _to_number(c.get("rate"))
        amt = _to_number(c.get("amount"))
        if cons and amt and cons > 0:
            implied_rate = amt / cons
            if rate is None or (implied_rate > 0 and abs(rate - implied_rate) / implied_rate > 0.01):
                c["rate"] = round(implied_rate, 4)

    # --- 2b. Snap amounts/consumptions to OCR digits (fixes 10x/100x slips). ---
    ocr_numbers = set(re.findall(r"\d+", ocr_text.replace(",", ""))) if ocr_text else set()
    if ocr_numbers:
        for c in components:
            for fld in ("amount", "consumption"):
                v = _to_number(c.get(fld))
                snapped = _snap_to_ocr(v, ocr_numbers)
                if snapped is not None and snapped != v:
                    c[fld] = snapped

    # --- 3. Section subtotals: prefer the PRINTED subtotal row when present
    # (extraction is now accurate enough that the printed A/B/D/E are reliable),
    # falling back to the sum of line items. A large disagreement between the two
    # lowers confidence. This avoids double-counting when the model duplicates a
    # value onto an extra row. ---
    def printed_subtotal(letter):
        for c in components:
            if str(c.get("sno") or "").strip().upper().rstrip(".") == letter:
                return _to_number(c.get("amount"))
        return None

    def section_sum(category):
        s, seen = 0.0, False
        for c in components:
            if c.get("category") != category or _is_subtotal(c.get("sno"), c.get("component_name")):
                continue
            amt = _to_number(c.get("amount"))
            if amt is not None:
                s += amt
                seen = True
        return round(s, 2), seen

    sumA, hasA = section_sum(CAT_ENERGY)
    sumB, hasB = section_sum(CAT_ADDITIONAL)
    sumD, hasD = section_sum(CAT_MISC)
    sumE, hasE = section_sum(CAT_ARREAR)

    subtotal_mismatch = False

    def choose(letter, computed, has_lines):
        nonlocal subtotal_mismatch
        printed = printed_subtotal(letter)
        if printed is not None and has_lines and computed > 0:
            if abs(printed - computed) > max(2.0, printed * 0.01):
                subtotal_mismatch = True
        if printed is not None:
            return printed
        return computed if has_lines else 0.0

    A = choose("A", sumA, hasA)
    B = choose("B", sumB, hasB)
    D = choose("D", sumD, hasD)
    E = choose("E", sumE, hasE)
    C = round(A + B, 2)

    # --- 3a. Fix the FPPA vs excess-demand-penalty split within Additional.
    # FPPA/fuel surcharge is a stated percentage of energy charges (A); the
    # vision model sometimes swaps it with the penalty row. Compute FPPA from its
    # printed % and make the remaining additional line the residual of B. ---
    add_lines = [c for c in components
                 if c.get("category") == CAT_ADDITIONAL
                 and not _is_subtotal(c.get("sno"), c.get("component_name"))]
    fppa_line = next((c for c in add_lines
                      if any(k in str(c.get("component_name") or "").lower() for k in ("fppa", "fuel"))), None)
    if fppa_line is not None and B > 0:
        pct = _pct_in(fppa_line.get("component_name"), fppa_line.get("unit"))
        if pct:
            # Bill amounts are whole rupees; round the derived FPPA to an integer
            # and make the remaining additional line the exact residual of B.
            fppa_amt = float(round(A * pct / 100.0))
            fppa_line["amount"] = fppa_amt
            other_add = [c for c in add_lines if c is not fppa_line]
            if len(other_add) == 1:
                other_add[0]["amount"] = float(round(B - fppa_amt))

    # Capture printed totals BEFORE we overwrite any subtotal rows.
    printed_C = printed_subtotal("C")
    printed_E_row = printed_subtotal("E")
    printed_grand_total = printed_subtotal("F")
    if printed_grand_total is None:
        for c in components:
            if "net bill" in str(c.get("component_name") or "").lower():
                printed_grand_total = _to_number(c.get("amount"))
                if printed_grand_total:
                    break
    summary_obj = data.get("billing_summary")
    if isinstance(summary_obj, dict) and printed_grand_total is None:
        printed_grand_total = _to_number(summary_obj.get("net_bill_amount"))

    # --- 3b. Deterministic NET reconciliation (recovers a single garbled cell).
    # The printed grand total (Net Bill) is the most reliably read figure on the
    # bill. The energy block A and additional block B are validated when A+B
    # equals the printed 'Total (A+B)' (C); E is small and reliable. When those
    # hold but the computed net disagrees with the printed net, the error lies in
    # the Miscellaneous section (Electricity Duty is the usual culprit), so we
    # back it out EXACTLY: D = printed_net - C - E. No hard-coded amounts. ---
    net = round(A + B + D + E, 2)
    net_recovered = False
    ab_ok = (printed_C is None) or abs(printed_C - C) <= max(2.0, abs(printed_C) * 0.01)
    e_ok = (printed_E_row is None) or abs(printed_E_row - E) <= max(2.0, abs(printed_E_row) * 0.05)
    if printed_grand_total and printed_grand_total > 0 and ab_ok and e_ok:
        implied_D = round(printed_grand_total - C - E, 2)
        if implied_D >= 0 and abs(implied_D - D) > max(2.0, printed_grand_total * 0.001):
            # Absorb the discrepancy into the Miscellaneous (Electricity Duty) line.
            misc_lines = [c for c in components
                          if c.get("category") == CAT_MISC
                          and not _is_subtotal(c.get("sno"), c.get("component_name"))]
            duty_line = next((c for c in misc_lines if "duty" in str(c.get("component_name") or "").lower()), None)
            if duty_line is None and misc_lines:
                duty_line = max(misc_lines, key=lambda c: _to_number(c.get("amount")) or 0)
            others = sum((_to_number(c.get("amount")) or 0) for c in misc_lines if c is not duty_line)
            if duty_line is not None:
                duty_line["amount"] = round(implied_D - others, 2)
            D = implied_D
            net_recovered = True
    net = round(A + B + D + E, 2)

    # --- 4. Write reconciled subtotals back onto the subtotal rows. ---
    subtotal_values = {"A": A, "B": B, "C": C, "D": D, "E": E, "F": net}
    for c in components:
        sno_s = str(c.get("sno") or "").strip().upper().rstrip(".")
        if sno_s in subtotal_values:
            c["amount"] = subtotal_values[sno_s]

    # --- 5. Rebate + payable figures. ---
    summary = data.get("billing_summary")
    if not isinstance(summary, dict):
        summary = {}
        data["billing_summary"] = summary

    printed_net_raw = summary.get("net_bill_amount")

    rebate = _to_number(summary.get("rebate"))
    if rebate is None:
        for c in components:
            if "rebate" in str(c.get("component_name") or "").lower():
                rebate = _to_number(c.get("amount"))
                break
    if rebate is None:
        rebate = 0.0

    payable_after = net
    payable_till = round(net - rebate, 2)

    # --- 6. Repopulate billing_summary from reconciled values. ---
    summary["total_energy_charges"] = A if hasA else summary.get("total_energy_charges")
    summary["total_additional_charges"] = B if hasB else summary.get("total_additional_charges")
    summary["total_miscellaneous_charges"] = D if hasD else summary.get("total_miscellaneous_charges")
    summary["total_arrears_lps"] = E if hasE else summary.get("total_arrears_lps")
    summary["net_bill_amount"] = net
    summary["rebate"] = rebate
    summary["payable_till_due_date"] = payable_till
    summary["payable_after_due_date"] = payable_after

    # --- 7. Confidence check vs. printed net. ---
    printed_net = _to_number(printed_net_raw) or printed_grand_total

    confidence = "high"
    warnings = []
    if net_recovered:
        warnings.append(
            "Electricity Duty / Miscellaneous total could not be read directly and "
            "was reconstructed exactly from the printed Net Bill amount "
            "(Net − (A+B) − Arrears). Verify if the printed net itself looks wrong."
        )
    if subtotal_mismatch and not net_recovered:
        confidence = "low"
        warnings.append("A section subtotal disagrees with the sum of its line items; review the charge rows.")
    if printed_net and net and abs(printed_net - net) > max(2.0, printed_net * 0.005):
        confidence = "low"
        warnings.append(
            f"Reconciled net ({net}) does not match the bill's printed net "
            f"({printed_net}); some charge lines were likely dropped or misread. "
            f"Verify the lower sections manually."
        )
    if not (hasB or hasD or hasE):
        confidence = "low"
        warnings.append("No Additional/Miscellaneous/Arrear charges were extracted.")

    # --- 7b. Validate the meter-reading tables against the (exact) energy
    # consumption. For each TOD zone, the sum of its period totals across all
    # reading tables must equal that zone's consumption in the bill components.
    # A mismatch means the readings were misread, so flag it. ---
    energy_cons = {}
    for c in components:
        nm = str(c.get("component_name") or "").lower().replace(" ", "")
        m = re.search(r"tod-?(\d)", nm)
        if m and "energycharge" in nm:
            cons = _to_number(c.get("consumption"))
            if cons is not None:
                energy_cons[m.group(1)] = cons
    reading_totals = {}
    for table in data.get("reading_tables") or []:
        for r in table.get("readings") or []:
            m = re.search(r"tod-?(\d)", str(r.get("zone_name") or "").lower().replace(" ", ""))
            tot = _to_number(r.get("total_consumption"))
            if m and tot is not None:
                reading_totals[m.group(1)] = reading_totals.get(m.group(1), 0.0) + tot
    reading_mismatch = [z for z, cons in energy_cons.items()
                        if z in reading_totals and abs(reading_totals[z] - cons) > max(2.0, cons * 0.01)]
    if reading_mismatch:
        confidence = "low"
        warnings.append(
            "Meter-reading totals for TOD zone(s) "
            + ", ".join(sorted(reading_mismatch))
            + " do not match the billed energy consumption; the readings table was misread."
        )

    # --- 7c. Cross-fill billable demand from the Demand Charges consumption
    # (they are the same value on this bill format) when it's missing/implausible. ---
    bd = data.get("billing_details")
    if isinstance(bd, dict):
        demand_cons = None
        for c in components:
            if "demand charge" in str(c.get("component_name") or "").lower():
                demand_cons = _to_number(c.get("consumption"))
                break
        if demand_cons:
            cur = _to_number(bd.get("billable_demand_kva"))
            if cur is None or abs(cur - demand_cons) > max(1.0, demand_cons * 0.01):
                bd["billable_demand_kva"] = demand_cons
    data["extraction_confidence"] = confidence

    note = (
        f"Reconciled: A(energy)={A}, B(additional)={B}, C(A+B)={C}, "
        f"D(misc)={D}, E(arrear/LPS)={E}, net={net}, rebate={rebate}, "
        f"payable_till_due={payable_till}. confidence={confidence}."
    )
    if warnings:
        note += " WARNINGS: " + " ".join(warnings)
    existing = data.get("raw_ocr_analysis_notes")
    data["raw_ocr_analysis_notes"] = (f"{existing} | " if existing else "") + note

    return data


# ---------------------------------------------------------------------------
# LLM extraction
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are an expert energy-bill data extractor. You receive an electricity bill (as an IMAGE and/or its OCR text) and return ONE valid JSON object describing it.

IMPORTANT OUTPUT DISCIPLINE: respond with ONLY the JSON object — no explanation, no reasoning, no markdown fences. Your entire reply is the JSON.

When BOTH an image and OCR text are provided:
- The OCR TEXT is AUTHORITATIVE for every numeric digit and amount. Copy amounts, consumptions, rates and readings VERBATIM from the OCR text — do not shorten, round, or drop digits. For example, if the OCR text shows an amount of 4653940, output 4653940 (NOT 465394).
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
- Capture EVERY row of the 'Bill Component' table: each charge line AND each subtotal row (Sno A, B, C, D, E, F, and any Rebate row), with sno, component_name, consumption, rate, unit, amount as printed.
- Classify each row by the SECTION HEADER it sits under (a row inherits the most recent header above it). The four categories, in printed order:
  * 'Current Demand and Energy Charges After Open Access' — Demand Charges + Energy Charges TOD-1..n; subtotal 'Total Energy Charges' (A).
  * 'Additional Charges' — excess-demand penalty + FPPA/fuel surcharge; subtotals 'Total Additional Charges' (B) and 'Total (A+B)' (C).
  * 'Miscellaneous Charges' — Other Misc.Charges/Assessment + Electricity Duty; subtotal 'Total Miscellaneous Charge' (D).
  * 'Arrear and LPS Charges' — Arrear + Surcharge LPS; subtotal 'Total Arrears & LPS' (E).
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
    # Native /api/chat is required: only it honors think=False to disable the
    # reasoning channel (the /v1 compat endpoint wastes the token budget on
    # hidden reasoning and returns empty content for gemma4).
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

            import json_repair
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
