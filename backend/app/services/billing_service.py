import re
import copy
import logging

logger = logging.getLogger(__name__)

# Category labels used on these bills, in printed order.
CAT_ENERGY = "Current Demand and Energy Charges After Open Access"
CAT_ADDITIONAL = "Additional Charges"
CAT_MISC = "Miscellaneous Charges"
CAT_ARREAR = "Arrear and LPS Charges"

# Standard tariff percentages for THIS bill format (PVVNL/UPPCL HV-2). Used ONLY
# as a fallback to compute FPPA (% of energy charges A) and Electricity Duty
# (% of the Demand+Energy subtotal C) when the percentage cannot be read off the
# bill. The amount is still derived from THIS bill's own A/C — not a fixed value
# — and the result is cross-checked against the printed net (flagged if it
# disagrees). Set to None to disable the fallback and rely only on the read %.
FPPA_PCT_DEFAULT = None
DUTY_PCT_DEFAULT = 7.5


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
    if "adjustment" in name_l or "adjust" in name_l or "due date" in name_l:
        return False
    return any(k in name_l for k in ("total", "net bill"))


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


def extract_raw_scraped_values(data: dict) -> dict:
    """
    Extracts the raw printed/scraped subtotal values from the bill data
    BEFORE any reconciliation or formula recalculation overwrites them.
    """
    components = data.get("bill_components") or []
    summary = data.get("billing_summary") or {}
    
    # 1. Demand charges (scraped)
    demand_charges = 0.0
    for c in components:
        name = str(c.get("component_name") or "").lower()
        if ("fixed" in name or "demand" in name) and not _is_subtotal(c.get("sno"), c.get("component_name")):
            demand_charges = _to_number(c.get("amount")) or 0.0
            break
            
    # 2. Energy charges (scraped)
    energy_charges = 0.0
    for c in components:
        name = str(c.get("component_name") or "").lower()
        if "tod" in name and not _is_subtotal(c.get("sno"), c.get("component_name")):
            energy_charges += _to_number(c.get("amount")) or 0.0
            
    # 3. Net Misc charges (scraped)
    fppa = 0.0
    rebate_adj = 0.0
    for c in components:
        name = str(c.get("component_name") or "").lower()
        if ("fppa" in name or "fuel" in name) and not _is_subtotal(c.get("sno"), c.get("component_name")):
            fppa = _to_number(c.get("amount")) or 0.0
        if ("due date rebate" in name or "rebate adjustment" in name) and not _is_subtotal(c.get("sno"), c.get("component_name")):
            rebate_adj = _to_number(c.get("amount")) or 0.0
            
    # Electricity duty (scraped)
    duty = 0.0
    for c in components:
        name = str(c.get("component_name") or "").lower()
        if ("duty" in name or "electricity duty" in name) and not _is_subtotal(c.get("sno"), c.get("component_name")):
            duty = _to_number(c.get("amount")) or 0.0
            break
            
    # Arrears (scraped)
    arrears = _to_number(summary.get("total_arrears_lps")) or 0.0
    for c in components:
        name = str(c.get("component_name") or "").lower()
        if "arrear" in name and not _is_subtotal(c.get("sno"), c.get("component_name")):
            arrears = _to_number(c.get("amount")) or 0.0
            break
            
    # Net Bill (scraped)
    net_bill = _to_number(summary.get("net_bill_amount")) or 0.0
    
    # Net Current Bill (scraped)
    if net_bill > 0:
        net_current = round(net_bill - arrears)
    else:
        net_current = round(demand_charges + energy_charges + duty + fppa + rebate_adj)
    if net_current < 0:
        net_current = 0.0
        
    # Rebate (scraped)
    rebate = _to_number(summary.get("rebate")) or 0.0
    
    # Payable till due date (scraped)
    payable_till = _to_number(summary.get("payable_till_due_date")) or 0.0
    
    return {
        "demand_charges": round(demand_charges),
        "energy_charges": round(energy_charges),
        "net_misc_charges": round(fppa + rebate_adj),
        "electricity_duty": round(duty),
        "net_current_bill": round(net_current),
        "arrear_amount": round(arrears),
        "final_payable_amount": round(net_bill),
        "rebate": round(rebate),
        "payable_till_due_date": round(payable_till)
    }


