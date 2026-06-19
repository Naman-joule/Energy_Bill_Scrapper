import { useState, useEffect, useRef } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { 
  Zap, 
  CloudUpload, 
  FileText, 
  X, 
  Cpu, 
  Sparkles, 
  Building, 
  User, 
  Calendar, 
  Activity, 
  Receipt, 
  Info, 
  Clock, 
  File as FileIcon,
  Download,
  Upload,
  Calculator,
  CheckCircle2
} from 'lucide-react';
import './App.css';

// --- Interfaces for Strong Typing ---
interface CustomerDetails {
  name: string | null;
  billing_address: string | null;
  service_address: string | null;
}

interface BillingPeriod {
  start_date: string | null;
  end_date: string | null;
}

interface BillingDetails {
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

interface TodReading {
  zone_name: string | null;
  present_reading: number | null;
  past_reading: number | null;
  difference: number | null;
  multiplying_factor: number | null;
  total_consumption: number | null;
}

interface ReadingTable {
  reading_from: string | null;
  readings: TodReading[] | null;
}

interface BillComponentItem {
  sno: string | null;
  category: string | null;
  component_name: string | null;
  consumption: number | null;
  rate: number | null;
  unit: string | null;
  amount: number | null;
}

interface BillingSummary {
  total_energy_charges: number | null;
  total_additional_charges: number | null;
  total_miscellaneous_charges: number | null;
  total_arrears_lps: number | null;
  net_bill_amount: number | null;
  rebate: number | null;
  payable_till_due_date: number | null;
  payable_after_due_date: number | null;
}

interface CalculatedSummary {
  total_energy_charges: number;
  total_additional_charges: number;
  total_miscellaneous_charges: number;
  total_arrears_lps: number;
  net_bill_amount: number;
  rebate: number;
  payable_till_due_date: number;
  payable_after_due_date: number;
}

interface BillData {
  utility_provider: string | null;
  customer_details: CustomerDetails | null;
  billing_details: BillingDetails | null;
  reading_tables: ReadingTable[] | null;
  bill_components: BillComponentItem[] | null;
  billing_summary: BillingSummary | null;
  raw_ocr_analysis_notes: string | null;
  extraction_confidence?: string | null;
}

interface AnalysisResponse {
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

function App() {
  // --- States ---
  const [models, setModels] = useState<string[]>(['gemma4:12b']);
  const [selectedModel, setSelectedModel] = useState<string>('gemma4:12b');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  
  // Loading & Step states
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<'ocr' | 'llm' | 'parse' | 'done'>('ocr');
  
  // Results
  const [results, setResults] = useState<AnalysisResponse | null>(null);
  const [editableData, setEditableData] = useState<BillData | null>(null);
  const [activeTab, setActiveTab] = useState<'image' | 'ocr' | 'json'>('image');
  const [viewMode, setViewMode] = useState<'statement' | 'metrics'>('statement');
  const [showVerifyModal, setShowVerifyModal] = useState<boolean>(false);
  const [calculatedSummary, setCalculatedSummary] = useState<CalculatedSummary | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---
  useEffect(() => {
    fetchModels();
  }, []);

  // Create/revoke an object-URL preview of the uploaded file so the UI can show
  // the whole image even before/without the backend echoing it back.
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const fetchModels = async () => {
    try {
      const response = await fetch('/api/models');
      if (response.ok) {
        const data = await response.json();
        if (data.models && data.models.length > 0) {
          setModels(data.models);
          // Prefer gemma4:12b — it is far more accurate than e4b on the dense
          // bill table; e4b drops fields and breaks the schema.
          if (data.models.includes('gemma4:12b')) {
            setSelectedModel('gemma4:12b');
          } else {
            setSelectedModel(data.models[0]);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching available models:', error);
    }
  };

  // --- File Drag & Drop ---
  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      alert('Unsupported file format. Please upload JPEG, PNG, or PDF.');
      return;
    }
    setSelectedFile(file);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setResults(null);
    setEditableData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // --- API Submission ---
  const runAnalysis = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setLoadingStep('ocr');
    setResults(null);

    // Setup timers for simulated step updates
    const ocrTimer = setTimeout(() => {
      setLoadingStep('llm');
    }, 4500);

    const llmTimer = setTimeout(() => {
      setLoadingStep('parse');
    }, 15000);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('model', selectedModel);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData
      });

      clearTimeout(ocrTimer);
      clearTimeout(llmTimer);

      const result = await response.json();

      if (response.ok) {
        setLoadingStep('done');
        setTimeout(() => {
          setLoading(false);
          setResults(result);
          setEditableData(result.data);
        }, 800);
      } else {
        if (response.status === 502) {
          setLoading(false);
          alert(`Analysis Warning: OCR extracted the text, but the LLM failed to structure it.\nError: ${result.detail}`);
          setResults({
            success: false,
            raw_text: result.raw_text,
            data: { 
              utility_provider: null,
              customer_details: null,
              billing_details: null,
              reading_tables: null,
              bill_components: null,
              billing_summary: null,
              raw_ocr_analysis_notes: `LLM Error: ${result.detail}. View 'Raw OCR Text' tab for manual review.` 
            },
            metadata: result.metadata
          });
        } else {
          throw new Error(result.detail || 'Server error occurred during analysis.');
        }
      }
    } catch (error: any) {
      clearTimeout(ocrTimer);
      clearTimeout(llmTimer);
      setLoading(false);
      alert(`Error running analysis: ${error.message}`);
    }
  };

  // --- Inline Editing Event Handlers ---
  const handleCustomerChange = (field: keyof CustomerDetails, value: string | null) => {
    if (!editableData) return;
    setEditableData({
      ...editableData,
      customer_details: {
        ...editableData.customer_details,
        [field]: value
      } as CustomerDetails
    });
  };

  const handleBillingDetailsChange = (field: keyof BillingDetails, value: any) => {
    if (!editableData) return;
    setEditableData({
      ...editableData,
      billing_details: {
        ...editableData.billing_details,
        [field]: value
      } as BillingDetails
    });
  };

  const handleBillingPeriodChange = (field: keyof BillingPeriod, value: string | null) => {
    if (!editableData || !editableData.billing_details) return;
    setEditableData({
      ...editableData,
      billing_details: {
        ...editableData.billing_details,
        billing_period: {
          ...editableData.billing_details.billing_period,
          [field]: value
        }
      } as BillingDetails
    });
  };

  const handleReadingChange = (tableIdx: number, readingIdx: number, field: keyof TodReading, value: any) => {
    if (!editableData || !editableData.reading_tables) return;
    const newTables = [...editableData.reading_tables];
    if (!newTables[tableIdx].readings) return;
    const newReadings = [...newTables[tableIdx].readings!];
    
    let parsedVal = value;
    if (field !== 'zone_name' && value !== '') {
      parsedVal = parseFloat(value);
      if (isNaN(parsedVal)) parsedVal = null;
    }
    
    newReadings[readingIdx] = {
      ...newReadings[readingIdx],
      [field]: parsedVal
    };
    
    // Auto-compute difference and total if applicable
    if (field === 'present_reading' || field === 'past_reading') {
      const pres = field === 'present_reading' ? parsedVal : newReadings[readingIdx].present_reading;
      const past = field === 'past_reading' ? parsedVal : newReadings[readingIdx].past_reading;
      if (pres !== null && past !== null) {
        newReadings[readingIdx].difference = Number((pres - past).toFixed(3));
      }
    }
    
    if (field === 'difference' || field === 'multiplying_factor' || field === 'present_reading' || field === 'past_reading') {
      const diff = newReadings[readingIdx].difference;
      const mf = newReadings[readingIdx].multiplying_factor;
      if (diff !== null && mf !== null) {
        newReadings[readingIdx].total_consumption = Number((diff * mf).toFixed(2));
      }
    }

    newTables[tableIdx] = {
      ...newTables[tableIdx],
      readings: newReadings
    };
    
    setEditableData({
      ...editableData,
      reading_tables: newTables
    });
  };

  const handleReadingTableRangeChange = (tableIdx: number, value: string | null) => {
    if (!editableData || !editableData.reading_tables) return;
    const newTables = [...editableData.reading_tables];
    newTables[tableIdx] = {
      ...newTables[tableIdx],
      reading_from: value
    };
    setEditableData({
      ...editableData,
      reading_tables: newTables
    });
  };

  const handleComponentChange = (idx: number, field: keyof BillComponentItem, value: any) => {
    if (!editableData || !editableData.bill_components) return;
    const newComponents = [...editableData.bill_components];
    
    let parsedVal = value;
    if (['consumption', 'rate', 'amount'].includes(field) && value !== '') {
      parsedVal = parseFloat(value);
      if (isNaN(parsedVal)) parsedVal = null;
    }
    
    newComponents[idx] = {
      ...newComponents[idx],
      [field]: parsedVal
    };
    
    // Auto-calculate amount if consumption and rate change
    if (field === 'consumption' || field === 'rate') {
      const cons = field === 'consumption' ? parsedVal : newComponents[idx].consumption;
      const rate = field === 'rate' ? parsedVal : newComponents[idx].rate;
      if (cons !== null && rate !== null) {
        newComponents[idx].amount = Number((cons * rate).toFixed(2));
      }
    }

    setEditableData({
      ...editableData,
      bill_components: newComponents
    });
  };

