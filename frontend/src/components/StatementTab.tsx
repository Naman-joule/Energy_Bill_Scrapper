import React from 'react';
import type { BillData, BillComponentItem } from '../types/bill';

interface StatementTabProps {
  data: BillData;
  setEditableData: React.Dispatch<React.SetStateAction<BillData | null>>;
  handleBillingDetailsChange: (field: string, val: any) => void;
  handleBillingPeriodChange: (field: string, val: any) => void;
  handleCustomerChange: (field: string, val: any) => void;
  handleReadingTableRangeChange: (tIdx: number, val: string) => void;
  handleReadingChange: (tIdx: number, rIdx: number, field: string, val: string) => void;
  handleComponentChange: (idx: number, field: string, val: string) => void;
  addComponentRow: (category: string) => void;
  removeComponentRow: (idx: number) => void;
  handleBillingSummaryChange: (field: string, val: any) => void;
}

export const StatementTab: React.FC<StatementTabProps> = ({
  data,
  setEditableData,
  handleBillingDetailsChange,
  handleBillingPeriodChange,
  handleCustomerChange,
  handleReadingTableRangeChange,
  handleReadingChange,
  handleComponentChange,
  addComponentRow,
  removeComponentRow,
  handleBillingSummaryChange,
}) => {
  return (
    <div className="bill-paper">
      {/* Header */}
      <div className="bill-paper-header">
        <div className="bill-paper-title" style={{ width: '70%', textAlign: 'left' }}>
          <input 
            type="text" 
            value={data.utility_provider || ''} 
            onChange={(e) => setEditableData(prev => prev ? { ...prev, utility_provider: e.target.value } : null)} 
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
        <div className="bill-paper-customer-box" style={{ textAlign: 'left' }}>
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
          <p style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'left' }}>No reading tables found.</p>
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
  );
};

export default StatementTab;
