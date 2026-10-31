'use client';
import { useState } from 'react';
import { Card, Field, Select, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { DictKey } from '@/lib/dict';
import { useI18n } from '@/lib/i18n';

const REPORTS = ['sales-by-customer', 'sales-by-outlet', 'quotation-conversion', 'pending-bookings', 'proof-pending'] as const;
type Rec = Record<string, unknown>;

const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function ReportsPage() {
  const { t } = useI18n();
  const [name, setName] = useState<(typeof REPORTS)[number]>('sales-by-customer');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, error } = useLoad(() => api<Rec[]>(`/reports/${name}?from=${from}&to=${to}`), [] as Rec[], [name, from, to]);
  const columns = Object.keys(data[0] ?? {});

  function exportCsv() {
    const csv = [columns.join(','), ...data.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${name}.csv`;
    a.click();
  }

  return (
    <div className="stack">
      <h1>{t('reports')}</h1>
      {error && <p className="error">{t('accessDenied')}</p>}
      <div className="grid2">
        <div className="span2"><Select label={t('reports')} value={name} onChange={setName} options={REPORTS.map((r) => ({ value: r, label: t(r as DictKey) }))} /></div>
        <Field label={t('startDate')}><input className="input" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t('endDate')}><input className="input" type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <Card>
        {data.length === 0 && <p className="muted">{t('noRecords')}</p>}
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{data.map((r, i) => <tr key={i}>{columns.map((c) => <td key={c}>{String(r[c] ?? '—')}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <button type="button" className="btn mt" disabled={!data.length} onClick={exportCsv}>{t('exportCsv')}</button>
      </Card>
    </div>
  );
}
