import React from 'react';
import { Calculator, CheckCircle2, Info } from 'lucide-react';
import type { BillData, CalculatedSummary, AnalysisResponse } from '../types/bill';
import { formatCurrency } from '../utils/formatters';

interface AuditTabProps {
  data: BillData;
  calculatedSummary: CalculatedSummary | null;
  results: AnalysisResponse | null;
}

export const AuditTab: React.FC<AuditTabProps> = ({
  data,
  calculatedSummary,
  results,
}) => {
  const getScrapedValues = () => {
    if (calculatedSummary?.scraped) {
      return calculatedSummary.scraped;
    }
    if (data?.audit_calculations?.scraped) {
      return data.audit_calculations.scraped;
    }
    if (results?.data?.audit_calculations?.scraped) {
      return results.data.audit_calculations.scraped;
    }
    
    // fallback calculation from components
    const scrapedComponents = data.bill_components || [];
    
    let demandVal = 0;
    const demandComp = scrapedComponents.find(c => {
      const name = (c.component_name || '').toLowerCase();
      return name.includes('fixed') || name.includes('demand');
    });
    if (demandComp) demandVal = demandComp.amount || 0;

    let energyVal = 0;
    scrapedComponents.forEach(c => {
      const name = (c.component_name || '').toLowerCase();
      const isSub = c.sno && ['A', 'B', 'C', 'D', 'E', 'F', 'TOTAL'].includes(c.sno.toUpperCase());
      if (name.includes('tod') && !isSub) {
        energyVal += c.amount || 0;
      }
    });

    let fppaVal = 0;
    const fppaComp = scrapedComponents.find(c => {
      const name = (c.component_name || '').toLowerCase();
      return name.includes('fppa') || name.includes('fuel');
    });
    if (fppaComp) fppaVal = fppaComp.amount || 0;

    let rebateAdjVal = 0;
    const rebateAdjComp = scrapedComponents.find(c => {
      const name = (c.component_name || '').toLowerCase();
      return name.includes('due date rebate') || name.includes('rebate adjustment');
    });
    if (rebateAdjComp) rebateAdjVal = rebateAdjComp.amount || 0;

    const netMiscVal = fppaVal + rebateAdjVal;

    let dutyVal = 0;
    const dutyComp = scrapedComponents.find(c => {
      const name = (c.component_name || '').toLowerCase();
      return name.includes('duty') || name.includes('electricity duty');
    });
    if (dutyComp) dutyVal = dutyComp.amount || 0;

    let netCurrentVal = demandVal + energyVal + dutyVal + netMiscVal;
    let arrearVal = data.billing_summary?.total_arrears_lps || 0;
    const finalPayableVal = data.billing_summary?.net_bill_amount || (netCurrentVal + arrearVal);
    const rebateVal = data.billing_summary?.rebate || 0;
    const payableTillDueVal = data.billing_summary?.payable_till_due_date || (finalPayableVal - rebateVal);

    return {
      demand_charges: demandVal,
      energy_charges: energyVal,
      net_misc_charges: netMiscVal,
      electricity_duty: dutyVal,
      net_current_bill: netCurrentVal,
      arrear_amount: arrearVal,
      final_payable_amount: finalPayableVal,
      rebate: rebateVal,
      payable_till_due_date: payableTillDueVal
    };
  };

  const calculated: any = calculatedSummary || data.audit_calculations;
  const scrapedVals = getScrapedValues();
  
  const comparisons = [
    {
      step: 'Step A',
      name: 'Contracted Demand Charges',
      formula: 'Billed Demand × Rate',
      scrapVal: scrapedVals?.demand_charges,
      calcVal: calculated?.calculated?.demand_charges ?? calculated?.demand_charges,
    },
    {
      step: 'Step B',
      name: 'Energy Charges (ToD Based)',
      formula: '∑(TOD_n × Rate_n)',
      scrapVal: scrapedVals?.energy_charges,
      calcVal: calculated?.calculated?.energy_charges ?? calculated?.energy_charges,
    },
    {
      step: 'Step C',
      name: 'Net Miscellaneous Charges',
      formula: 'FPPA Surcharge + Due Date Rebate Adjustment',
      scrapVal: scrapedVals?.net_misc_charges,
      calcVal: calculated?.calculated?.net_misc_charges ?? calculated?.net_misc_charges,
    },
    {
      step: 'Step D',
      name: 'Net Current Bill',
      formula: 'Demand + Energy + Duty + Net Misc',
      scrapVal: scrapedVals?.net_current_bill,
      calcVal: calculated?.calculated?.net_current_bill ?? calculated?.net_current_bill,
    },
    {
      step: 'Step E',
      name: 'Final Payable Amount',
      formula: 'Net Current Bill + Arrear Amount',
      scrapVal: scrapedVals?.final_payable_amount,
      calcVal: calculated?.calculated?.final_payable_amount ?? calculated?.final_payable_amount,
    },
    {
      step: 'Summary',
      name: 'Prompt Payment Rebate',
      formula: '1% of (Demand + Energy + FPPA)',
      scrapVal: scrapedVals?.rebate,
      calcVal: calculated?.calculated?.rebate ?? calculated?.rebate,
    },
    {
      step: 'Summary',
      name: 'Payable Till Due Date',
      formula: 'Final Payable - Rebate',
      scrapVal: scrapedVals?.payable_till_due_date,
      calcVal: calculated?.calculated?.payable_till_due_date ?? calculated?.payable_till_due_date,
    }
  ];
  
  const discrepancies = comparisons.filter(c => Math.abs((c.scrapVal || 0) - (c.calcVal || 0)) >= 1.0);
  const allMatch = discrepancies.length === 0;

  return (
    <div className="dashboard-panel">
      <div className="glass-card">
        <div className="section-header">
          <div className="section-title" style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calculator size={18} style={{ color: 'var(--accent-hover)' }} />
            5-Step Billing Audit Report
          </div>
        </div>
        
        <div className="verify-modal-body" style={{ background: 'transparent', padding: 0 }}>
          <div className={`verify-alert-banner ${allMatch ? 'success' : 'warning'}`} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem', background: allMatch ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', border: allMatch ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(245, 158, 11, 0.2)', textAlign: 'left' }}>
            {allMatch ? (
              <>
                <CheckCircle2 size={24} style={{ color: 'var(--success-color)', flexShrink: 0 }} />
                <div>
                  <strong style={{ display: 'block', fontSize: '0.95rem' }}>Verification Successful!</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                    Calculated values match the statement data perfectly.
                  </p>
                </div>
              </>
            ) : (
              <>
                <Info size={24} style={{ color: 'var(--warning-color)', flexShrink: 0 }} />
                <div>
                  <strong style={{ display: 'block', fontSize: '0.95rem' }}>Discrepancy Detected</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                    Differences found in {discrepancies.length} metrics. Fix OCR errors in Statement layout, then recalculate.
                  </p>
                </div>
              </>
            )}
          </div>
          
          <div style={{ overflowX: 'auto' }}>
            <table className="verify-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 600, width: '12%' }}>Step</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 600, width: '28%' }}>Billing Metric</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 600, width: '25%' }}>Formula</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 600, width: '15%' }}>Scraped (OCR)</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 600, width: '15%' }}>Calculated</th>
                  <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 600, width: '5%' }}>Audit Status</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((item, idx) => {
                  const scrap = item.scrapVal || 0;
                  const calc = item.calcVal || 0;
                  const diff = calc - scrap;
                  const isMatch = Math.abs(diff) < 1.0;
                  
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', background: isMatch ? 'transparent' : 'rgba(239, 68, 68, 0.02)' }}>
                      <td style={{ padding: '0.85rem 0.5rem', textAlign: 'left', color: 'var(--accent-hover)', fontWeight: 700 }}>{item.step}</td>
                      <td style={{ padding: '0.85rem 0.5rem', fontWeight: 600, textAlign: 'left' }}>{item.name}</td>
                      <td style={{ padding: '0.85rem 0.5rem', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{item.formula}</td>
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
        </div>
      </div>
    </div>
  );
};

export default AuditTab;
