from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class CustomerDetails(BaseModel):
    name: Optional[str] = None
    billing_address: Optional[str] = None
    service_address: Optional[str] = None

class BillingPeriod(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class BillingDetails(BaseModel):
    account_number: Optional[str] = None
    meter_number: Optional[str] = None
    invoice_number: Optional[str] = None
    bill_date: Optional[str] = None
    due_date: Optional[str] = None
    discont_date: Optional[str] = None
    billing_period: Optional[BillingPeriod] = None
    contracted_demand_kva: Optional[float] = None
    billable_demand_kva: Optional[float] = None
    tariff_code: Optional[str] = None
    supply_voltage: Optional[str] = None

class TodReading(BaseModel):
    zone_name: Optional[str] = None
    present_reading: Optional[float] = None
    past_reading: Optional[float] = None
    difference: Optional[float] = None
    multiplying_factor: Optional[float] = None
    total_consumption: Optional[float] = None

class ReadingTable(BaseModel):
    reading_from: Optional[str] = None
    readings: Optional[List[TodReading]] = None

class BillComponentItem(BaseModel):
    sno: Optional[str] = None
    category: Optional[str] = None
    component_name: Optional[str] = None
    consumption: Optional[float] = None
    rate: Optional[float] = None
    unit: Optional[str] = None
    amount: Optional[float] = None

class BillingSummary(BaseModel):
    total_energy_charges: Optional[float] = None
    total_additional_charges: Optional[float] = None
    total_miscellaneous_charges: Optional[float] = None
    total_arrears_lps: Optional[float] = None
    net_bill_amount: Optional[float] = None
    rebate: Optional[float] = None
    payable_till_due_date: Optional[float] = None
    payable_after_due_date: Optional[float] = None

class BillData(BaseModel):
    utility_provider: Optional[str] = None
    customer_details: Optional[CustomerDetails] = None
    billing_details: Optional[BillingDetails] = None
    reading_tables: Optional[List[ReadingTable]] = None
    bill_components: Optional[List[BillComponentItem]] = None
    billing_summary: Optional[BillingSummary] = None
    raw_ocr_analysis_notes: Optional[str] = None
    extraction_confidence: Optional[str] = None
    audit_calculations: Optional[Dict[str, Any]] = None

class RecalculateRequest(BaseModel):
    data: BillData

class RecalculateResponse(BaseModel):
    success: bool
    data: BillData
    calculations: Dict[str, Any]

class AnalysisResponse(BaseModel):
    success: bool
    raw_text: str
    data: BillData
    image_data_url: Optional[str] = None
    metadata: Dict[str, Any]
