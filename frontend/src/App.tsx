import { useState, useEffect, useRef } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { 
  Building, 
  Download,
  Calculator,
  File as FileIcon,
  Clock
} from 'lucide-react';
import './App.css';

// Types
import type { 
  BillData, 
  AnalysisResponse, 
  CalculatedSummary, 
  CustomerDetails, 
  BillingDetails, 
  TodReading
} from './types/bill';

// Services
import { fetchModels, analyzeBill, APIError } from './services/api';

// Formatters
import { formatCurrency } from './utils/formatters';

// Components
import Header from './components/Header';
import DropZone from './components/DropZone';
import AnalysisProgress from './components/AnalysisProgress';
import BillViewer from './components/BillViewer';
import StatementTab from './components/StatementTab';
import DashboardTab from './components/DashboardTab';
import AuditTab from './components/AuditTab';
import CalculationModal from './components/CalculationModal';

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
  const [viewMode, setViewMode] = useState<'statement' | 'metrics' | 'audit'>('statement');
  const [showVerifyModal, setShowVerifyModal] = useState<boolean>(false);
  const [calculatedSummary, setCalculatedSummary] = useState<CalculatedSummary | null>(null);
  const [pendingCalculatedData, setPendingCalculatedData] = useState<BillData | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---
  useEffect(() => {
    const loadModels = async () => {
      try {
        const availableModels = await fetchModels();
        if (availableModels.length > 0) {
          setModels(availableModels);
          if (availableModels.includes('gemma4:12b')) {
            setSelectedModel('gemma4:12b');
          } else {
            setSelectedModel(availableModels[0]);
          }
        }
      } catch (error) {
        console.error('Error fetching available models:', error);
      }
    };
    loadModels();
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

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
    setCalculatedSummary(null);
    setPendingCalculatedData(null);
    setShowVerifyModal(false);
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

    const ocrTimer = setTimeout(() => {
      setLoadingStep('llm');
    }, 4500);

    const llmTimer = setTimeout(() => {
      setLoadingStep('parse');
    }, 15000);

    try {
      const result = await analyzeBill(selectedFile, selectedModel);

      clearTimeout(ocrTimer);
      clearTimeout(llmTimer);

      setLoadingStep('done');
      setTimeout(() => {
        setLoading(false);
        setResults(result);
        setEditableData(result.data);
        
        if (result.data && result.data.audit_calculations) {
          const audit = result.data.audit_calculations;
          const calc = audit.calculated;
          setCalculatedSummary({
            scraped: audit.scraped,
            calculated: calc,
            total_energy_charges: (calc?.demand_charges || 0) + (calc?.energy_charges || 0),
            total_additional_charges: calc?.fppa_surcharge || 0,
            total_miscellaneous_charges: (calc?.electricity_duty || 0) + (calc?.rebate_adjustment || 0),
            total_arrears_lps: calc?.arrear_amount || 0,
            net_bill_amount: calc?.final_payable_amount || 0,
            rebate: calc?.rebate || 0,
            payable_till_due_date: calc?.payable_till_due_date || 0,
            payable_after_due_date: calc?.final_payable_amount || 0,
            
            demand_charges: calc?.demand_charges || 0,
            billed_demand: calc?.billed_demand || 0,
            demand_rate: calc?.demand_rate || 0,
            energy_charges: calc?.energy_charges || 0,
            fppa_surcharge: calc?.fppa_surcharge || 0,
            rebate_adjustment: calc?.rebate_adjustment || 0,
            net_misc_charges: calc?.net_misc_charges || 0,
            electricity_duty: calc?.electricity_duty || 0,
            net_current_bill: calc?.net_current_bill || 0,
            arrear_amount: calc?.arrear_amount || 0,
            final_payable_amount: calc?.final_payable_amount || 0
          });
        }
      }, 800);
    } catch (error: any) {
      clearTimeout(ocrTimer);
      clearTimeout(llmTimer);
      setLoading(false);

      if (error instanceof APIError && error.status === 502) {
        alert(`Analysis Warning: OCR extracted the text, but the LLM failed to structure it.\nError: ${error.message}`);
        setResults({
          success: false,
          raw_text: error.rawText || 'No raw text could be fetched.',
          data: { 
            utility_provider: null,
            customer_details: null,
            billing_details: null,
            reading_tables: null,
            bill_components: null,
            billing_summary: null,
            raw_ocr_analysis_notes: `LLM Error: ${error.message}. View 'Raw OCR Text' tab for manual review.` 
          },
          metadata: error.metadata || { filename: selectedFile.name, processing_time_seconds: 0, content_type: selectedFile.type, model: selectedModel }
        });
      } else {
        alert(`Error running analysis: ${error.message}`);
      }
    }
  };

  // --- Inline Editing Event Handlers ---
  const handleCustomerChange = (field: string, value: string | null) => {
    if (!editableData) return;
    setEditableData({
      ...editableData,
      customer_details: {
        ...editableData.customer_details,
        [field]: value
      } as CustomerDetails
    });
  };

  const handleBillingDetailsChange = (field: string, value: any) => {
    if (!editableData) return;
    setEditableData({
      ...editableData,
      billing_details: {
        ...editableData.billing_details,
        [field]: value
      } as BillingDetails
    });
  };

  const handleBillingPeriodChange = (field: string, value: string | null) => {
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

  const handleReadingChange = (tableIdx: number, readingIdx: number, field: string, value: any) => {
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

  const handleComponentChange = (idx: number, field: string, value: any) => {
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

  const handleBillingSummaryChange = (field: string, value: any) => {
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

  const performBillCalculation = async () => {
    if (!editableData) return;

    try {
      const response = await fetch('/api/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editableData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Recalculation failed');
      }

      const result = await response.json();

      if (result.success) {
        const calc = result.calculations.calculated;
        const summary: CalculatedSummary = {
          scraped: result.calculations.scraped,
          calculated: calc,
          total_energy_charges: (calc?.demand_charges || 0) + (calc?.energy_charges || 0),
          total_additional_charges: calc?.fppa_surcharge || 0,
          total_miscellaneous_charges: (calc?.electricity_duty || 0) + (calc?.rebate_adjustment || 0),
          total_arrears_lps: calc?.arrear_amount || 0,
          net_bill_amount: calc?.final_payable_amount || 0,
          rebate: calc?.rebate || 0,
          payable_till_due_date: calc?.payable_till_due_date || 0,
          payable_after_due_date: calc?.final_payable_amount || 0,
          
          demand_charges: calc?.demand_charges || 0,
          billed_demand: calc?.billed_demand || 0,
          demand_rate: calc?.demand_rate || 0,
          energy_charges: calc?.energy_charges || 0,
          fppa_surcharge: calc?.fppa_surcharge || 0,
          rebate_adjustment: calc?.rebate_adjustment || 0,
          net_misc_charges: calc?.net_misc_charges || 0,
          electricity_duty: calc?.electricity_duty || 0,
          net_current_bill: calc?.net_current_bill || 0,
          arrear_amount: calc?.arrear_amount || 0,
          final_payable_amount: calc?.final_payable_amount || 0
        };

        setCalculatedSummary(summary);
        setPendingCalculatedData(result.data);
        setShowVerifyModal(true);
      }
    } catch (error: any) {
      alert(`Error running bill calculation: ${error.message}`);
    }
  };

  const applyCalculatedTotals = () => {
    if (!pendingCalculatedData) return;
    setEditableData(pendingCalculatedData);
    
    if (results && pendingCalculatedData.audit_calculations) {
      setResults({
        ...results,
        data: {
          ...results.data,
          audit_calculations: pendingCalculatedData.audit_calculations
        }
      });
    }

    setPendingCalculatedData(null);
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
        <Header 
          selectedModel={selectedModel} 
          setSelectedModel={setSelectedModel} 
          models={models} 
        />

        {/* Main Grid */}
        <main className="main-grid">
          {/* Left Panel: Sidebar */}
          <section className="control-sidebar">
            <DropZone 
              selectedFile={selectedFile}
              dragActive={dragActive}
              loading={loading}
              triggerFileSelect={triggerFileSelect}
              handleDrag={handleDrag}
              handleDrop={handleDrop}
              fileInputRef={fileInputRef}
              handleFileChange={handleFileChange}
              handleRemoveFile={handleRemoveFile}
              runAnalysis={runAnalysis}
              csvInputRef={csvInputRef}
              importFromCSV={importFromCSV}
            />
          </section>

          {/* Right Panel: Content View Area */}
          <section className="content-area">
            {/* 1. Placeholder */}
            <AnalysisProgress 
              loading={loading}
              loadingStep={loadingStep}
              hasResults={!!results}
            />

            {/* 2. Results Dashboard */}
            {!loading && results && (
              <div className="results-area">
                {/* Utility summary banner */}
                <div className="glass-card summary-banner">
                  <div className="provider-info" style={{ textAlign: 'left' }}>
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
                    className={`tab-btn ${viewMode === 'audit' ? 'active' : ''}`}
                    onClick={() => setViewMode('audit')}
                  >
                    Calculation Audit
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
                    <StatementTab 
                      data={data as BillData}
                      setEditableData={setEditableData}
                      handleBillingDetailsChange={handleBillingDetailsChange}
                      handleBillingPeriodChange={handleBillingPeriodChange}
                      handleCustomerChange={handleCustomerChange}
                      handleReadingTableRangeChange={handleReadingTableRangeChange}
                      handleReadingChange={handleReadingChange}
                      handleComponentChange={handleComponentChange}
                      addComponentRow={addComponentRow}
                      removeComponentRow={removeComponentRow}
                      handleBillingSummaryChange={handleBillingSummaryChange}
                    />
                  ) : viewMode === 'metrics' ? (
                    <DashboardTab data={data as BillData} />
                  ) : (
                    <AuditTab 
                      data={data as BillData} 
                      calculatedSummary={calculatedSummary} 
                      results={results} 
                    />
                  )}

                  {/* Tabs inspector panel */}
                  <BillViewer 
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    results={results}
                    previewUrl={previewUrl}
                    editableData={data}
                  />
                </div>

                {/* Extraction notes card */}
                {data.raw_ocr_analysis_notes && (
                  <div className="alert-card" style={{ textAlign: 'left' }}>
                    <InfoIcon size={20} />
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

      {/* Audit Modal verification report */}
      <CalculationModal 
        showVerifyModal={showVerifyModal}
        setShowVerifyModal={setShowVerifyModal}
        calculatedSummary={calculatedSummary}
        results={results}
        editableData={editableData}
        applyCalculatedTotals={applyCalculatedTotals}
      />
    </div>
  );
}

// Inline fallback for Info icon
function InfoIcon({ size = 20 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-info">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export default App;
