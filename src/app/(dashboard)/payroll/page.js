'use client';
import { useState, useEffect, useCallback } from 'react';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function ProcessModal({ open, onClose, onDone }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');

  async function run() {
    setRunning(true); setMsg('');
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(data.message);
      setTimeout(() => { onDone(); onClose(); setMsg(''); }, 1400);
    } catch (err) { setMsg(`Error: ${err.message}`); }
    finally { setRunning(false); }
  }

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b"
             style={{ borderColor:'rgba(201,150,58,0.1)' }}>
          <h2 className="font-display font-bold text-xl" style={{ color:'#C9963A' }}>Process Payroll</h2>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color:'#3A3A5C' }}>×</button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm" style={{ color:'#5C5C85' }}>
            Runs the <code className="font-mono px-1.5 py-0.5 rounded text-xs"
            style={{ background:'rgba(201,150,58,0.1)', color:'#C9963A' }}>process_payroll</code> stored
            procedure for all active employees in your company.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Month</label>
              <select value={month} onChange={e => setMonth(Number(e.target.value))} className="field">
                {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Year</label>
              <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
                className="field" min="2020" max="2030" />
            </div>
          </div>
          {msg && (
            <div className={msg.startsWith('Error') ? 'banner-error' : 'banner-success'}>{msg}</div>
          )}
        </div>
        <div className="px-6 pb-6 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={run} disabled={running} className="btn-primary">
            {running ? <><span className="spinner" style={{ width:14,height:14,borderWidth:2 }} /> Running…</> : '⚡ Run Payroll'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PayrollPage() {
  const now = new Date();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(false);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear,  setFilterYear]  = useState(String(now.getFullYear()));

  const fetchPayroll = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filterMonth) p.set('month', filterMonth);
    if (filterYear)  p.set('year',  filterYear);
    fetch(`/api/payroll?${p}`)
      .then(r => r.json())
      .then(d => { setRecords(d.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filterMonth, filterYear]);

  useEffect(() => { fetchPayroll(); }, [fetchPayroll]);

  async function markPaid() {
    if (!filterMonth || !filterYear) { alert('Select a specific month and year first'); return; }
    await fetch('/api/payroll', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: filterMonth, year: filterYear }),
    });
    fetchPayroll();
  }

  const totalGross = records.reduce((s,r) => s + Number(r.GROSS_SALARY||0), 0);
  const totalNet   = records.reduce((s,r) => s + Number(r.NET_SALARY||0),   0);
  const totalPF    = records.reduce((s,r) => s + Number(r.PF_DEDUCTION||0), 0);
  const totalTax   = records.reduce((s,r) => s + Number(r.TAX_DEDUCTION||0),0);
  const fmt = n => `₹${Number(n).toLocaleString('en-IN')}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="anim-up">
          <div className="font-mono text-xs mb-1" style={{ color:'#3A3A5C' }}>◎ Payroll</div>
          <h1 className="page-title">Payroll <span style={{ color:'#C9963A' }}>Records</span></h1>
          <p className="page-subtitle">{records.length} records found</p>
        </div>
        <div className="flex gap-3 anim-up">
          {filterMonth && filterYear && records.some(r => r.STATUS === 'PROCESSED') && (
            <button onClick={markPaid} className="btn-ghost">✓ Mark Paid</button>
          )}
          <button onClick={() => setModal(true)} className="btn-primary">⚡ Process Payroll</button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 anim-up delay-1">
        {[
          { label:'Total Gross', value:fmt(totalGross), color:'#C9963A' },
          { label:'Total Net',   value:fmt(totalNet),   color:'#3DBF82' },
          { label:'PF Total',    value:fmt(totalPF),    color:'#E05A5A' },
          { label:'Tax Total',   value:fmt(totalTax),   color:'#5C5C85' },
        ].map((c,i) => (
          <div key={i} className="stat-card">
            <div className="label" style={{ color:c.color }}>{c.label}</div>
            <div className="font-mono font-extrabold text-xl mt-1" style={{ color:'#EEEEF5' }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="glass rounded-2xl p-4 flex flex-wrap gap-3 anim-up delay-2">
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          className="field" style={{ width:170 }}>
          <option value="">All Months</option>
          {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <input type="number" value={filterYear} onChange={e => setFilterYear(e.target.value)}
          placeholder="Year" className="field" style={{ width:110 }} min="2020" max="2030" />
        <button onClick={() => { setFilterMonth(''); setFilterYear(String(now.getFullYear())); }}
          className="btn-ghost">Reset</button>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden anim-up delay-3">
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
        ) : records.length === 0 ? (
          <div className="text-center py-20">
            <div style={{ fontSize:48 }} className="mb-3">💸</div>
            <p className="font-display font-bold" style={{ color:'#5C5C85' }}>No payroll records</p>
            <p className="text-sm mt-1 mb-5" style={{ color:'#3A3A5C' }}>
              Add employees and click "Process Payroll" to generate records
            </p>
            <button onClick={() => setModal(true)} className="btn-primary">⚡ Process Now</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full tbl">
              <thead>
                <tr>
                  <th className="text-left pl-6">Employee</th>
                  <th className="text-left">Dept</th>
                  <th className="text-center">Period</th>
                  <th className="text-right">Basic</th>
                  <th className="text-right">Gross</th>
                  <th className="text-right">PF</th>
                  <th className="text-right">Tax</th>
                  <th className="text-right">Net Pay</th>
                  <th className="text-center">Days</th>
                  <th className="text-left pr-6">Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r,i) => (
                  <tr key={i}>
                    <td className="pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                             style={{ background:'rgba(201,150,58,0.15)', color:'#C9963A' }}>
                          {r.FULL_NAME?.[0]}
                        </div>
                        <div>
                          <div className="font-medium text-sm" style={{ color:'#EEEEF5' }}>{r.FULL_NAME}</div>
                          <div className="text-xs" style={{ color:'#3A3A5C' }}>{r.JOB_TITLE}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-sm" style={{ color:'#5C5C85' }}>{r.DEPT_NAME||'—'}</td>
                    <td className="text-center font-mono text-xs" style={{ color:'#5C5C85' }}>
                      {MO[(r.PAY_MONTH||1)-1]} {r.PAY_YEAR}
                    </td>
                    <td className="text-right font-mono text-sm" style={{ color:'#8E8EAD' }}>{fmt(r.BASIC_SALARY)}</td>
                    <td className="text-right font-mono text-sm" style={{ color:'#C4C4DA' }}>{fmt(r.GROSS_SALARY)}</td>
                    <td className="text-right font-mono text-sm" style={{ color:'#E05A5A' }}>{fmt(r.PF_DEDUCTION)}</td>
                    <td className="text-right font-mono text-sm" style={{ color:'#E05A5A' }}>{fmt(r.TAX_DEDUCTION)}</td>
                    <td className="text-right font-mono font-bold text-sm" style={{ color:'#3DBF82' }}>{fmt(r.NET_SALARY)}</td>
                    <td className="text-center font-mono text-xs" style={{ color:'#5C5C85' }}>
                      {r.DAYS_WORKED}/{r.DAYS_IN_MONTH}
                    </td>
                    <td className="pr-6">
                      <span className={`badge badge-${(r.STATUS||'').toLowerCase()}`}>{r.STATUS}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProcessModal open={modal} onClose={() => setModal(false)} onDone={fetchPayroll} />
    </div>
  );
}
