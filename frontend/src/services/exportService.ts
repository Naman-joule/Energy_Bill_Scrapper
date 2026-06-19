import ExcelJS from 'exceljs';
import type { BillData } from '../types/bill';
import type { BlockDataResponse } from './api';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  // Primary brand colours (ARGB – "FF" prefix = fully opaque)
  titleBg:        'FF1E3A5F',   // Deep navy
  titleFg:        'FFFFFFFF',   // White
  sectionBg:      'FF2D6A9F',   // Steel blue
  sectionFg:      'FFFFFFFF',
  colHeaderBg:    'FF3B82C4',   // Vivid blue
  colHeaderFg:    'FFFFFFFF',
  subtotalBg:     'FFDBEAFE',   // Pale blue
  subtotalFg:     'FF1E3A5F',
  grandTotalBg:   'FF1E3A5F',   // Deep navy
  grandTotalFg:   'FFFFD700',   // Gold
  altRowBg:       'FFF0F7FF',   // Very light blue
  normalRowBg:    'FFFFFFFF',
  border:         'FFCBD5E1',   // Slate-200
  labelFg:        'FF374151',   // Gray-700
  positiveFg:     'FF16A34A',   // Green-600
  negativeFg:     'FFDC2626',   // Red-600
  noteBg:         'FFFFFBEB',   // Amber-50
  noteFg:         'FF92400E',   // Amber-800

  // TOD Zone colours
  zone1Bg:        'FFFEF3C7',   // Amber-100  – Peak
  zone1Fg:        'FF92400E',   // Amber-800
  zone2Bg:        'FFD1FAE5',   // Emerald-100 – Normal
  zone2Fg:        'FF065F46',   // Emerald-800
  zone3Bg:        'FFE0E7FF',   // Indigo-100 – Off-Peak/Night
  zone3Fg:        'FF3730A3',   // Indigo-800
};

const FONT_NAME = 'Calibri';

// ─── Helper: Cell builder ──────────────────────────────────────────────────────
function styleCell(
  cell: ExcelJS.Cell,
  opts: {
    bold?: boolean;
    italic?: boolean;
    size?: number;
    fgColor?: string;
    bgColor?: string;
    hAlign?: ExcelJS.Alignment['horizontal'];
    vAlign?: ExcelJS.Alignment['vertical'];
    numFmt?: string;
    wrapText?: boolean;
    borderStyle?: ExcelJS.BorderStyle;
    borderColor?: string;
  } = {}
) {
  const {
    bold = false, italic = false, size = 10, fgColor,
    bgColor, hAlign = 'left', vAlign = 'middle',
    numFmt, wrapText = false,
    borderStyle = 'thin', borderColor = C.border,
  } = opts;

  cell.font = { name: FONT_NAME, bold, italic, size, color: fgColor ? { argb: fgColor } : undefined };
  if (bgColor) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  }
  cell.alignment = { horizontal: hAlign, vertical: vAlign, wrapText };
  if (numFmt) cell.numFmt = numFmt;

  const bs = { style: borderStyle as ExcelJS.BorderStyle, color: { argb: borderColor } };
  cell.border = { top: bs, left: bs, bottom: bs, right: bs };
}

// Set a cell value as an Excel formula (with optional fallback result for tools
// that don't calculate).
function setFormula(cell: ExcelJS.Cell, formula: string, result: ExcelJS.CellValue = 0) {
  cell.value = { formula, result } as ExcelJS.CellFormulaValue;
}