def reconcile_bill_data(data: dict, ocr_text: str | None = None) -> dict:
    """
    Deterministically fix the arithmetic of an extracted bill so the result is
    exact and internally consistent.
    """
    raw_scraped = extract_raw_scraped_values(copy.deepcopy(data))
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

    # --- 1a. Deduplicate UPPCL general "Misc. Charges" vs detailed breakdown items ---
    has_detailed_misc = any(
        any(k in str(c.get("component_name") or "").lower() for k in ("fppa", "surcharge", "rebate adjustment", "due date rebate"))
        for c in components if not _is_subtotal(c.get("sno"), c.get("component_name"))
    )
    if has_detailed_misc:
        new_components = []
        for c in components:
            name_l = str(c.get("component_name") or "").lower()
            sno_s = str(c.get("sno") or "").lower().strip()
            # If it is the general "Misc. Charges" or "Other Misc Charges" row, and we have details, filter it out
            if (sno_s == "misc" or not sno_s) and any(k in name_l for k in ("misc. charges", "misc charges", "other misc charges", "other miscellaneous charges")):
                continue
            new_components.append(c)
        components = new_components
        data["bill_components"] = components

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

    # --- 2c. Force credit components to be negative if they were transcribed as positive ---
    for c in components:
        if _is_subtotal(c.get("sno"), c.get("component_name")):
            continue
        name_l = str(c.get("component_name") or "").lower()
        if any(k in name_l for k in ("rebate adjustment", "due date rebate", "interest on security", "interest on advance payment", "compensation amt")):
            amt = _to_number(c.get("amount"))
            if amt is not None and amt > 0:
                c["amount"] = -amt

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
    if E == 0.0 and not hasE:
        ocr_arrear = None
        if ocr_text:
            m = re.search(r"(?:Arrear\s*Amount|बकाया\s*धनरािश)[^\d]*(\d+(?:\.\d+)?)", ocr_text, re.IGNORECASE)
            if m:
                ocr_arrear = float(m.group(1))
        if ocr_arrear is not None:
            E = ocr_arrear
        else:
            summary_obj = data.get("billing_summary")
            if isinstance(summary_obj, dict):
                E = _to_number(summary_obj.get("total_arrears_lps")) or 0.0
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
        fppa_pct_ocr = None
        if ocr_text:
            m = re.search(r"@\s*(\d+(?:\.\d+)?)\s*%", ocr_text)
            if m:
                fppa_pct_ocr = float(m.group(1))
        pct = _pct_in(fppa_line.get("component_name"), fppa_line.get("unit")) or fppa_pct_ocr or FPPA_PCT_DEFAULT
        if pct:
            # Bill amounts are whole rupees; round the derived FPPA to an integer
            # and make the remaining additional line the exact residual of B.
            fppa_amt = float(round(A * pct / 100.0))
            fppa_line["amount"] = fppa_amt
            other_add = [c for c in add_lines if c is not fppa_line]
            if len(other_add) == 1:
                other_add[0]["amount"] = float(round(B - fppa_amt))

    # --- 3a-2. Electricity Duty = stated % of C. The duty line records its base
    # as e.g. '7.5% Of (Demand & Energy Charges)'; computing from that % and the
    # validated C recovers the exact amount even when the printed figure is
    # garbled (this is more reliable than reading the large amount). ---
    misc_lines = [c for c in components
                  if c.get("category") == CAT_MISC
                  and not _is_subtotal(c.get("sno"), c.get("component_name"))]
    # Electricity Duty % comes from the line fields or, as a fallback, the OCR
    # text (the bill prints 'X% Of (Demand & Energy Charges)').
    duty_pct_ocr = None
    if ocr_text:
        m = re.search(r"(\d+(?:\.\d+)?)\s*%\s*of", ocr_text, re.IGNORECASE)
        if m:
            duty_pct_ocr = float(m.group(1))
    duty_recomputed = False
    for c in misc_lines:
        if "duty" in str(c.get("component_name") or "").lower():
            pct = _pct_in(c.get("rate"), c.get("unit"), c.get("component_name")) or duty_pct_ocr or DUTY_PCT_DEFAULT
            if pct:
                c["amount"] = float(round(C * pct / 100.0))
                duty_recomputed = True
    if duty_recomputed:
        D, hasD = section_sum(CAT_MISC)

    # --- 3a-3. Energy-line back-out: trust the validated Total Energy Charges A.
    # If the energy lines don't sum to A and exactly ONE line's amount is absent
    # from the OCR text (i.e. it was misread), correct it to A - sum(others) and
    # re-derive its rate. Recovers a single mis-read TOD amount exactly. ---
    energy_lines = [c for c in components
                    if c.get("category") == CAT_ENERGY
                    and not _is_subtotal(c.get("sno"), c.get("component_name"))]
    if A > 0 and energy_lines and ocr_numbers:
        esum = round(sum((_to_number(c.get("amount")) or 0) for c in energy_lines), 2)
        if abs(esum - A) > max(2.0, A * 0.001):
            suspects = [c for c in energy_lines
                        if str(int(_to_number(c.get("amount")) or 0)) not in ocr_numbers]
            if len(suspects) == 1:
                others = sum((_to_number(c.get("amount")) or 0)
                             for c in energy_lines if c is not suspects[0])
                fixed = float(round(A - others))
                suspects[0]["amount"] = fixed
                cons = _to_number(suspects[0].get("consumption"))
                if cons and cons > 0:
                    suspects[0]["rate"] = round(fixed / cons, 4)

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
    if printed_grand_total is None and ocr_text:
        # Match 'Payable Amount 11926601' or 'देय धनरािश/ Payable Amount 11926601'
        m = re.search(r"(?:Payable\s*Amount|देय\s*धनरािश)[^\d]*(\d+(?:\.\d+)?)", ocr_text, re.IGNORECASE)
        if m:
            printed_grand_total = float(m.group(1))
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
    # Snap computed net to printed net if they are within 2.0 (handles rounding differences)
    if printed_grand_total and printed_grand_total > 0 and abs(net - printed_grand_total) <= 2.0:
        net = printed_grand_total
    net_recovered = False
    ab_ok = (printed_C is None) or abs(printed_C - C) <= max(2.0, abs(printed_C) * 0.01)
    e_ok = (printed_E_row is None) or abs(printed_E_row - E) <= max(2.0, abs(printed_E_row) * 0.05)
    # Skip the net back-out when Duty was already computed from its stated
    # percentage (that is more reliable than a possibly-misread printed net).
    if printed_grand_total and printed_grand_total > 0 and ab_ok and e_ok and not duty_recomputed:
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
    if printed_grand_total and printed_grand_total > 0 and abs(net - printed_grand_total) <= 2.0:
        net = printed_grand_total

    # --- 4. Write reconciled subtotals back onto the subtotal rows. ---
    subtotal_values = {"A": A, "B": B, "C": C, "D": D, "E": E, "F": net}
    # A-row "consumption" = sum of the TOD energy units only (exclude the Demand
    # Charges line, whose 'consumption' is the KVA demand, not energy units).
    energy_cons_sum = round(sum(
        (_to_number(c.get("consumption")) or 0) for c in energy_lines
        if "demand" not in str(c.get("component_name") or "").lower()), 2)
    for c in components:
        sno_s = str(c.get("sno") or "").strip().upper().rstrip(".")
        if sno_s in subtotal_values:
            c["amount"] = subtotal_values[sno_s]
            # The Total Energy Charges (A) row's "consumption" cell is the sum of
            # the TOD energy units; recompute it from the line items.
            if sno_s == "A" and energy_cons_sum > 0:
                c["consumption"] = energy_cons_sum

    # --- 5. Rebate + payable figures. ---
    summary = data.get("billing_summary")
    if not isinstance(summary, dict):
        summary = {}
        data["billing_summary"] = summary

    printed_net_raw = summary.get("net_bill_amount")

    rebate = None
    if ocr_text:
        # Match 'Due Date Rebate ( ) 110945.13' or 'Due Date Rebate 110945.13'
        m = re.search(r"Due\s*Date\s*Rebate\s*(?:\([^)]*\))?\s*(\d+(?:\.\d+)?)", ocr_text, re.IGNORECASE)
        if m:
            rebate = float(m.group(1))

    if rebate is None:
        # If not found in OCR, fall back to check if LLM extracted a plausible rebate in summary or components
        llm_rebate = _to_number(summary.get("rebate"))
        if llm_rebate is not None and llm_rebate > 0 and llm_rebate != abs(E):
            rebate = llm_rebate
        else:
            for c in components:
                if "rebate" in str(c.get("component_name") or "").lower():
                    val = _to_number(c.get("amount"))
                    if val is not None and val > 0 and val != abs(E):
                        rebate = val
                        break

    if rebate is None:
        has_detailed_misc = any(
            any(k in str(c.get("component_name") or "").lower() for k in ("fppa", "due date rebate", "rebate adjustment"))
            for c in components if not _is_subtotal(c.get("sno"), c.get("component_name"))
        )
        if has_detailed_misc:
            rebate = round(C * 0.01)
        else:
            duty_amt = 0.0
            for c in components:
                if "duty" in str(c.get("component_name") or "").lower():
                    duty_amt = _to_number(c.get("amount")) or 0.0
                    break
            if not duty_amt:
                duty_amt = round(A * 0.10)
            rebate = round((A + duty_amt) * 0.01)

    payable_after = net
    payable_till = round(net - rebate, 2)

    # --- 6. Repopulate billing_summary from reconciled values. ---
    summary["total_energy_charges"] = A
    summary["total_additional_charges"] = B
    summary["total_miscellaneous_charges"] = D
    summary["total_arrears_lps"] = E
    summary["net_bill_amount"] = net
    summary["rebate"] = rebate
    summary["payable_till_due_date"] = payable_till
    summary["payable_after_due_date"] = payable_after

    # --- 7. Confidence check vs. printed net. ---
    printed_net = printed_grand_total or _to_number(printed_net_raw)

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

    # --- 8. Round monetary amounts to whole rupees (this bill format has no
    # paise), removing float artifacts like 4653940.4 from rate*consumption. ---
    def _round_money(v):
        n = _to_number(v)
        return float(round(n)) if n is not None else v

    for c in components:
        if c.get("amount") is not None:
            c["amount"] = _round_money(c.get("amount"))
    for k in ("total_energy_charges", "total_additional_charges", "total_miscellaneous_charges",
              "total_arrears_lps", "net_bill_amount", "rebate",
              "payable_till_due_date", "payable_after_due_date"):
        if summary.get(k) is not None:
            summary[k] = _round_money(summary.get(k))

    # Run the exact 5-step billing formulas calculation to snap all components and summaries
    calc_res = calculate_bill_formulas(data, raw_scraped=raw_scraped)
    data = calc_res["data"]
    # Store backend audit calculations so frontend can access them directly without recalculating
    data["audit_calculations"] = calc_res["calculations"]

    return data