  const handleBillingSummaryChange = (field: keyof BillingSummary, value: any) => {
    if (!editableData || !editableData.billing_summary) return;
    let parsedVal = value;
    if (value !== '') {
      parsedVal = parseFloat(value);
      if (isNaN(parsedVal)) parsedVal = null;
    }
    setEditableData({
      ...editableData,
      billing_summary: {
        ...editableData.billing_summary,
        [field]: parsedVal
      }
    });
  };

  const addComponentRow = (defaultCategory?: string) => {
    if (!editableData) return;
    const newComponents = [...(editableData.bill_components || [])];
    newComponents.push({
      sno: "",
      category: defaultCategory || "Current Demand and Energy Charges After Open Access",
      component_name: "New Charge Component",
      consumption: null,
      rate: null,
      unit: "",
      amount: null
    });
    setEditableData({
      ...editableData,
      bill_components: newComponents
    });
  };

  const removeComponentRow = (idx: number) => {
    if (!editableData || !editableData.bill_components) return;
    const newComponents = editableData.bill_components.filter((_, i) => i !== idx);
    setEditableData({
      ...editableData,
      bill_components: newComponents
    });
  };

  const performBillCalculation = () => {
    if (!editableData) return;

    // 1. Recalculate Reading Tables (Present - Past = Difference, Difference * MF = Total KWH)
    const updatedReadingTables = editableData.reading_tables ? editableData.reading_tables.map(table => {
      if (!table.readings) return table;
      const updatedReadings = table.readings.map(reading => {
        let diff = reading.difference;
        if (reading.present_reading !== null && reading.past_reading !== null) {
          diff = Number((reading.present_reading - reading.past_reading).toFixed(3));
        }
        let total = reading.total_consumption;
        if (diff !== null && reading.multiplying_factor !== null) {
          total = Number((diff * reading.multiplying_factor).toFixed(2));
        }
        return {
          ...reading,
          difference: diff,
          total_consumption: total
        };
      });
      return { ...table, readings: updatedReadings };
    }) : null;

    // Helper to identify subtotal rows
    const isSubtotalRow = (comp: BillComponentItem) => {
      const sno = (comp.sno || '').toUpperCase().trim();
      const name = (comp.component_name || '').toUpperCase().trim();
      return ['A', 'B', 'C', 'D', 'E', 'F', 'TOTAL'].includes(sno) || name.includes('TOTAL') || name.includes('SUBTOTAL');
    };

    // 2. Recalculate Bill Component Amounts (Consumption * rate = Amount)
    const recalculatedComponents = editableData.bill_components ? editableData.bill_components.map(comp => {
      if (isSubtotalRow(comp)) return comp;
      let amt = comp.amount;
      if (comp.consumption !== null && comp.rate !== null) {
        amt = Number((comp.consumption * comp.rate).toFixed(2));
      }
      return { ...comp, amount: amt };
    }) : [];

    // 3. Compute Category Sums
    let energy = 0;
    let additional = 0;
    let misc = 0;
    let arrears = 0;
    let dutyAmount = 0;

    recalculatedComponents.forEach(comp => {
      if (isSubtotalRow(comp)) return;

      const amt = comp.amount || 0;
      const cat = (comp.category || '').toLowerCase().trim();

      if (cat === 'current demand and energy charges after open access' || cat.includes('demand') || cat.includes('energy')) {
        energy += amt;
      } else if (cat === 'additional charges' || cat.includes('additional')) {
        additional += amt;
      } else if (cat === 'miscellaneous charges' || cat.includes('misc') || cat.includes('miscellaneous')) {
        misc += amt;
        // Locate duty amount under miscellaneous charges
        const name = (comp.component_name || '').toLowerCase();
        if (name.includes('duty') || name.includes('electricity duty')) {
          dutyAmount = amt;
        }
      } else if (cat === 'arrear and lps charges' || cat.includes('arrear') || cat.includes('lps')) {
        arrears += amt;
      }
    });

    const finalDuty = dutyAmount || Number((energy * 0.10).toFixed(2));

    // Rebate calculation:
    // UPPCL (New PDF): 1% of subtotal C (Energy + Additional)
    // PVVNL (Old Image): 1% of (Energy + Duty)
    const hasDetailedMisc = recalculatedComponents ? recalculatedComponents.some(comp => {
      const sno = (comp.sno || '').toUpperCase().trim();
      const name = (comp.component_name || '').toUpperCase().trim();
      const isSubtotal = ['A', 'B', 'C', 'D', 'E', 'F', 'TOTAL'].includes(sno) || name.includes('TOTAL') || name.includes('SUBTOTAL');
      if (isSubtotal) return false;
      const nameLower = name.toLowerCase();
      return nameLower.includes('fppa') || nameLower.includes('due date rebate') || nameLower.includes('adjustment');
    }) : false;

    const rebate = hasDetailedMisc 
      ? Math.round((energy + additional) * 0.01)
      : Math.round((energy + finalDuty) * 0.01);

    // Formulas:
    // Total (A+B) = Total Energy Charges + Total Additional Charges
    const netA_B = Number((energy + additional).toFixed(2));
    
    // Total (A+B+C+D+E) = Total (A+B) + Total Miscellaneous Charge + Total Arrears & LPS
    const netBill = Number((netA_B + misc + arrears).toFixed(2));
    
    const payableTillDue = Number((netBill - rebate).toFixed(2));
    const payableAfterDue = netBill;

    // 4. Update the subtotal rows in components list to match calculated values
    const finalComponents = recalculatedComponents.map(comp => {
      const sno = (comp.sno || '').toUpperCase().trim();
      const name = (comp.component_name || '').toUpperCase().trim();

      if (sno === 'A' || name.includes('TOTAL ENERGY')) {
        return { ...comp, amount: Number(energy.toFixed(2)) };
      }
      if (sno === 'B' || name.includes('TOTAL ADDITIONAL')) {
        return { ...comp, amount: Number(additional.toFixed(2)) };
      }
      if (sno === 'C' || name.includes('TOTAL (A+B)')) {
        return { ...comp, amount: netA_B };
      }
      if (sno === 'D' || name.includes('TOTAL MISCELLANEOUS')) {
        return { ...comp, amount: Number(misc.toFixed(2)) };
      }
      if (sno === 'E' || name.includes('TOTAL ARREARS')) {
        return { ...comp, amount: Number(arrears.toFixed(2)) };
      }
      if (sno === 'F' || sno === 'TOTAL' || name === 'TOTAL' || name.includes('GRAND TOTAL') || name.includes('NET BILL AMOUNT')) {
        return { ...comp, amount: netBill };
      }
      return comp;
    });

    const summary: CalculatedSummary = {
      total_energy_charges: Number(energy.toFixed(2)),
      total_additional_charges: Number(additional.toFixed(2)),
      total_miscellaneous_charges: Number(misc.toFixed(2)),
      total_arrears_lps: Number(arrears.toFixed(2)),
      net_bill_amount: netBill,
      rebate: rebate,
      payable_till_due_date: payableTillDue,
      payable_after_due_date: payableAfterDue
    };

    setCalculatedSummary(summary);
    setShowVerifyModal(true);

    // Apply reading/component row level recalculations immediately to screen
    setEditableData({
      ...editableData,
      reading_tables: updatedReadingTables,
      bill_components: finalComponents
    });
  };

  const applyCalculatedTotals = () => {
    if (!editableData || !calculatedSummary) return;

    // Apply calculated summary totals to state
    const newSummary: BillingSummary = {
      total_energy_charges: calculatedSummary.total_energy_charges,
      total_additional_charges: calculatedSummary.total_additional_charges,
      total_miscellaneous_charges: calculatedSummary.total_miscellaneous_charges,
      total_arrears_lps: calculatedSummary.total_arrears_lps,
      net_bill_amount: calculatedSummary.net_bill_amount,
      rebate: calculatedSummary.rebate,
      payable_till_due_date: calculatedSummary.payable_till_due_date,
      payable_after_due_date: calculatedSummary.payable_after_due_date
    };

    setEditableData({
      ...editableData,
      billing_summary: newSummary
    });

    setShowVerifyModal(false);
  };