// ─── Main export function ──────────────────────────────────────────────────────
export async function exportToXLSX(editableData: BillData): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'Energy Bill Scrapper';
  wb.lastModifiedBy = 'Energy Bill Scrapper';
  wb.created  = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet('Energy Bill', {
    views: [{ state: 'normal', showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  // Column widths  A   B    C    D    E   F   G
  ws.columns = [
    { width: 6  }, // A  Sno / key col
    { width: 34 }, // B  Category / label
    { width: 32 }, // C  Component name / value
    { width: 16 }, // D  Consumption / value
    { width: 14 }, // E  Rate
    { width: 10 }, // F  Unit
    { width: 18 }, // G  Amount (Rs.)
  ];

  let r = 1; // current 1-based Excel row counter

  // ─── Small helpers ───────────────────────────────────────────────────────────
  const merge = (c1: string, c2: string) => ws.mergeCells(`${c1}${r}:${c2}${r}`);

  const addGap = (rows = 1) => { r += rows; };

  const addTitleRow = (text: string) => {
    merge('A', 'G');
    const cell = ws.getCell(`A${r}`);
    cell.value = text;
    styleCell(cell, { bold: true, size: 16, fgColor: C.titleFg, bgColor: C.titleBg, hAlign: 'center' });
    ws.getRow(r).height = 36;
    r++;
  };

  const addSubtitle = (text: string) => {
    merge('A', 'G');
    const cell = ws.getCell(`A${r}`);
    cell.value = text;
    styleCell(cell, { italic: true, size: 9, fgColor: 'FF94A3B8', bgColor: C.titleBg, hAlign: 'center' });
    ws.getRow(r).height = 18;
    r++;
  };

  const addSectionHeader = (text: string) => {
    merge('A', 'G');
    const cell = ws.getCell(`A${r}`);
    cell.value = ('  ' + text).toUpperCase();
    styleCell(cell, { bold: true, size: 11, fgColor: C.sectionFg, bgColor: C.sectionBg });
    ws.getRow(r).height = 24;
    r++;
  };

  // Key-value pair row (label spanning A:B, value spanning C:G)
  let _kvAlt = false;
  const addKV = (label: string, value: string | number | null) => {
    const bg = _kvAlt ? C.altRowBg : C.normalRowBg;
    _kvAlt = !_kvAlt;

    merge('A', 'B');
    const lc = ws.getCell(`A${r}`);
    lc.value = label;
    styleCell(lc, { bold: true, size: 10, fgColor: C.labelFg, bgColor: bg });

    merge('C', 'G');
    const vc = ws.getCell(`C${r}`);
    vc.value = value ?? '';
    styleCell(vc, { size: 10, bgColor: bg });

    ws.getRow(r).height = 18;
    r++;
  };

  // Column header row (for tables)
  const addColHeaders = (...labels: string[]) => {
    labels.forEach((lbl, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = lbl;
      styleCell(cell, {
        bold: true, size: 10, fgColor: C.colHeaderFg, bgColor: C.colHeaderBg,
        hAlign: i >= 3 ? 'right' : 'left', borderStyle: 'medium',
      });
    });
    ws.getRow(r).height = 22;
    r++;
  };

  // ─── TITLE ───────────────────────────────────────────────────────────────────
  addTitleRow(editableData.utility_provider || 'Electricity Bill');
  addSubtitle(`Generated on ${new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}`);
  addGap();

  // ─── CUSTOMER DETAILS ────────────────────────────────────────────────────────
  _kvAlt = false;
  addSectionHeader('Customer Details');
  addKV('Name', editableData.customer_details?.name ?? null);
  addKV('Billing Address', editableData.customer_details?.billing_address ?? null);
  addKV('Service Address', editableData.customer_details?.service_address ?? null);
  addGap();

  // ─── BILLING DETAILS ─────────────────────────────────────────────────────────
  _kvAlt = false;
  addSectionHeader('Billing Details');
  addKV('Account Number',       editableData.billing_details?.account_number ?? null);
  addKV('Meter Number',         editableData.billing_details?.meter_number ?? null);
  addKV('Invoice Number',       editableData.billing_details?.invoice_number ?? null);
  addKV('Bill Date',            editableData.billing_details?.bill_date ?? null);
  addKV('Due Date',             editableData.billing_details?.due_date ?? null);
  addKV('Discount Date',        editableData.billing_details?.discont_date ?? null);
  addKV('Billing Period',
    `${editableData.billing_details?.billing_period?.start_date ?? ''} → ${editableData.billing_details?.billing_period?.end_date ?? ''}`
  );
  addKV('Contracted Demand (KVA)', editableData.billing_details?.contracted_demand_kva ?? null);
  addKV('Billable Demand (KVA)',   editableData.billing_details?.billable_demand_kva ?? null);
  addKV('Tariff Code',            editableData.billing_details?.tariff_code ?? null);
  addKV('Supply Voltage',         editableData.billing_details?.supply_voltage ?? null);
  addGap();

  // ─── READING TABLES ──────────────────────────────────────────────────────────
  if (editableData.reading_tables?.length) {
    editableData.reading_tables.forEach((table, idx) => {
      addSectionHeader(`Meter Readings — Table ${idx + 1}  (Period: ${table.reading_from ?? ''})`);
      addColHeaders('Zone Name', 'Present Reading', 'Past Reading', 'Difference', 'Mult. Factor', 'Total Consumption');

      let altReading = false;
      table.readings?.forEach(reading => {
        const rowBg = altReading ? C.altRowBg : C.normalRowBg;
        altReading = !altReading;
        const dataRow = r;

        const cells = [
          reading.zone_name ?? '',
          reading.present_reading ?? '',
          reading.past_reading ?? '',
          null, // formula
          reading.multiplying_factor ?? '',
          null, // formula
        ];

        cells.forEach((val, i) => {
          const cell = ws.getCell(dataRow, i + 1);
          if (i === 3) {
            setFormula(cell, `B${dataRow}-C${dataRow}`,
              (reading.present_reading ?? 0) - (reading.past_reading ?? 0));
          } else if (i === 5) {
            const diff = (reading.present_reading ?? 0) - (reading.past_reading ?? 0);
            const mf   = reading.multiplying_factor ?? 1;
            setFormula(cell, `D${dataRow}*E${dataRow}`, diff * mf);
          } else {
            cell.value = val as ExcelJS.CellValue;
          }
          styleCell(cell, {
            size: 10, bgColor: rowBg,
            hAlign: i >= 3 ? 'right' : 'left',
            numFmt: i >= 1 ? '#,##0.00' : undefined,
          });
        });
        ws.getRow(dataRow).height = 18;
        r++;
      });
      addGap();
    });
  }

  // ─── BILL COMPONENTS ─────────────────────────────────────────────────────────
  addSectionHeader('Bill Components');
  addColHeaders('S.No', 'Category', 'Component', 'Consumption', 'Rate', 'Unit', 'Amount (Rs.)');

  // Track row numbers per category for subtotals
  const catRows: Record<string, number[]> = {
    'Current Demand and Energy Charges After Open Access': [],
    'Additional Charges': [],
    'Miscellaneous Charges': [],
    'Arrear and LPS Charges': [],
    _other: [],
  };

  let rowSubA = 0, rowSubB = 0, rowSubC = 0, rowSubD = 0, rowSubE = 0, rowSubF = 0;
  let rowFPPA = 0;

  const SUBTOTAL_SNOS = new Set(['A', 'B', 'C', 'D', 'E', 'F']);
  let altComp = false;

  editableData.bill_components?.forEach(comp => {
    const sno = (comp.sno ?? '').toUpperCase().trim();
    const isSubtotal = SUBTOTAL_SNOS.has(sno);
    const compRow = r;

    if (isSubtotal) {
      // ── Subtotal row styling ─────────────────────────────────────────────────
      let formula = '';
      let result  = 0;

      if (sno === 'A') {
        rowSubA = compRow;
        const refs = catRows['Current Demand and Energy Charges After Open Access'];
        formula = refs.length ? refs.map(rr => `G${rr}`).join('+') : '0';
        result  = refs.reduce((s, rr) => s + (ws.getCell(`G${rr}`).value as number || 0), 0);
      } else if (sno === 'B') {
        rowSubB = compRow;
        const refs = catRows['Additional Charges'];
        formula = refs.length ? refs.map(rr => `G${rr}`).join('+') : '0';
        result  = refs.reduce((s, rr) => s + (ws.getCell(`G${rr}`).value as number || 0), 0);
      } else if (sno === 'C') {
        rowSubC = compRow;
        formula = (rowSubA && rowSubB) ? `G${rowSubA}+G${rowSubB}` : '0';
        result  = (rowSubA ? (ws.getCell(`G${rowSubA}`).value as number || 0) : 0)
                + (rowSubB ? (ws.getCell(`G${rowSubB}`).value as number || 0) : 0);
      } else if (sno === 'D') {
        rowSubD = compRow;
        const refs = catRows['Miscellaneous Charges'];
        formula = refs.length ? refs.map(rr => `G${rr}`).join('+') : '0';
        result  = refs.reduce((s, rr) => s + (ws.getCell(`G${rr}`).value as number || 0), 0);
      } else if (sno === 'E') {
        rowSubE = compRow;
        const refs = catRows['Arrear and LPS Charges'];
        formula = refs.length ? refs.map(rr => `G${rr}`).join('+') : '0';
        result  = refs.reduce((s, rr) => s + (ws.getCell(`G${rr}`).value as number || 0), 0);
      } else if (sno === 'F') {
        rowSubF = compRow;
        formula = (rowSubC && rowSubD)
          ? `G${rowSubC}+G${rowSubD}+G${rowSubE}`
          : '0';
        result  = (rowSubC ? (ws.getCell(`G${rowSubC}`).value as number || 0) : 0)
                + (rowSubD ? (ws.getCell(`G${rowSubD}`).value as number || 0) : 0)
                + (rowSubE ? (ws.getCell(`G${rowSubE}`).value as number || 0) : 0);
      }

      const rowData = [sno, comp.category ?? '', comp.component_name ?? '', '', '', '', ''];
      rowData.forEach((val, i) => {
        const cell = ws.getCell(compRow, i + 1);
        if (i === 6) {
          if (formula !== '0') setFormula(cell, formula, result);
          else cell.value = 0;
          styleCell(cell, {
            bold: true, size: 10, fgColor: C.subtotalFg, bgColor: C.subtotalBg,
            hAlign: 'right', numFmt: '#,##0.00', borderStyle: 'medium',
          });
        } else {
          cell.value = val;
          styleCell(cell, {
            bold: true, size: 10, fgColor: C.subtotalFg, bgColor: C.subtotalBg,
            hAlign: i >= 3 ? 'right' : 'left', borderStyle: 'medium',
          });
        }
      });
      ws.getRow(compRow).height = 20;

    } else {
      // ── Normal component row ─────────────────────────────────────────────────
      const cat = comp.category ?? 'Current Demand and Energy Charges After Open Access';
      if (catRows[cat]) catRows[cat].push(compRow);
      else catRows['_other'].push(compRow);

      const name = (comp.component_name ?? '').toLowerCase();
      if (name.includes('fppa') || name.includes('fuel')) rowFPPA = compRow;

      const rowBg = altComp ? C.altRowBg : C.normalRowBg;
      altComp = !altComp;

      const hasCalc = comp.consumption != null && comp.rate != null
                   && (comp.consumption ?? 0) > 0 && (comp.rate ?? 0) > 0;

      const rawAmount = comp.amount ?? 0;
      const calcAmount = hasCalc
        ? Math.round((comp.consumption ?? 0) * (comp.rate ?? 0))
        : rawAmount;

      const rowData = [
        comp.sno ?? '',
        comp.category ?? '',
        comp.component_name ?? '',
        comp.consumption ?? '',
        comp.rate ?? '',
        comp.unit ?? '',
        '',
      ];

      rowData.forEach((val, i) => {
        const cell = ws.getCell(compRow, i + 1);
        if (i === 6) {
          if (hasCalc) {
            setFormula(cell, `ROUND(D${compRow}*E${compRow},0)`, calcAmount);
          } else {
            cell.value = rawAmount;
          }
          styleCell(cell, {
            size: 10, bgColor: rowBg,
            hAlign: 'right', numFmt: '#,##0.00',
          });
        } else {
          cell.value = val as ExcelJS.CellValue;
          styleCell(cell, {
            size: 10, bgColor: rowBg,
            hAlign: i >= 3 ? 'right' : 'left',
            numFmt: i === 3 || i === 4 ? '#,##0.00' : undefined,
          });
        }
      });
      ws.getRow(compRow).height = 18;
    }
    r++;
  });

  addGap();

  // ─── BILLING SUMMARY ─────────────────────────────────────────────────────────
  addSectionHeader('Billing Summary');

  const addSummaryRow = (
    label: string,
    formula: string | null,
    fallback: number | null,
    result: number,
    isGrandTotal = false,
  ) => {
    const summRow = r;
    merge('A', 'F');
    const lc = ws.getCell(`A${summRow}`);
    lc.value = label;

    const vc = ws.getCell(`G${summRow}`);
    if (formula) setFormula(vc, formula, result);
    else         vc.value = fallback ?? 0;

    if (isGrandTotal) {
      styleCell(lc, { bold: true, size: 12, fgColor: C.grandTotalFg, bgColor: C.grandTotalBg, borderStyle: 'medium' });
      styleCell(vc, { bold: true, size: 12, fgColor: C.grandTotalFg, bgColor: C.grandTotalBg,
                      hAlign: 'right', numFmt: '₹#,##0.00', borderStyle: 'medium' });
      ws.getRow(summRow).height = 28;
    } else {
      const altBg = (r % 2 === 0) ? C.altRowBg : C.normalRowBg;
      styleCell(lc, { bold: true, size: 10, fgColor: C.labelFg, bgColor: altBg });
      styleCell(vc, { size: 10, fgColor: C.labelFg, bgColor: altBg,
                      hAlign: 'right', numFmt: '#,##0.00' });
      ws.getRow(summRow).height = 20;
    }
    r++;
    return summRow;
  };

  const bs = editableData.billing_summary;
  addSummaryRow('Total Energy Charges',
    rowSubA ? `G${rowSubA}` : null,
    bs?.total_energy_charges ?? null,
    rowSubA ? (ws.getCell(`G${rowSubA}`).value as number || 0) : (bs?.total_energy_charges ?? 0));

  addSummaryRow('Total Additional Charges',
    rowSubB ? `G${rowSubB}` : null,
    bs?.total_additional_charges ?? null,
    rowSubB ? (ws.getCell(`G${rowSubB}`).value as number || 0) : (bs?.total_additional_charges ?? 0));

  addSummaryRow('Total Miscellaneous Charges',
    rowSubD ? `G${rowSubD}` : null,
    bs?.total_miscellaneous_charges ?? null,
    rowSubD ? (ws.getCell(`G${rowSubD}`).value as number || 0) : (bs?.total_miscellaneous_charges ?? 0));

  addSummaryRow('Total Arrears & LPS',
    rowSubE ? `G${rowSubE}` : null,
    bs?.total_arrears_lps ?? null,
    rowSubE ? (ws.getCell(`G${rowSubE}`).value as number || 0) : (bs?.total_arrears_lps ?? 0));

  const netBillRow = addSummaryRow('Net Bill Amount',
    rowSubF ? `G${rowSubF}` : null,
    bs?.net_bill_amount ?? null,
    rowSubF ? (ws.getCell(`G${rowSubF}`).value as number || 0) : (bs?.net_bill_amount ?? 0));

  // Rebate formula
  let rebateFormula: string | null = null;
  if (rowSubA) {
    rebateFormula = rowFPPA
      ? `ROUND((G${rowSubA}+G${rowFPPA})*0.01,0)`
      : `ROUND(G${rowSubA}*0.01,0)`;
  }
  const rebateResult = bs?.rebate ?? 0;
  const rebateRow = addSummaryRow('Rebate (1%)', rebateFormula, rebateResult, rebateResult);

  // Payable amounts — grand total style
  addSummaryRow(
    'Payable Till Due Date',
    `G${netBillRow}-G${rebateRow}`,
    null,
    (ws.getCell(`G${netBillRow}`).value as number || 0) - (ws.getCell(`G${rebateRow}`).value as number || 0),
    true,
  );
  addSummaryRow(
    'Payable After Due Date',
    `G${netBillRow}`,
    null,
    ws.getCell(`G${netBillRow}`).value as number || 0,
    true,
  );

  // ─── FOOTER NOTE ─────────────────────────────────────────────────────────────
  addGap();
  merge('A', 'G');
  const noteCell = ws.getCell(`A${r}`);
  noteCell.value = '⚡ This report was auto-generated by Energy Bill Scrapper. All formula cells recalculate automatically in Excel / Google Sheets.';
  styleCell(noteCell, { italic: true, size: 9, fgColor: C.noteFg, bgColor: C.noteBg, wrapText: true });
  ws.getRow(r).height = 22;

  // ─── Write & Download ────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href  = url;
  const acct = editableData.billing_details?.account_number ?? 'export';
  link.download = `energy_bill_${acct}_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Zone colour helper ────────────────────────────────────────────────────────
function zoneColors(zone: string): { bg: string; fg: string } {
  const z = zone.toLowerCase();
  if (z.includes('tod-1') || z.includes('peak')) return { bg: C.zone1Bg, fg: C.zone1Fg };
  if (z.includes('tod-2') || z.includes('normal')) return { bg: C.zone2Bg, fg: C.zone2Fg };
  return { bg: C.zone3Bg, fg: C.zone3Fg };  // TOD-3 / Off-Peak / Night
}

// ─── Block-data XLSX export ────────────────────────────────────────────────────
export async function exportBlockDataToXLSX(
  blockData: BlockDataResponse,
  billData: BillData,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator         = 'Energy Bill Scrapper';
  wb.lastModifiedBy  = 'Energy Bill Scrapper';
  wb.created         = new Date();
  wb.modified        = new Date();

  // ── Sheet 1: TOD Zone Summary ────────────────────────────────────────────────
  const wsSummary = wb.addWorksheet('TOD Summary', {
    views: [{ state: 'normal', showGridLines: false }],
  });

  wsSummary.columns = [
    { width: 28 }, // A – Zone
    { width: 18 }, // B – Total Consumption (kWh)
    { width: 16 }, // C – Blocks/day
    { width: 16 }, // D – Total Blocks
    { width: 22 }, // E – Consumption/Block (kWh)
    { width: 18 }, // F – Rate (Rs/kWh)
    { width: 20 }, // G – Total Amount (Rs)
  ];

  // Title
  wsSummary.mergeCells('A1:G1');
  const titleCell = wsSummary.getCell('A1');
  titleCell.value = `15-Min Block Data — TOD Summary  |  ${billData.utility_provider ?? ''}`;
  styleCell(titleCell, { bold: true, size: 14, fgColor: C.titleFg, bgColor: C.titleBg, hAlign: 'center' });
  wsSummary.getRow(1).height = 32;

  // Sub-header
  wsSummary.mergeCells('A2:G2');
  const subCell = wsSummary.getCell('A2');
  subCell.value = `Billing Period: ${blockData.billing_period.start_date} → ${blockData.billing_period.end_date}  |  ${blockData.billing_period.total_days} days  |  ${blockData.billing_period.total_blocks.toLocaleString('en-IN')} total blocks`;
  styleCell(subCell, { italic: true, size: 9, fgColor: 'FF94A3B8', bgColor: C.titleBg, hAlign: 'center' });
  wsSummary.getRow(2).height = 18;

  // Column headers
  const summHeaders = ['TOD Zone', 'Total Consumption (kWh)', 'Blocks/Day', 'Total Blocks', 'Consumption/Block (kWh)', 'Rate (₹/kWh)', 'Total Amount (₹)'];
  summHeaders.forEach((h, i) => {
    const cell = wsSummary.getCell(3, i + 1);
    cell.value = h;
    styleCell(cell, { bold: true, size: 10, fgColor: C.colHeaderFg, bgColor: C.colHeaderBg,
      hAlign: i >= 1 ? 'right' : 'left', borderStyle: 'medium' });
  });
  wsSummary.getRow(3).height = 22;

  let grandTotalConsumption = 0;
  let grandTotalAmount = 0;

  blockData.tod_summary.forEach((zone, idx) => {
    const zrow = idx + 4;
    const { bg, fg } = zoneColors(zone.zone);
    const totalAmt = zone.total_consumption_kwh * zone.rate_per_kwh;
    grandTotalConsumption += zone.total_consumption_kwh;
    grandTotalAmount      += totalAmt;

    const vals = [
      zone.zone,
      zone.total_consumption_kwh,
      zone.blocks_per_day,
      zone.total_blocks,
      zone.consumption_per_block,
      zone.rate_per_kwh,
      totalAmt,
    ];
    vals.forEach((v, i) => {
      const cell = wsSummary.getCell(zrow, i + 1);
      cell.value = v as ExcelJS.CellValue;
      styleCell(cell, {
        size: 10, bgColor: bg, fgColor: fg,
        hAlign: i >= 1 ? 'right' : 'left',
        numFmt: i === 0 ? undefined : (i === 2 || i === 3 ? '#,##0' : '#,##0.000000'),
      });
    });
    wsSummary.getRow(zrow).height = 20;
  });

  // Grand total row
  const gtRow = 4 + blockData.tod_summary.length;
  const gtVals: (string | number)[] = ['TOTAL', grandTotalConsumption, '', blockData.billing_period.total_blocks, '', '', grandTotalAmount];
  gtVals.forEach((v, i) => {
    const cell = wsSummary.getCell(gtRow, i + 1);
    cell.value = v as ExcelJS.CellValue;
    styleCell(cell, {
      bold: true, size: 11, fgColor: C.grandTotalFg, bgColor: C.grandTotalBg,
      hAlign: i >= 1 ? 'right' : 'left',
      numFmt: i === 1 ? '#,##0.000' : (i === 3 ? '#,##0' : (i === 6 ? '₹#,##0.00' : undefined)),
      borderStyle: 'medium',
    });
  });
  wsSummary.getRow(gtRow).height = 26;

  // ── Sheet 2: 15-Min Block Data ───────────────────────────────────────────────
  const wsBlocks = wb.addWorksheet('15-Min Blocks', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1, showGridLines: false }],
  });

  wsBlocks.columns = [
    { width: 13 },  // A – Date
    { width: 8  },  // B – Time
    { width: 10 },  // C – Block # (day)
    { width: 14 },  // D – Global Block #
    { width: 26 },  // E – TOD Zone
    { width: 20 },  // F – Consumption (kWh)
    { width: 16 },  // G – Rate (₹/kWh)
    { width: 18 },  // H – Amount (₹)
  ];

  // Column headers (row 1 – frozen)
  const blockHeaders = ['Date', 'Time', 'Block# (Day)', 'Block# (Global)', 'TOD Zone', 'Consumption (kWh)', 'Rate (₹/kWh)', 'Amount (₹)'];
  blockHeaders.forEach((h, i) => {
    const cell = wsBlocks.getCell(1, i + 1);
    cell.value = h;
    styleCell(cell, {
      bold: true, size: 10, fgColor: C.colHeaderFg, bgColor: C.colHeaderBg,
      hAlign: i >= 5 ? 'right' : (i === 0 || i === 1 ? 'center' : 'left'),
      borderStyle: 'medium',
    });
  });
  wsBlocks.getRow(1).height = 24;

  // Enable auto-filter on header row
  wsBlocks.autoFilter = { from: 'A1', to: 'H1' };

  // Data rows
  blockData.blocks.forEach((blk, idx) => {
    const rowNum = idx + 2;
    const { bg } = zoneColors(blk.tod_zone);
    // Alternate between zone colour and white for readability
    const rowBg = idx % 2 === 0 ? bg : C.normalRowBg;

    const vals: (string | number)[] = [
      blk.date,
      blk.time,
      blk.block_index,
      blk.global_block_num,
      blk.tod_zone,
      blk.consumption_kwh,
      blk.rate_per_kwh,
      blk.amount_rs,
    ];

    vals.forEach((v, i) => {
      const cell = wsBlocks.getCell(rowNum, i + 1);
      cell.value = v as ExcelJS.CellValue;
      styleCell(cell, {
        size: 9,
        bgColor: rowBg,
        hAlign: i >= 5 ? 'right' : (i <= 1 ? 'center' : 'left'),
        numFmt: i === 5 ? '#,##0.000000' : (i === 6 ? '#,##0.0000' : (i === 7 ? '#,##0.0000' : undefined)),
        borderStyle: 'hair',
      });
    });
    wsBlocks.getRow(rowNum).height = 15;
  });

  // ─── Write & Download ────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href  = url;
  const acct = billData.billing_details?.account_number ?? 'export';
  const period = blockData.billing_period.start_date.replace(/-/g, '');
  link.download = `block_data_${acct}_${period}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