def calculate_bill_formulas(data: dict, raw_scraped: dict | None = None) -> dict:
    """
    Recalculates the bill components, reading tables, and billing summary
    using the user's exact 5-step formulas.
    Returns a dict with:
      "data": updated data dict (with updated totals/subtotals)
      "calculations": dict containing step-by-step values (scraped & calculated)
    """
    if raw_scraped is None:
        raw_scraped = extract_raw_scraped_values(data)

    # 1. Recalculate Reading Tables (Present - Past = Difference, Difference * MF = Total KWH)
    for table in data.get("reading_tables") or []:
        for r in table.get("readings") or []:
            present = _to_number(r.get("present_reading"))
            past = _to_number(r.get("past_reading"))
            if present is not None and past is not None:
                r["difference"] = round(present - past, 3)
            diff = _to_number(r.get("difference"))
            mf = _to_number(r.get("multiplying_factor"))
            if diff is not None and mf is not None:
                r["total_consumption"] = round(diff * mf, 2)

    # 2. Recalculate Bill Component Amounts (Consumption * rate = Amount)
    components = data.get("bill_components") or []
    for c in components:
        if _is_subtotal(c.get("sno"), c.get("component_name")):
            continue
        cons = _to_number(c.get("consumption"))
        rate = _to_number(c.get("rate"))
        if cons is not None and rate is not None and cons > 0 and rate > 0:
            c["amount"] = round(cons * rate)

    # 3. Step A: Contracted Demand Charges
    demand_charges = 0.0
    billed_demand = 0.0
    demand_rate = 0.0
    demand_comp = None
    for c in components:
        name = str(c.get("component_name") or "").lower()
        if ("fixed" in name or "demand" in name) and not _is_subtotal(c.get("sno"), c.get("component_name")):
            demand_comp = c
            break
    if demand_comp:
        demand_rate = _to_number(demand_comp.get("rate")) or 0.0
        billed_demand = _to_number(demand_comp.get("consumption")) or 0.0
        demand_charges = round(billed_demand * demand_rate)
        demand_comp["amount"] = demand_charges
    else:
        bd = data.get("billing_details") or {}
        billed_demand = _to_number(bd.get("billable_demand_kva")) or 0.0
        demand_charges = round(billed_demand * 290.0)

    # Step B: Energy Charges (ToD Based)
    energy_charges = 0.0
    for c in components:
        name = str(c.get("component_name") or "").lower()
        if "tod" in name and not _is_subtotal(c.get("sno"), c.get("component_name")):
            energy_charges += _to_number(c.get("amount")) or 0.0
    energy_charges = round(energy_charges)

    # Step C: Net Miscellaneous Charges
    fppa_surcharge = 0.0
    for c in components:
        name = str(c.get("component_name") or "").lower()
        if ("fppa" in name or "fuel" in name) and not _is_subtotal(c.get("sno"), c.get("component_name")):
            fppa_surcharge = _to_number(c.get("amount")) or 0.0
            break

    rebate_adjustment = 0.0
    for c in components:
        name = str(c.get("component_name") or "").lower()
        if ("due date rebate" in name or "rebate adjustment" in name) and not _is_subtotal(c.get("sno"), c.get("component_name")):
            rebate_adjustment = _to_number(c.get("amount")) or 0.0
            break

    net_misc_charges = round(fppa_surcharge + rebate_adjustment)

    # Step D: Net Current Bill
    electricity_duty = 0.0
    for c in components:
        name = str(c.get("component_name") or "").lower()
        if ("duty" in name or "electricity duty" in name) and not _is_subtotal(c.get("sno"), c.get("component_name")):
            electricity_duty = _to_number(c.get("amount")) or 0.0
            break

    net_current_bill = round(demand_charges + energy_charges + electricity_duty + net_misc_charges)

    # Step E: Final Payable Amount
    arrear_amount = 0.0
    for c in components:
        name = str(c.get("component_name") or "").lower()
        if "arrear" in name and not _is_subtotal(c.get("sno"), c.get("component_name")):
            arrear_amount = _to_number(c.get("amount")) or 0.0
            break
    if arrear_amount == 0.0:
        summary = data.get("billing_summary") or {}
        arrear_amount = _to_number(summary.get("total_arrears_lps")) or 0.0

    original_summary = data.get("billing_summary") or {}
    original_net = _to_number(original_summary.get("net_bill_amount"))

    final_payable = round(net_current_bill + arrear_amount)

    # Snap calculated final payable to original net bill if close (handles component rounding discrepancies)
    if original_net and original_net > 0 and abs(final_payable - original_net) <= 2.0:
        final_payable = round(original_net)

    # Prompt Payment Rebate
    has_detailed_misc = any(
        any(k in str(c.get("component_name") or "").lower() for k in ("fppa", "due date rebate", "rebate adjustment"))
        for c in components if not _is_subtotal(c.get("sno"), c.get("component_name"))
    )
    if has_detailed_misc:
        rebate = round((demand_charges + energy_charges + fppa_surcharge) * 0.01)
    else:
        rebate = round((demand_charges + energy_charges + electricity_duty) * 0.01)

    payable_till_due = round(final_payable - rebate)

    # Update all subtotal rows in components list
    for c in components:
        sno = str(c.get("sno") or "").strip().upper().rstrip(".")
        name = str(c.get("component_name") or "").strip().upper()

        if sno == "A" or "TOTAL ENERGY" in name:
            c["amount"] = round(demand_charges + energy_charges)
        elif sno == "B" or "TOTAL ADDITIONAL" in name:
            c["amount"] = round(fppa_surcharge)
        elif sno == "C" or "TOTAL (A+B)" in name:
            c["amount"] = round(demand_charges + energy_charges + fppa_surcharge)
        elif sno == "D" or "TOTAL MISCELLANEOUS" in name:
            c["amount"] = round(electricity_duty + rebate_adjustment)
        elif sno == "E" or "TOTAL ARREARS" in name:
            c["amount"] = round(arrear_amount)
        elif sno == "F" or sno == "TOTAL" or name == "TOTAL" or "GRAND TOTAL" in name or "NET BILL AMOUNT" in name:
            c["amount"] = final_payable

    # Update summary dict
    summary = data.get("billing_summary") or {}
    summary["total_energy_charges"] = round(demand_charges + energy_charges)
    summary["total_additional_charges"] = round(fppa_surcharge)
    summary["total_miscellaneous_charges"] = round(electricity_duty + rebate_adjustment)
    summary["total_arrears_lps"] = round(arrear_amount)
    summary["net_bill_amount"] = final_payable
    summary["rebate"] = rebate
    summary["payable_till_due_date"] = payable_till_due
    summary["payable_after_due_date"] = final_payable
    data["billing_summary"] = summary

    # Snap/sync billing details billable demand
    bd = data.get("billing_details")
    if isinstance(bd, dict) and billed_demand > 0:
        bd["billable_demand_kva"] = billed_demand

    return {
        "data": data,
        "calculations": {
            "scraped": raw_scraped,
            "calculated": {
                "demand_charges": demand_charges,
                "billed_demand": billed_demand,
                "demand_rate": demand_rate,
                "energy_charges": energy_charges,
                "fppa_surcharge": fppa_surcharge,
                "rebate_adjustment": rebate_adjustment,
                "net_misc_charges": net_misc_charges,
                "electricity_duty": electricity_duty,
                "net_current_bill": net_current_bill,
                "arrear_amount": arrear_amount,
                "final_payable_amount": final_payable,
                "rebate": rebate,
                "payable_till_due_date": payable_till_due
            }
        }
    }