  // --- CSV Export & Import ---
  const exportToCSV = () => {
    if (!editableData) return;

    const rows: string[][] = [];

    rows.push(['Utility Provider', editableData.utility_provider || '']);
    rows.push([]);

    rows.push(['Customer Details']);
    rows.push(['Name', editableData.customer_details?.name || '']);
    rows.push(['Billing Address', editableData.customer_details?.billing_address || '']);
    rows.push(['Service Address', editableData.customer_details?.service_address || '']);
    rows.push([]);

    rows.push(['Billing Details']);
    rows.push(['Account Number', editableData.billing_details?.account_number || '']);
    rows.push(['Meter Number', editableData.billing_details?.meter_number || '']);
    rows.push(['Invoice Number', editableData.billing_details?.invoice_number || '']);
    rows.push(['Bill Date', editableData.billing_details?.bill_date || '']);
    rows.push(['Due Date', editableData.billing_details?.due_date || '']);
    rows.push(['Discont Date', editableData.billing_details?.discont_date || '']);
    rows.push(['Billing Period Start', editableData.billing_details?.billing_period?.start_date || '']);
    rows.push(['Billing Period End', editableData.billing_details?.billing_period?.end_date || '']);
    rows.push(['Contracted Demand (KVA)', String(editableData.billing_details?.contracted_demand_kva ?? '')]);
    rows.push(['Billable Demand (KVA)', String(editableData.billing_details?.billable_demand_kva ?? '')]);
    rows.push(['Tariff Code', editableData.billing_details?.tariff_code || '']);
    rows.push(['Supply Voltage', editableData.billing_details?.supply_voltage || '']);
    rows.push([]);

    if (editableData.reading_tables && editableData.reading_tables.length > 0) {
      editableData.reading_tables.forEach((table, idx) => {
        rows.push([`Reading Table ${idx + 1}`, `Period: ${table.reading_from || ''}`]);
        rows.push(['Zone Name', 'Present Reading', 'Past Reading', 'Difference', 'Multiplying Factor', 'Total Consumption']);
        if (table.readings) {
          table.readings.forEach(reading => {
            rows.push([
              reading.zone_name || '',
              String(reading.present_reading ?? ''),
              String(reading.past_reading ?? ''),
              String(reading.difference ?? ''),
              String(reading.multiplying_factor ?? ''),
              String(reading.total_consumption ?? '')
            ]);
          });
        }
        rows.push([]);
      });
    }

    rows.push(['Bill Components']);
    rows.push(['Sno', 'Category', 'Component Name', 'Consumption', 'Rate', 'Unit', 'Amount (Rs.)']);
    if (editableData.bill_components) {
      editableData.bill_components.forEach(comp => {
        rows.push([
          comp.sno || '',
          comp.category || '',
          comp.component_name || '',
          String(comp.consumption ?? ''),
          String(comp.rate ?? ''),
          comp.unit || '',
          String(comp.amount ?? '')
        ]);
      });
    }
    rows.push([]);

    rows.push(['Billing Summary']);
    rows.push(['Total Energy Charges', String(editableData.billing_summary?.total_energy_charges ?? '')]);
    rows.push(['Total Additional Charges', String(editableData.billing_summary?.total_additional_charges ?? '')]);
    rows.push(['Total Miscellaneous Charges', String(editableData.billing_summary?.total_miscellaneous_charges ?? '')]);
    rows.push(['Total Arrears & LPS', String(editableData.billing_summary?.total_arrears_lps ?? '')]);
    rows.push(['Net Bill Amount', String(editableData.billing_summary?.net_bill_amount ?? '')]);
    rows.push(['Rebate', String(editableData.billing_summary?.rebate ?? '')]);
    rows.push(['Payable Till Due Date', String(editableData.billing_summary?.payable_till_due_date ?? '')]);
    rows.push(['Payable After Due Date', String(editableData.billing_summary?.payable_after_due_date ?? '')]);

    const escapeCell = (cell: string): string => {
      const s = String(cell);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const csvContent = rows.map(row => row.map(escapeCell).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const acctNo = editableData.billing_details?.account_number || 'export';
    link.download = `energy_bill_${acctNo}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importFromCSV = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      try {
        const parseCSVLine = (line: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let ci = 0; ci < line.length; ci++) {
            if (line[ci] === '"') {
              if (inQuotes && line[ci + 1] === '"') {
                current += '"';
                ci++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (line[ci] === ',' && !inQuotes) {
              result.push(current);
              current = '';
            } else {
              current += line[ci];
            }
          }
          result.push(current);
          return result;
        };

        const lines = text.split('\n').map(parseCSVLine);

        const billData: BillData = {
          utility_provider: null,
          customer_details: { name: null, billing_address: null, service_address: null },
          billing_details: {
            account_number: null, meter_number: null, invoice_number: null,
            bill_date: null, due_date: null, discont_date: null,
            billing_period: { start_date: null, end_date: null },
            contracted_demand_kva: null, billable_demand_kva: null,
            tariff_code: null, supply_voltage: null
          },
          reading_tables: [],
          bill_components: [],
          billing_summary: {
            total_energy_charges: null, total_additional_charges: null,
            total_miscellaneous_charges: null, total_arrears_lps: null,
            net_bill_amount: null, rebate: null,
            payable_till_due_date: null, payable_after_due_date: null
          },
          raw_ocr_analysis_notes: 'Imported from CSV: ' + file.name
        };

        const toNum = (s: string | undefined): number | null => {
          if (!s || !s.trim()) return null;
          const n = parseFloat(s.trim());
          return isNaN(n) ? null : n;
        };
        const toStr = (s: string | undefined): string | null => {
          if (!s || !s.trim()) return null;
          return s.trim();
        };

        let li = 0;
        while (li < lines.length) {
          const firstCell = (lines[li]?.[0] || '').trim();

          if (firstCell === 'Utility Provider') {
            billData.utility_provider = toStr(lines[li]?.[1]);
            li++;
          } else if (firstCell === 'Customer Details') {
            li++;
            while (li < lines.length && (lines[li]?.[0] || '').trim() !== '' && !(lines[li]?.[0] || '').trim().startsWith('Billing Details')) {
              const label = (lines[li]?.[0] || '').trim();
              const val = toStr(lines[li]?.[1]);
              if (label === 'Name') billData.customer_details!.name = val;
              else if (label === 'Billing Address') billData.customer_details!.billing_address = val;
              else if (label === 'Service Address') billData.customer_details!.service_address = val;
              li++;
            }
          } else if (firstCell === 'Billing Details') {
            li++;
            while (li < lines.length && (lines[li]?.[0] || '').trim() !== '' && !(lines[li]?.[0] || '').trim().startsWith('Reading Table') && (lines[li]?.[0] || '').trim() !== 'Bill Components') {
              const label = (lines[li]?.[0] || '').trim();
              const val = toStr(lines[li]?.[1]);
              switch (label) {
                case 'Account Number': billData.billing_details!.account_number = val; break;
                case 'Meter Number': billData.billing_details!.meter_number = val; break;
                case 'Invoice Number': billData.billing_details!.invoice_number = val; break;
                case 'Bill Date': billData.billing_details!.bill_date = val; break;
                case 'Due Date': billData.billing_details!.due_date = val; break;
                case 'Discont Date': billData.billing_details!.discont_date = val; break;
                case 'Billing Period Start': billData.billing_details!.billing_period!.start_date = val; break;
                case 'Billing Period End': billData.billing_details!.billing_period!.end_date = val; break;
                case 'Contracted Demand (KVA)': billData.billing_details!.contracted_demand_kva = toNum(lines[li]?.[1]); break;
                case 'Billable Demand (KVA)': billData.billing_details!.billable_demand_kva = toNum(lines[li]?.[1]); break;
                case 'Tariff Code': billData.billing_details!.tariff_code = val; break;
                case 'Supply Voltage': billData.billing_details!.supply_voltage = val; break;
              }
              li++;
            }
          } else if (firstCell.startsWith('Reading Table')) {
            const periodPart = toStr(lines[li]?.[1]);
            const reading_from = periodPart?.replace(/^Period:\s*/, '') || null;
            li++;
            if (li < lines.length && (lines[li]?.[0] || '').trim() === 'Zone Name') li++;
            const readings: TodReading[] = [];
            while (li < lines.length && (lines[li]?.[0] || '').trim() !== '' && !(lines[li]?.[0] || '').trim().startsWith('Reading Table') && (lines[li]?.[0] || '').trim() !== 'Bill Components') {
              readings.push({
                zone_name: toStr(lines[li]?.[0]),
                present_reading: toNum(lines[li]?.[1]),
                past_reading: toNum(lines[li]?.[2]),
                difference: toNum(lines[li]?.[3]),
                multiplying_factor: toNum(lines[li]?.[4]),
                total_consumption: toNum(lines[li]?.[5])
              });
              li++;
            }
            if (readings.length > 0) {
              billData.reading_tables!.push({ reading_from, readings });
            }
          } else if (firstCell === 'Bill Components') {
            li++;
            if (li < lines.length && (lines[li]?.[0] || '').trim() === 'Sno') li++;
            while (li < lines.length && (lines[li]?.[0] || '').trim() !== '' && (lines[li]?.[0] || '').trim() !== 'Billing Summary') {
              billData.bill_components!.push({
                sno: toStr(lines[li]?.[0]),
                category: toStr(lines[li]?.[1]),
                component_name: toStr(lines[li]?.[2]),
                consumption: toNum(lines[li]?.[3]),
                rate: toNum(lines[li]?.[4]),
                unit: toStr(lines[li]?.[5]),
                amount: toNum(lines[li]?.[6])
              });
              li++;
            }
          } else if (firstCell === 'Billing Summary') {
            li++;
            while (li < lines.length && (lines[li]?.[0] || '').trim() !== '') {
              const label = (lines[li]?.[0] || '').trim();
              const val = toNum(lines[li]?.[1]);
              switch (label) {
                case 'Total Energy Charges': billData.billing_summary!.total_energy_charges = val; break;
                case 'Total Additional Charges': billData.billing_summary!.total_additional_charges = val; break;
                case 'Total Miscellaneous Charges': billData.billing_summary!.total_miscellaneous_charges = val; break;
                case 'Total Arrears & LPS': billData.billing_summary!.total_arrears_lps = val; break;
                case 'Net Bill Amount': billData.billing_summary!.net_bill_amount = val; break;
                case 'Rebate': billData.billing_summary!.rebate = val; break;
                case 'Payable Till Due Date': billData.billing_summary!.payable_till_due_date = val; break;
                case 'Payable After Due Date': billData.billing_summary!.payable_after_due_date = val; break;
              }
              li++;
            }
          } else {
            li++;
          }
        }

        setEditableData(billData);
        setResults({
          success: true,
          raw_text: 'Imported from CSV file: ' + file.name,
          data: billData,
          metadata: {
            filename: file.name,
            content_type: 'text/csv',
            model: 'csv-import',
            processing_time_seconds: 0
          }
        });
      } catch (err: any) {
        alert('Failed to parse CSV file: ' + err.message);
      }
    };

    reader.readAsText(file);
    event.target.value = '';
  };

  // --- Formatting Helpers ---
  const formatCurrency = (val: number | null | undefined, decimals = 2) => {
    if (val === null || val === undefined || isNaN(val)) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(val);
  };

  const formatNumber = (val: number | null | undefined) => {
    if (val === null || val === undefined || isNaN(val)) return '—';
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2
    }).format(val);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // --- Sub-components & Elements ---
  const data = editableData || ({} as Partial<BillData>);

  return (
    <div className="react-app">
      {/* Background radial glow fields */}
      <div className="bg-glow-container" aria-hidden="true">
        <div className="glow-circle glow-1"></div>
        <div className="glow-circle glow-2"></div>
        <div className="glow-circle glow-3"></div>
      </div>

      <div className="app-container">
        {/* Header */}
        <header className="app-header">
          <div className="logo-section">
            <Zap className="logo-icon" size={40} />
            <h1>JouleScrape</h1>
            <span>v1.0-OCR</span>
          </div>
          
          <div className="model-config">
            <label htmlFor="model-select">LLM Engine:</label>
            <select 
              id="model-select" 
              className="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {models.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </div>
        </header>

        {/* Main Grid */}
        <main className="main-grid">
          {/* Left Panel: Sidebar */}
          <section className="control-sidebar">
            <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, textAlign: 'left' }}>Document Source</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '-0.75rem', textAlign: 'left' }}>
                Upload your utility statement. Supported formats include scanned PDFs, JPEGs, and PNGs.
              </p>

              {/* Upload Dropzone */}
              {!selectedFile ? (
                <div 
                  className={`upload-zone ${dragActive ? 'dragover' : ''}`}
                  onClick={triggerFileSelect}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                >
                  <CloudUpload className="upload-icon" />
                  <h3 className="upload-title">Drag & drop bill here</h3>
                  <p className="upload-subtitle">or browse files from your disk</p>
                  <button type="button" className="file-select-btn" onClick={(e) => { e.stopPropagation(); triggerFileSelect(); }}>
                    Select File
                  </button>
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    style={{ display: 'none' }} 
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={handleFileChange}
                  />
                </div>
              ) : (
                /* Selected File Panel */
                <div className="file-status-card">
                  <FileText className="file-icon" />
                  <div className="file-info">
                    <div className="file-name">{selectedFile.name}</div>
                    <div className="file-meta">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • {selectedFile.type.split('/')[1]?.toUpperCase() || 'FILE'}
                    </div>
                  </div>
                  <button className="btn-remove-file" onClick={handleRemoveFile} aria-label="Remove uploaded file">
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Submit button */}
              <button 
                className="btn-analyze" 
                disabled={!selectedFile || loading}
                onClick={runAnalysis}
              >
                <Cpu size={20} />
                Analyze Energy Bill
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>or</span>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
              </div>
              <button 
                className="btn-analyze" 
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                onClick={() => csvInputRef.current?.click()}
              >
                <Upload size={20} />
                Import from CSV
              </button>
              <input 
                ref={csvInputRef}
                type="file" 
                style={{ display: 'none' }} 
                accept=".csv"
                onChange={importFromCSV}
              />
            </div>
          </section>

          {/* Right Panel: Content Area */}
          <section className="results-area-container">
            {/* 1. Blank state */}
            {!loading && !results && (
              <div className="intro-placeholder">
                <Sparkles className="intro-icon" size={80} />
                <h2>Awaiting Statement Upload</h2>
                <p>Provide a bill statement on the left to extract provider metadata, consumption patterns, rates, and total balance due using optical recognition.</p>
              </div>
            )}

            {/* 2. Loading State */}
            {loading && (
              <div className="glass-card loading-container">
                <div className="spinner-ring"></div>
                <div className="loading-text">Decoding Statement Structure</div>
                <div className="loading-steps">
                  <div className={`step-item ${loadingStep === 'ocr' ? 'active' : ''} ${['llm', 'parse', 'done'].includes(loadingStep) ? 'done' : ''}`}>
                    <span className="step-bullet"></span>
                    Running OCR engine on document layout
                  </div>
                  <div className={`step-item ${loadingStep === 'llm' ? 'active' : ''} ${['parse', 'done'].includes(loadingStep) ? 'done' : ''}`}>
                    <span className="step-bullet"></span>
                    Consulting LLM models for parameter maps
                  </div>
                  <div className={`step-item ${loadingStep === 'parse' ? 'active' : ''} ${loadingStep === 'done' ? 'done' : ''}`}>
                    <span className="step-bullet"></span>
                    Structuring JSON metrics dashboard
                  </div>
                </div>
              </div>
            )}

            {/* 3. Results Dashboard */}
            {!loading && results && (
              <div className="results-area">
                {/* Utility summary banner */}
                <div className="glass-card summary-banner">
                  <div className="provider-info">
                    <h3>{data.utility_provider || 'Unknown Provider'}</h3>
                    <p>
                      <Building size={14} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }} />
                      <span>{data.billing_details?.invoice_number ? `Invoice: ${data.billing_details.invoice_number}` : 'Utility Invoice'}</span>
                    </p>
                    {data.extraction_confidence && (
                      <span
                        title={
                          data.extraction_confidence === 'high'
                            ? 'Extracted totals reconcile with the printed net amount.'
                            : 'Extracted totals do NOT reconcile with the printed net — please review/edit the values below.'
                        }
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginTop: '6px',
                          padding: '2px 10px',
                          borderRadius: '999px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: data.extraction_confidence === 'high' ? '#065f46' : '#92400e',
                          background: data.extraction_confidence === 'high' ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.18)',
                          border: `1px solid ${data.extraction_confidence === 'high' ? 'rgba(16,185,129,0.5)' : 'rgba(245,158,11,0.5)'}`,
                        }}
                      >
                        {data.extraction_confidence === 'high' ? '● High confidence' : '▲ Low confidence — verify'}
                      </span>
                    )}
                  </div>
                  <div className="totals-strip">
                    <div className="charge-big-card">
                      <span className="charge-label">Net Bill Amount</span>
                      <span className="charge-value">{formatCurrency(data.billing_summary?.net_bill_amount)}</span>
                    </div>
                    <div className="charge-big-card accent">
                      <span className="charge-label">Payable Till Due Date</span>
                      <span className="charge-value primary">{formatCurrency(data.billing_summary?.payable_till_due_date)}</span>
                    </div>
                  </div>
                </div>

                {/* View Switcher Strip */}
                <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.75rem', marginTop: '0.5rem', alignItems: 'center' }}>
                  <button 
                    className={`tab-btn ${viewMode === 'statement' ? 'active' : ''}`}
                    onClick={() => setViewMode('statement')}
                  >
                    Invoice Statement
                  </button>
                  <button 
                    className={`tab-btn ${viewMode === 'metrics' ? 'active' : ''}`}
                    onClick={() => setViewMode('metrics')}
                  >
                    Dashboard Metrics
                  </button>
                  <button 
                    className="tab-btn btn-calculate-action"
                    onClick={performBillCalculation}
                    style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(13, 148, 136, 0.15)', border: '1px solid rgba(13, 148, 136, 0.3)', color: 'var(--accent-hover)', borderRadius: '4px' }}
                  >
                    <Calculator size={14} />
                    Calculate & Match Bill
                  </button>
                  <button 
                    className="tab-btn"
                    onClick={exportToCSV}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Download size={14} />
                    Export CSV
                  </button>
                </div>

                {/* Grid layout cards */}
                <div className="results-split">
                  {viewMode === 'statement' ? (
                    /* Unified printable paper bill layout */
                    <div className="bill-paper">
                      {/* Header */}
                      <div className="bill-paper-header">
                        <div className="bill-paper-title" style={{ width: '70%' }}>
                          <input 
                            type="text" 
                            value={data.utility_provider || ''} 
                            onChange={(e) => setEditableData({ ...editableData!, utility_provider: e.target.value })} 
                            className="editable-input bill-title-input" 
                            style={{ fontWeight: 800, fontSize: '1.15rem', textTransform: 'uppercase' }}
                            placeholder="UTILITY ELECTRICITY CO."
                          />
                          <p style={{ color: '#475569', fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>OFFICIAL BILL STATEMENT CUM DEMAND NOTICE (RURAL)</p>
                        </div>
                        <div className="bill-paper-badge">INVOICE</div>
                      </div>

                      {/* Metadata grid */}
                      <div className="bill-paper-meta-grid">
                        <div>
                          <span className="bill-paper-meta-label">AC-No: </span>
                          <input 
                            type="text" 
                            value={data.billing_details?.account_number || ''} 
                            onChange={(e) => handleBillingDetailsChange('account_number', e.target.value)} 
                            className="editable-input-flat" 
                          />
                        </div>
                        <div>
                          <span className="bill-paper-meta-label">Meter-No: </span>
                          <input 
                            type="text" 
                            value={data.billing_details?.meter_number || ''} 
                            onChange={(e) => handleBillingDetailsChange('meter_number', e.target.value)} 
                            className="editable-input-flat" 
                          />
                        </div>
                        <div>
                          <span className="bill-paper-meta-label">Bill Month/Date: </span>
                          <input 
                            type="text" 
                            value={data.billing_details?.bill_date || ''} 
                            onChange={(e) => handleBillingDetailsChange('bill_date', e.target.value)} 
                            className="editable-input-flat" 
                          />
                        </div>
                        <div>
                          <span className="bill-paper-meta-label">Due Date: </span>
                          <input 
                            type="text" 
                            value={data.billing_details?.due_date || ''} 
                            onChange={(e) => handleBillingDetailsChange('due_date', e.target.value)} 
                            className="editable-input-flat" 
                            style={{ fontWeight: 800, color: 'var(--danger-color)' }}
                          />
                        </div>
                        <div>
                          <span className="bill-paper-meta-label">Tariff Cd: </span>
                          <input 
                            type="text" 
                            value={data.billing_details?.tariff_code || ''} 
                            onChange={(e) => handleBillingDetailsChange('tariff_code', e.target.value)} 
                            className="editable-input-flat" 
                          />
                        </div>
                        <div>
                          <span className="bill-paper-meta-label">Supply Voltage: </span>
                          <input 
                            type="text" 
                            value={data.billing_details?.supply_voltage || ''} 
                            onChange={(e) => handleBillingDetailsChange('supply_voltage', e.target.value)} 
                            className="editable-input-flat" 
                          />
                        </div>
                        <div>
                          <span className="bill-paper-meta-label">Contracted Demand (KVA): </span>
                          <input 
                            type="text" 
                            value={data.billing_details?.contracted_demand_kva ?? ''} 
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              handleBillingDetailsChange('contracted_demand_kva', isNaN(val) ? null : val);
                            }} 
                            className="editable-input-flat" 
                          />
                        </div>
                        <div>
                          <span className="bill-paper-meta-label">Billable Demand (KVA): </span>
                          <input 
                            type="text" 
                            value={data.billing_details?.billable_demand_kva ?? ''} 
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              handleBillingDetailsChange('billable_demand_kva', isNaN(val) ? null : val);
                            }} 
                            className="editable-input-flat" 
                          />
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                          <span className="bill-paper-meta-label">Billing Period: </span>
                          <input 
                            type="text" 
                            value={data.billing_details?.billing_period?.start_date || ''} 
                            onChange={(e) => handleBillingPeriodChange('start_date', e.target.value)} 
                            className="editable-input-flat" 
                            style={{ width: '80px' }}
                          /> to <input 
                            type="text" 
                            value={data.billing_details?.billing_period?.end_date || ''} 
                            onChange={(e) => handleBillingPeriodChange('end_date', e.target.value)} 
                            className="editable-input-flat" 
                            style={{ width: '80px' }}
                          />
                        </div>
                      </div>

                      {/* Customer Information */}
                      <div className="bill-paper-section">
                        <div className="bill-paper-section-title">Billed To</div>
                        <div className="bill-paper-customer-box">
                          <input 
                            type="text" 
                            value={data.customer_details?.name || ''} 
                            onChange={(e) => handleCustomerChange('name', e.target.value)} 
                            className="editable-input" 
                            style={{ fontWeight: 800, fontSize: '0.8rem', color: '#0f172a', marginBottom: '0.25rem' }}
                            placeholder="CUSTOMER NAME"
                          />
                          <textarea 
                            value={data.customer_details?.service_address || ''} 
                            onChange={(e) => handleCustomerChange('service_address', e.target.value)} 
                            className="editable-input" 
                            style={{ minHeight: '40px', resize: 'vertical' }}
                            placeholder="ADDRESS DETAILS"
                          />
                        </div>
                      </div>

                      {/* Consumption Details Tables */}
                      <div className="bill-paper-section">
                        <div className="bill-paper-section-title">Time of Day (TOD) Meter Readings</div>
                        {data.reading_tables && data.reading_tables.length > 0 ? (
                          data.reading_tables.map((table, tIdx) => (
                            <div key={tIdx} style={{ marginBottom: '1.25rem' }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', background: '#e2e8f0', padding: '0.25rem 0.5rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                Period: 
                                <input 
                                  type="text" 
                                  value={table.reading_from || ''} 
                                  onChange={(e) => handleReadingTableRangeChange(tIdx, e.target.value)} 
                                  className="editable-input-flat" 
                                  style={{ fontWeight: 700, borderBottomColor: '#334155' }}
                                />
                              </div>
                              <table className="bill-paper-table">
                                <thead>
                                  <tr>
                                    <th style={{ textAlign: 'left' }}>TOD Zone / Energy Type</th>
                                    <th style={{ textAlign: 'right' }}>Present</th>
                                    <th style={{ textAlign: 'right' }}>Past</th>
                                    <th style={{ textAlign: 'right' }}>Difference</th>
                                    <th style={{ textAlign: 'right' }}>MF</th>
                                    <th style={{ textAlign: 'right' }}>Total (kWh)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {table.readings && table.readings.length > 0 ? (
                                    table.readings.map((row, rIdx) => (
                                      <tr key={rIdx}>
                                        <td>
                                          <input 
                                            type="text" 
                                            value={row.zone_name || ''} 
                                            onChange={(e) => handleReadingChange(tIdx, rIdx, 'zone_name', e.target.value)} 
                                            className="editable-table-input" 
                                            style={{ textAlign: 'left' }}
                                          />
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                          <input 
                                            type="text" 
                                            value={row.present_reading ?? ''} 
                                            onChange={(e) => handleReadingChange(tIdx, rIdx, 'present_reading', e.target.value)} 
                                            className="editable-table-input" 
                                          />
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                          <input 
                                            type="text" 
                                            value={row.past_reading ?? ''} 
                                            onChange={(e) => handleReadingChange(tIdx, rIdx, 'past_reading', e.target.value)} 
                                            className="editable-table-input" 
                                          />
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                          <input 
                                            type="text" 
                                            value={row.difference ?? ''} 
                                            onChange={(e) => handleReadingChange(tIdx, rIdx, 'difference', e.target.value)} 
                                            className="editable-table-input" 
                                          />
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                          <input 
                                            type="text" 
                                            value={row.multiplying_factor ?? ''} 
                                            onChange={(e) => handleReadingChange(tIdx, rIdx, 'multiplying_factor', e.target.value)} 
                                            className="editable-table-input" 
                                          />
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                                          <input 
                                            type="text" 
                                            value={row.total_consumption ?? ''} 
                                            onChange={(e) => handleReadingChange(tIdx, rIdx, 'total_consumption', e.target.value)} 
                                            className="editable-table-input" 
                                            style={{ fontWeight: 700 }}
                                          />
                                        </td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr>
                                      <td colSpan={6} style={{ textAlign: 'center' }}>No readings extracted for this period.</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          ))
                        ) : (
                          <p style={{ fontSize: '0.75rem', color: '#64748b' }}>No reading tables found.</p>
                        )}
                      </div>

                      {/* Detailed Bill Components Table */}
                      <div className="bill-paper-section">
                        <div className="bill-paper-section-title">Bill Components Summary Ledger</div>
                        <table className="bill-paper-table">
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left', width: '6%' }}>Sno</th>
                              <th style={{ textAlign: 'left', width: '30%' }}>Bill Component / Charge Description</th>
                              <th style={{ textAlign: 'left', width: '18%' }}>Category</th>
                              <th style={{ textAlign: 'right', width: '10%' }}>Consumption</th>
                              <th style={{ textAlign: 'right', width: '10%' }}>Rate</th>
                              <th style={{ textAlign: 'left', width: '8%' }}>Unit</th>
                              <th style={{ textAlign: 'right', width: '14%' }}>Amount (Rs.)</th>
                              <th style={{ textAlign: 'center', width: '4%' }}></th>
                            </tr>
                          </thead>
                          {(() => {
                            const categoriesList = [
                              "Current Demand and Energy Charges After Open Access",
                              "Additional Charges",
                              "Miscellaneous Charges",
                              "Arrear and LPS Charges"
                            ];

                            // Group items by category
                            const grouped: { [key: string]: { comp: BillComponentItem; idx: number }[] } = {};
                            categoriesList.forEach(cat => {
                              grouped[cat] = [];
                            });
                            const otherGroup: { comp: BillComponentItem; idx: number }[] = [];

                            if (data.bill_components) {
                              data.bill_components.forEach((comp, idx) => {
                                const cat = comp.category || "Current Demand and Energy Charges After Open Access";
                                // Find if it matches one of standard categories (case insensitive)
                                const matchedCat = categoriesList.find(c => c.toLowerCase() === cat.toLowerCase());
                                if (matchedCat) {
                                  grouped[matchedCat].push({ comp, idx });
                                } else {
                                  otherGroup.push({ comp, idx });
                                }
                              });
                            }

                            return (
                              <>
                                {categoriesList.map(categoryName => {
                                  const items = grouped[categoryName];
                                  return (
                                    <tbody key={categoryName}>
                                      <tr>
                                        <td colSpan={8} style={{ 
                                          textAlign: 'left', 
                                          fontWeight: 800, 
                                          backgroundColor: '#e2e8f0', 
                                          color: '#0f172a', 
                                          padding: '0.4rem 0.5rem', 
                                          fontSize: '0.75rem',
                                          borderBottom: '1px solid #cbd5e1'
                                        }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ letterSpacing: '0.025em' }}>{categoryName}</span>
                                            <button 
                                              onClick={() => addComponentRow(categoryName)}
                                              style={{ 
                                                padding: '0.15rem 0.4rem', 
                                                fontSize: '0.65rem', 
                                                cursor: 'pointer', 
                                                backgroundColor: '#0f172a', 
                                                color: '#fff', 
                                                border: 'none', 
                                                borderRadius: '4px',
                                                fontFamily: 'inherit',
                                                fontWeight: 'bold'
                                              }}
                                            >
                                              + Add Row
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                      {items.length > 0 ? (
                                        items.map(({ comp, idx }) => {
                                          const isTotalRow = comp.sno && ['A', 'B', 'C', 'D', 'E', 'F', 'TOTAL'].includes(comp.sno.toUpperCase());
                                          return (
                                            <tr key={idx} className={isTotalRow ? 'total-row' : ''} style={isTotalRow ? { backgroundColor: '#f8fafc' } : {}}>
                                              <td>
                                                <input 
                                                  type="text" 
                                                  value={comp.sno || ''} 
                                                  onChange={(e) => handleComponentChange(idx, 'sno', e.target.value)} 
                                                  className="editable-table-input" 
                                                  style={{ fontWeight: 800, textAlign: 'left' }}
                                                />
                                              </td>
                                              <td>
                                                <input 
                                                  type="text" 
                                                  value={comp.component_name || ''} 
                                                  onChange={(e) => handleComponentChange(idx, 'component_name', e.target.value)} 
                                                  className="editable-table-input" 
                                                  style={{ textAlign: 'left' }}
                                                />
                                              </td>
                                              <td>
                                                <select
                                                  value={comp.category || "Current Demand and Energy Charges After Open Access"}
                                                  onChange={(e) => handleComponentChange(idx, 'category', e.target.value)}
                                                  className="editable-table-input"
                                                  style={{ 
                                                    fontSize: '0.65rem', 
                                                    padding: '2px', 
                                                    width: '100%', 
                                                    border: '1px solid #cbd5e1', 
                                                    borderRadius: '4px',
                                                    backgroundColor: '#fff',
                                                    color: '#0f172a'
                                                  }}
                                                >
                                                  <option value="Current Demand and Energy Charges After Open Access">Current Charges</option>
                                                  <option value="Additional Charges">Additional</option>
                                                  <option value="Miscellaneous Charges">Miscellaneous</option>
                                                  <option value="Arrear and LPS Charges">Arrear & LPS</option>
                                                </select>
                                              </td>
                                              <td style={{ textAlign: 'right' }}>
                                                <input 
                                                  type="text" 
                                                  value={comp.consumption ?? ''} 
                                                  onChange={(e) => handleComponentChange(idx, 'consumption', e.target.value)} 
                                                  className="editable-table-input" 
                                                />
                                              </td>
                                              <td style={{ textAlign: 'right' }}>
                                                <input 
                                                  type="text" 
                                                  value={comp.rate ?? ''} 
                                                  onChange={(e) => handleComponentChange(idx, 'rate', e.target.value)} 
                                                  className="editable-table-input" 
                                                />
                                              </td>
                                              <td>
                                                <input 
                                                  type="text" 
                                                  value={comp.unit || ''} 
                                                  onChange={(e) => handleComponentChange(idx, 'unit', e.target.value)} 
                                                  className="editable-table-input" 
                                                  style={{ textAlign: 'left' }}
                                                />
                                              </td>
                                              <td style={{ textAlign: 'right', fontWeight: isTotalRow ? 800 : 500 }}>
                                                <input 
                                                  type="text" 
                                                  value={comp.amount ?? ''} 
                                                  onChange={(e) => handleComponentChange(idx, 'amount', e.target.value)} 
                                                  className="editable-table-input" 
                                                  style={{ fontWeight: isTotalRow ? 800 : 500 }}
                                                />
                                              </td>
                                              <td style={{ textAlign: 'center' }}>
                                                <button 
                                                  onClick={() => removeComponentRow(idx)} 
                                                  title="Delete row"
                                                  style={{ 
                                                    background: 'transparent', 
                                                    border: 'none', 
                                                    cursor: 'pointer', 
                                                    color: 'var(--danger-color)',
                                                    fontSize: '1.1rem',
                                                    fontWeight: 'bold',
                                                    padding: '2px 6px'
                                                  }}
                                                >
                                                  ×
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })
                                      ) : (
                                        <tr>
                                          <td colSpan={8} style={{ textAlign: 'center', color: '#64748b', fontSize: '0.7rem', padding: '0.4rem' }}>
                                            No charges under this category.
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  );
                                })}

                                {otherGroup.length > 0 && (
                                  <tbody>
                                    <tr>
                                      <td colSpan={8} style={{ 
                                        textAlign: 'left', 
                                        fontWeight: 800, 
                                        backgroundColor: '#e2e8f0', 
                                        color: '#0f172a', 
                                        padding: '0.4rem 0.5rem', 
                                        fontSize: '0.75rem',
                                        borderBottom: '1px solid #cbd5e1'
                                      }}>
                                        Other / Uncategorized Charges
                                      </td>
                                    </tr>
                                    {otherGroup.map(({ comp, idx }) => {
                                      const isTotalRow = comp.sno && ['A', 'B', 'C', 'D', 'E', 'F', 'TOTAL'].includes(comp.sno.toUpperCase());
                                      return (
                                        <tr key={idx} className={isTotalRow ? 'total-row' : ''} style={isTotalRow ? { backgroundColor: '#f8fafc' } : {}}>
                                          <td>
                                            <input 
                                              type="text" 
                                              value={comp.sno || ''} 
                                              onChange={(e) => handleComponentChange(idx, 'sno', e.target.value)} 
                                              className="editable-table-input" 
                                              style={{ fontWeight: 800, textAlign: 'left' }}
                                            />
                                          </td>
                                          <td>
                                            <input 
                                              type="text" 
                                              value={comp.component_name || ''} 
                                              onChange={(e) => handleComponentChange(idx, 'component_name', e.target.value)} 
                                              className="editable-table-input" 
                                              style={{ textAlign: 'left' }}
                                            />
                                          </td>
                                          <td>
                                            <select
                                              value={comp.category || "Current Demand and Energy Charges After Open Access"}
                                              onChange={(e) => handleComponentChange(idx, 'category', e.target.value)}
                                              className="editable-table-input"
                                              style={{ 
                                                fontSize: '0.65rem', 
                                                padding: '2px', 
                                                width: '100%', 
                                                border: '1px solid #cbd5e1', 
                                                borderRadius: '4px',
                                                backgroundColor: '#fff',
                                                color: '#0f172a'
                                              }}
                                            >
                                              <option value="Current Demand and Energy Charges After Open Access">Current Charges</option>
                                              <option value="Additional Charges">Additional</option>
                                              <option value="Miscellaneous Charges">Miscellaneous</option>
                                              <option value="Arrear and LPS Charges">Arrear & LPS</option>
                                            </select>
                                          </td>
                                          <td style={{ textAlign: 'right' }}>
                                            <input 
                                              type="text" 
                                              value={comp.consumption ?? ''} 
                                              onChange={(e) => handleComponentChange(idx, 'consumption', e.target.value)} 
                                              className="editable-table-input" 
                                            />
                                          </td>
                                          <td style={{ textAlign: 'right' }}>
                                            <input 
                                              type="text" 
                                              value={comp.rate ?? ''} 
                                              onChange={(e) => handleComponentChange(idx, 'rate', e.target.value)} 
                                              className="editable-table-input" 
                                            />
                                          </td>
                                          <td>
                                            <input 
                                              type="text" 
                                              value={comp.unit || ''} 
                                              onChange={(e) => handleComponentChange(idx, 'unit', e.target.value)} 
                                              className="editable-table-input" 
                                              style={{ textAlign: 'left' }}
                                            />
                                          </td>
                                          <td style={{ textAlign: 'right', fontWeight: isTotalRow ? 800 : 500 }}>
                                            <input 
                                              type="text" 
                                              value={comp.amount ?? ''} 
                                              onChange={(e) => handleComponentChange(idx, 'amount', e.target.value)} 
                                              className="editable-table-input" 
                                              style={{ fontWeight: isTotalRow ? 800 : 500 }}
                                            />
                                          </td>
                                          <td style={{ textAlign: 'center' }}>
                                            <button 
                                              onClick={() => removeComponentRow(idx)} 
                                              title="Delete row"
                                              style={{ 
                                                background: 'transparent', 
                                                border: 'none', 
                                                cursor: 'pointer', 
                                                color: 'var(--danger-color)',
                                                fontSize: '1.1rem',
                                                fontWeight: 'bold',
                                                padding: '2px 6px'
                                                  }}
                                                >
                                                  ×
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    )}
                              </>
                            );
                          })()}
                        </table>
                      </div>

                      {/* Due Dates Summary Block */}
                      <div className="bill-paper-section" style={{ borderTop: '2px solid #0f172a', paddingTop: '1rem', marginTop: '0.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', textAlign: 'center' }}>
                          <div style={{ background: '#f1f5f9', padding: '0.75rem', borderRadius: '6px' }}>
                            <span style={{ fontSize: '0.7rem', color: '#475569', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Rebate (1% of energy charges)</span>
                            <input 
                              type="text" 
                              value={data.billing_summary?.rebate ?? ''} 
                              onChange={(e) => handleBillingSummaryChange('rebate', e.target.value)} 
                              className="editable-table-input" 
                              style={{ fontSize: '1rem', fontWeight: 800, color: '#16a34a', borderBottomColor: '#16a34a' }}
                            />
                          </div>
                          <div style={{ background: '#ecfdf5', padding: '0.75rem', borderRadius: '6px', border: '1px solid #10b981' }}>
                            <span style={{ fontSize: '0.7rem', color: '#065f46', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Payable Till Due Date</span>
                            <input 
                              type="text" 
                              value={data.billing_summary?.payable_till_due_date ?? ''} 
                              onChange={(e) => handleBillingSummaryChange('payable_till_due_date', e.target.value)} 
                              className="editable-table-input" 
                              style={{ fontSize: '1rem', fontWeight: 800, color: '#047857', borderBottomColor: '#10b981' }}
                            />
                          </div>
                          <div style={{ background: '#fef2f2', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ef4444' }}>
                            <span style={{ fontSize: '0.7rem', color: '#991b1b', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Payable After Due Date</span>
                            <input 
                              type="text" 
                              value={data.billing_summary?.payable_after_due_date ?? ''} 
                              onChange={(e) => handleBillingSummaryChange('payable_after_due_date', e.target.value)} 
                              className="editable-table-input" 
                              style={{ fontSize: '1rem', fontWeight: 800, color: '#b91c1c', borderBottomColor: '#ef4444' }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Barcode details */}
                      <div className="bill-paper-barcode-area">
                        <div className="bill-paper-barcode" aria-hidden="true"></div>
                        <div className="bill-paper-barcode-text">
                          *{data.billing_details?.account_number || '0000000000'}*
                        </div>
                      </div>

                      {/* Official Sign-off Stamp Block */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', fontSize: '0.65rem', borderTop: '1px dashed #cbd5e1', paddingTop: '1rem', marginTop: '1rem', color: '#64748b' }}>
                        <div>Prepared By Bill Clerk</div>
                        <div>Checked By AE(R) / DA(R)</div>
                        <div style={{ textAlign: 'right' }}>Executive Engineer, Muzaffarnagar</div>
                      </div>
                    </div>
                  ) : (
                    /* isolated metrics mode */
                    <div className="dashboard-panel">
                      {/* Customer Info Card */}
                      <div className="glass-card">
                        <div className="section-header">
                          <div className="section-title">
                            <User size={18} style={{ marginRight: '8px' }} />
                            Customer Profile
                          </div>
                        </div>
                        <div className="info-block-grid">
                          <div className="info-field span-2">
                            <span className="info-label">Customer Name</span>
                            <div className={`info-value ${!data.customer_details?.name ? 'empty' : ''}`}>
                              {data.customer_details?.name || '—'}
                            </div>
                          </div>
                          <div className="info-field">
                            <span className="info-label">Billing Address</span>
                            <div className={`info-value ${!data.customer_details?.billing_address ? 'empty' : ''}`}>
                              {data.customer_details?.billing_address || '—'}
                            </div>
                          </div>
                          <div className="info-field">
                            <span className="info-label">Service Address</span>
                            <div className={`info-value ${!data.customer_details?.service_address ? 'empty' : ''}`}>
                              {data.customer_details?.service_address || '—'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Parameters Card */}
                      <div className="glass-card">
                        <div className="section-header">
                          <div className="section-title">
                            <Calendar size={18} style={{ marginRight: '8px' }} />
                            Billing Parameters
                          </div>
                        </div>
                        <div className="info-block-grid">
                          <div className="info-field">
                            <span className="info-label">Account Number</span>
                            <div className={`info-value ${!data.billing_details?.account_number ? 'empty' : ''}`}>
                              {data.billing_details?.account_number || '—'}
                            </div>
                          </div>
                          <div className="info-field">
                            <span className="info-label">Meter Number</span>
                            <div className={`info-value ${!data.billing_details?.meter_number ? 'empty' : ''}`}>
                              {data.billing_details?.meter_number || '—'}
                            </div>
                          </div>
                          <div className="info-field">
                            <span className="info-label">Tariff Code</span>
                            <div className={`info-value ${!data.billing_details?.tariff_code ? 'empty' : ''}`}>
                              {data.billing_details?.tariff_code || '—'}
                            </div>
                          </div>
                          <div className="info-field">
                            <span className="info-label">Bill Date</span>
                            <div className={`info-value ${!data.billing_details?.bill_date ? 'empty' : ''}`}>
                              {formatDate(data.billing_details?.bill_date) || '—'}
                            </div>
                          </div>
                          <div className="info-field">
                            <span className="info-label">Payment Due Date</span>
                            <div className={`info-value ${!data.billing_details?.due_date ? 'empty' : ''}`}>
                              {formatDate(data.billing_details?.due_date) || '—'}
                            </div>
                          </div>
                          <div className="info-field">
                            <span className="info-label">Contracted Demand</span>
                            <div className={`info-value ${!data.billing_details?.contracted_demand_kva ? 'empty' : ''}`}>
                              {data.billing_details?.contracted_demand_kva ? `${data.billing_details.contracted_demand_kva} KVA` : '—'}
                            </div>
                          </div>
                          <div className="info-field">
                            <span className="info-label">Billable Demand</span>
                            <div className={`info-value ${!data.billing_details?.billable_demand_kva ? 'empty' : ''}`}>
                              {data.billing_details?.billable_demand_kva ? `${data.billing_details.billable_demand_kva} KVA` : '—'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Time of Day (TOD) Consumption Ledger */}
                      {data.reading_tables && data.reading_tables.length > 0 && (
                        <div className="glass-card">
                          <div className="section-header">
                            <div className="section-title">
                              <Activity size={18} style={{ marginRight: '8px' }} />
                              Time of Day (TOD) Consumption Tables
                            </div>
                          </div>
                          {data.reading_tables.map((table, tIdx) => (
                            <div key={tIdx} className="tod-table-container" style={{ borderBottom: tIdx < data.reading_tables!.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none' }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textDecoration: 'underline' }}>
                                Period: {table.reading_from || '—'}
                              </div>
                              <table className="tod-table">
                                <thead>
                                  <tr>
                                    <th className="text-left">Zone / Energy Type</th>
                                    <th className="text-right">Present</th>
                                    <th className="text-right">Past</th>
                                    <th className="text-right">Difference</th>
                                    <th className="text-right">MF</th>
                                    <th className="text-right">Total (kWh)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {table.readings?.map((row, index) => (
                                    <tr key={index}>
                                      <td className="text-left" style={{ fontWeight: 500 }}>{row.zone_name || '—'}</td>
                                      <td className="text-right">{formatNumber(row.present_reading)}</td>
                                      <td className="text-right">{formatNumber(row.past_reading)}</td>
                                      <td className="text-right">{formatNumber(row.difference)}</td>
                                      <td className="text-right">{formatNumber(row.multiplying_factor)}</td>
                                      <td className="text-right bold-highlight">{formatNumber(row.total_consumption)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Financial details card */}
                      <div className="glass-card">
                        <div className="section-header">
                          <div className="section-title">
                            <Receipt size={18} style={{ marginRight: '8px' }} />
                            Financial Ledger Summary
                          </div>
                        </div>
                        <div className="info-block-grid">
                          <div className="info-field">
                            <span className="info-label">Net Bill Amount</span>
                            <div className="info-value">{formatCurrency(data.billing_summary?.net_bill_amount)}</div>
                          </div>
                          <div className="info-field">
                            <span className="info-label">Total Energy Charges</span>
                            <div className="info-value">{formatCurrency(data.billing_summary?.total_energy_charges)}</div>
                          </div>
                          <div className="info-field">
                            <span className="info-label">Total Additional Charges</span>
                            <div className="info-value">{formatCurrency(data.billing_summary?.total_additional_charges)}</div>
                          </div>
                          <div className="info-field">
                            <span className="info-label">Total Miscellaneous Charges</span>
                            <div className="info-value">{formatCurrency(data.billing_summary?.total_miscellaneous_charges)}</div>
                          </div>
                          <div className="info-field">
                            <span className="info-label">Total Arrears & LPS</span>
                            <div className="info-value">{formatCurrency(data.billing_summary?.total_arrears_lps)}</div>
                          </div>
                          <div className="info-field">
                            <span className="info-label">Payable Till Due Date</span>
                            <div className="info-value">{formatCurrency(data.billing_summary?.payable_till_due_date)}</div>
                          </div>
                          <div className="info-field">
                            <span className="info-label">Payable After Due Date</span>
                            <div className="info-value">{formatCurrency(data.billing_summary?.payable_after_due_date)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tabs inspector panel */}
                  <div className="glass-card details-panel">
                    <div className="tabs-header">
                      <button
                        className={`tab-btn ${activeTab === 'image' ? 'active' : ''}`}
                        onClick={() => setActiveTab('image')}
                      >
                        Original Bill
                      </button>
                      <button
                        className={`tab-btn ${activeTab === 'ocr' ? 'active' : ''}`}
                        onClick={() => setActiveTab('ocr')}
                      >
                        Raw OCR Text
                      </button>
                      <button
                        className={`tab-btn ${activeTab === 'json' ? 'active' : ''}`}
                        onClick={() => setActiveTab('json')}
                      >
                        Structured JSON
                      </button>
                    </div>
                    <div className="tab-content">
                      {activeTab === 'image' ? (
                        (results.image_data_url || previewUrl) ? (
                          <div style={{ textAlign: 'center', maxHeight: '70vh', overflow: 'auto', background: '#0b1120', borderRadius: '8px', padding: '0.5rem' }}>
                            <img
                              src={results.image_data_url || previewUrl || ''}
                              alt="Uploaded electricity bill"
                              style={{ maxWidth: '100%', height: 'auto', borderRadius: '6px' }}
                            />
                          </div>
                        ) : (
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                            No image preview available for this document.
                          </p>
                        )
                      ) : activeTab === 'ocr' ? (
                        <div className="raw-text-content">
                          {results.raw_text || 'No OCR text extracted.'}
                        </div>
                      ) : (
                        <pre>
                          <code>{JSON.stringify(data, null, 2)}</code>
                        </pre>
                      )}
                    </div>
                  </div>
                </div>

                {/* Extraction notes card */}
                {data.raw_ocr_analysis_notes && (
                  <div className="alert-card">
                    <Info size={20} />
                    <div>
                      <strong>Extraction Notes:</strong>
                      <span style={{ marginLeft: '6px' }}>{data.raw_ocr_analysis_notes}</span>
                    </div>
                  </div>
                )}

                {/* Footer metadata strip */}
                <div className="metadata-strip">
                  <div className="meta-item">
                    <FileIcon size={14} />
                    <span>{results.metadata?.filename || selectedFile?.name}</span>
                  </div>
                  <div className="meta-item">
                    <Clock size={14} />
                    <span>Processed in {results.metadata?.processing_time_seconds || '—'}s</span>
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
      {showVerifyModal && calculatedSummary && results?.data?.billing_summary && (
        <div className="verify-modal-backdrop" onClick={() => setShowVerifyModal(false)}>
          <div className="verify-modal-content glass-card" onClick={(e) => e.stopPropagation()}>
            <div className="verify-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calculator className="logo-icon" size={24} style={{ color: 'var(--accent-hover)' }} />
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Calculation & OCR Audit Report</h2>
              </div>
              <button 
                onClick={() => setShowVerifyModal(false)} 
                aria-label="Close report"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="verify-modal-body">
              {(() => {
                const scraped = results.data.billing_summary;
                const calculated = calculatedSummary;
                
                const comparisons = [
                  {
                    name: 'Total Energy Charges (A)',
                    scrapVal: scraped?.total_energy_charges,
                    calcVal: calculated.total_energy_charges,
                  },
                  {
                    name: 'Total Additional Charges (B)',
                    scrapVal: scraped?.total_additional_charges,
                    calcVal: calculated.total_additional_charges,
                  },
                  {
                    name: 'Total Miscellaneous Charges (D)',
                    scrapVal: scraped?.total_miscellaneous_charges,
                    calcVal: calculated.total_miscellaneous_charges,
                  },
                  {
                    name: 'Total Arrear & LPS Charges (E)',
                    scrapVal: scraped?.total_arrears_lps,
                    calcVal: calculated.total_arrears_lps,
                  },
                  {
                    name: 'Net Bill Amount (Subtotal F)',
                    scrapVal: scraped?.net_bill_amount,
                    calcVal: calculated.net_bill_amount,
                  },
                  {
                    name: 'Prompt Payment Rebate (1%)',
                    scrapVal: scraped?.rebate,
                    calcVal: calculated.rebate,
                  },
                  {
                    name: 'Payable Till Due Date',
                    scrapVal: scraped?.payable_till_due_date,
                    calcVal: calculated.payable_till_due_date,
                  },
                  {
                    name: 'Payable After Due Date',
                    scrapVal: scraped?.payable_after_due_date,
                    calcVal: calculated.payable_after_due_date,
                  }
                ];
                
                const discrepancies = comparisons.filter(c => Math.abs((c.scrapVal || 0) - c.calcVal) >= 1.0);
                const allMatch = discrepancies.length === 0;
                
                return (
                  <>
                    <div className={`verify-alert-banner ${allMatch ? 'success' : 'warning'}`} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem', background: allMatch ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', border: allMatch ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(245, 158, 11, 0.2)', textAlign: 'left' }}>
                      {allMatch ? (
                        <>
                          <CheckCircle2 size={24} style={{ color: 'var(--success-color)', flexShrink: 0 }} />
                          <div>
                            <strong style={{ display: 'block', fontSize: '0.95rem' }}>Verification Successful!</strong>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                              Calculated values from individual components match the scraped values perfectly.
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <Info size={24} style={{ color: 'var(--warning-color)', flexShrink: 0 }} />
                          <div>
                            <strong style={{ display: 'block', fontSize: '0.95rem' }}>Discrepancy Detected</strong>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                              Differences found in {discrepancies.length} summary metrics. See comparison table below.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    
                    <div style={{ overflowX: 'auto' }}>
                      <table className="verify-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                            <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Billing Metric</th>
                            <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Scraped (OCR)</th>
                            <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Calculated</th>
                            <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Audit Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparisons.map((item, idx) => {
                            const scrap = item.scrapVal || 0;
                            const calc = item.calcVal;
                            const diff = calc - scrap;
                            const isMatch = Math.abs(diff) < 1.0;
                            
                            return (
                              <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', background: isMatch ? 'transparent' : 'rgba(239, 68, 68, 0.02)' }}>
                                <td style={{ padding: '0.85rem 0.5rem', fontWeight: 600, textAlign: 'left' }}>{item.name}</td>
                                <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)' }}>
                                  {formatCurrency(item.scrapVal)}
                                </td>
                                <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>
                                  {formatCurrency(item.calcVal)}
                                </td>
                                <td style={{ padding: '0.85rem 0.5rem', textAlign: 'center' }}>
                                  {isMatch ? (
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success-color)' }}>✅ Match</span>
                                  ) : (
                                    <span 
                                      style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger-color)', cursor: 'help' }} 
                                      title={`Diff: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`}
                                    >
                                      ⚠️ {diff >= 0 ? '+' : ''}{formatCurrency(diff, 0)}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    
                    <div className="verify-modal-actions" style={{ marginTop: '1.75rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn-apply-calculated"
                        onClick={applyCalculatedTotals}
                        style={{ 
                          background: 'linear-gradient(135deg, var(--success-color) 0%, #059669 100%)', 
                          color: '#fff', 
                          border: 'none', 
                          padding: '0.65rem 1.25rem', 
                          borderRadius: '8px', 
                          fontWeight: 700, 
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
                        }}
                      >
                        <CheckCircle2 size={16} />
                        Apply Calculated Totals
                      </button>
                      <button 
                        className="btn-dismiss-modal"
                        onClick={() => setShowVerifyModal(false)}
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          border: '1px solid rgba(255, 255, 255, 0.1)', 
                          color: 'var(--text-primary)', 
                          padding: '0.65rem 1.25rem', 
                          borderRadius: '8px', 
                          fontWeight: 600, 
                          cursor: 'pointer' 
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
