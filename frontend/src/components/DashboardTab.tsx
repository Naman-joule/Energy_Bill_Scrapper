import React from 'react';
import { User, Calendar, Activity, Receipt } from 'lucide-react';
import type { BillData } from '../types/bill';
import { formatDate, formatNumber, formatCurrency } from '../utils/formatters';

interface DashboardTabProps {
  data: BillData;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({ data }) => {
  return (
    <div className="dashboard-panel">
      {/* Customer Info Card */}
      <div className="glass-card">
        <div className="section-header">
          <div className="section-title" style={{ textAlign: 'left', display: 'flex', alignItems: 'center' }}>
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
          <div className="section-title" style={{ textAlign: 'left', display: 'flex', alignItems: 'center' }}>
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
            <div className="section-title" style={{ textAlign: 'left', display: 'flex', alignItems: 'center' }}>
              <Activity size={18} style={{ marginRight: '8px' }} />
              Time of Day (TOD) Consumption Tables
            </div>
          </div>
          {data.reading_tables.map((table, tIdx) => (
            <div key={tIdx} className="tod-table-container" style={{ borderBottom: tIdx < data.reading_tables!.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textDecoration: 'underline', textAlign: 'left' }}>
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
          <div className="section-title" style={{ textAlign: 'left', display: 'flex', alignItems: 'center' }}>
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
  );
};

export default DashboardTab;
