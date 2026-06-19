export interface CustomerDetails {
  name: string | null;
  billing_address: string | null;
  service_address: string | null;
}

export interface BillingPeriod {
  start_date: string | null;
  end_date: string | null;
}

export interface BillingDetails {
  account_number: string | null;
  meter_number: string | null;
  invoice_number: string | null;
  bill_date: string | null;
  due_date: string | null;
  discont_date: string | null;
  billing_period: BillingPeriod | null;
  contracted_demand_kva: number | null;
  billable_demand_kva: number | null;
  tariff_code: string | null;
  supply_voltage: string | null;
}

export interface TodReading {
  zone_name: string | null;
  present_reading: number | null;
  past_reading: number | null;
  difference: number | null;
  multiplying_factor: number | null;
  total_consumption: number | null;
}

export interface ReadingTable {
  reading_from: string | null;
  readings: TodReading[] | null;
}

export interface BillComponentItem {
  sno: string | null;
  category: string | null;
  component_name: string | null;
  consumption: number | null;
  rate: number | null;
  unit: string | null;
  amount: number | null;
}

export interface BillingSummary {
  total_energy_charges: number | null;
  total_additional_charges: number | null;
  total_miscellaneous_charges: number | null;
  total_arrears_lps: number | null;
  net_bill_amount: number | null;
  rebate: number | null;
  payable_till_due_date: number | null;
  payable_after_due_date: number | null;
}

export interface CalculatedSummary {
  total_energy_charges: number;
  total_additional_charges: number;
  total_miscellaneous_charges: number;
  total_arrears_lps: number;
  net_bill_amount: number;
  rebate: number;
  payable_till_due_date: number;
  payable_after_due_date: number;
  
  // 5-step user formulas
  demand_charges: number;
  billed_demand: number;
  demand_rate: number;
  energy_charges: number;
  fppa_surcharge: number;
  rebate_adjustment: number;
  net_misc_charges: number;
  electricity_duty: number;
  net_current_bill: number;
  arrear_amount: number;
  final_payable_amount: number;

  scraped?: {
    demand_charges: number;
    energy_charges: number;
    net_misc_charges: number;
    net_current_bill: number;
    final_payable_amount: number;
    rebate: number;
    payable_till_due_date: number;
  } | null;
  calculated?: {
    demand_charges: number;
    billed_demand: number;
    demand_rate: number;
    energy_charges: number;
    fppa_surcharge: number;
    rebate_adjustment: number;
    net_misc_charges: number;
    electricity_duty: number;
    net_current_bill: number;
    arrear_amount: number;
    final_payable_amount: number;
    rebate: number;
    payable_till_due_date: number;
  } | null;
}

export interface BillData {
  utility_provider: string | null;
  customer_details: CustomerDetails | null;
  billing_details: BillingDetails | null;
  reading_tables: ReadingTable[] | null;
  bill_components: BillComponentItem[] | null;
  billing_summary: BillingSummary | null;
  raw_ocr_analysis_notes: string | null;
  extraction_confidence?: string | null;
  audit_calculations?: {
    scraped: {
      demand_charges: number;
      energy_charges: number;
      net_misc_charges: number;
      net_current_bill: number;
      final_payable_amount: number;
      rebate: number;
      payable_till_due_date: number;
    } | null;
    calculated: {
      demand_charges: number;
      billed_demand: number;
      demand_rate: number;
      energy_charges: number;
      fppa_surcharge: number;
      rebate_adjustment: number;
      net_misc_charges: number;
      electricity_duty: number;
      net_current_bill: number;
      arrear_amount: number;
      final_payable_amount: number;
      rebate: number;
      payable_till_due_date: number;
    } | null;
  } | null;
}

export interface AnalysisResponse {
  success: boolean;
  raw_text: string;
  data: BillData;
  image_data_url?: string | null;
  metadata: {
    filename: string;
    content_type: string;
    model: string;
    processing_time_seconds: number;
    used_vision?: boolean;
  };
}
