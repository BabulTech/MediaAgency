'use client';
import { useState } from 'react';
import { Card, Field, Select, Status, useLoad } from '@/components/ui';
import { ExportBar, useColumnLabel } from '@/components/ExportBar';
import { api } from '@/lib/api';
import { DictKey } from '@/lib/dict';
import { useI18n } from '@/lib/i18n';
import { columnsOf, Rec } from '@/lib/sheet';

type Entry = { name: string; group: string };
const STATUS_KEYS = new Set(['status']);

function BarChart({ rows }: { rows: { name: string; total: string }[] }) {
  const { pkr } = useI18n();
  const top = rows.slice(0, 12);
  const max = Math.max(...top.map((r) => Number(r.total)), 1);
  return (
    <div className="bars">
      {top.map((r) => (
        <div className="bar" key={r.name} title={`${r.name}: ${pkr(r.total)}`}>
          <span>{r.name}</span>
          <i><b style={{ width: `${Math.max((Number(r.total) / max) * 100, 0.5)}%` }} /></i>
          <em>{pkr(r.total)}</em>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const { t, pkr } = useI18n();
  const label = useColumnLabel();
  const [name, setName] = useState('sales-by-customer');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data: catalog } = useLoad(() => api<Entry[]>('/reports'), [] as Entry[]);
  const { data, error } = useLoad(() => api<Rec[]>(`/reports/${name}?from=${from}&to=${to}`), [] as Rec[], [name, from, to]);
  const columns = columnsOf(data);
  const money = (k: string) => ['total', 'budget', 'committed', 'supplierCost', 'grossMargin', 'rate'].includes(k);
  const chartable = data.length > 1 && 'name' in (data[0] ?? {}) && 'total' in (data[0] ?? {});
  const grand = 'total' in (data[0] ?? {}) ? data.reduce((a, r) => a + Number(r.total ?? 0), 0) : null;

  return (
    <div className="stack">
      <h1>{t('reports')}</h1>
      {error && <p className="error">{t('loadFailed')}</p>}
      <div className="grid2 no-print">
        <div className="span2">
          <Field label={t('reports')}>
            <select className="input" value={name} onChange={(e) => setName(e.target.value)}>
              {['sales', 'operations', 'finance', 'admin'].map((g) => (
                <optgroup key={g} label={t(`group_${g}` as DictKey)}>
                  {catalog.filter((c) => c.group === g).map((c) => <option key={c.name} value={c.name}>{t(c.name as DictKey) ?? c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t('startDate')}><input className="input" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t('endDate')}><input className="input" type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <h2 className="print-only">{t(name as DictKey) ?? name} {from} {to}</h2>
      <ExportBar name={name} rows={data} />
      {grand !== null && data.length > 0 && <div className="stats"><div className="stat lead"><span>{t('total')}</span><strong>{pkr(grand.toFixed(2))}</strong></div><div className="stat"><span>{t('records')}</span><strong>{data.length}</strong></div></div>}
      {chartable && <Card title={t(name as DictKey) ?? name}><BarChart rows={data as { name: string; total: string }[]} /></Card>}
      <Card>
        {data.length === 0 && !error && <p className="muted">{t('noRecords')}</p>}
        {data.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>{columns.map((c) => <th key={c}>{label(c)}</th>)}</tr></thead>
              <tbody>{data.map((r, i) => (
                <tr key={i}>{columns.map((c) => <td key={c}>{STATUS_KEYS.has(c) ? <Status value={String(r[c])} /> : money(c) && r[c] != null ? pkr(String(r[c])) : String(r[c] ?? '—')}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
