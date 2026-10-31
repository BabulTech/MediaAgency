'use client';
import { ChangeEvent, useState } from 'react';
import { Card, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { exportCsv, exportXlsx, Rec, readRows } from '@/lib/sheet';

const TEMPLATES = {
  customers: ['name', 'legalName', 'type', 'ntn', 'strn', 'phone', 'email', 'address', 'city', 'province', 'industry', 'creditLimit', 'paymentTerms'],
  organizations: ['code', 'name'],
  outlets: ['code', 'name', 'categoryCode', 'organizationCode', 'language'],
};
type Entity = keyof typeof TEMPLATES;
type Result = { valid: number; errors: { row: number; message: string }[]; imported: number };

export default function ImportPage() {
  const { t } = useI18n();
  const [entity, setEntity] = useState<Entity>('customers');
  const [rows, setRows] = useState<Rec[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState('');

  const send = (dryRun: boolean) => api<Result>(`/import/${entity}`, { method: 'POST', body: JSON.stringify({ rows, dryRun }) });

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMessage(''); setResult(null);
    try {
      const parsed = await readRows(file);
      setRows(parsed);
      setResult(await api<Result>(`/import/${entity}`, { method: 'POST', body: JSON.stringify({ rows: parsed, dryRun: true }) }));
    } catch { setRows([]); setMessage(t('importFailed')); }
  }

  async function confirm() {
    setMessage('');
    try {
      const r = await send(false);
      setResult(null); setRows([]);
      setMessage(`${t('importDone')}: ${r.imported}`);
    } catch { setMessage(t('importFailed')); }
  }

  const headers = TEMPLATES[entity];
  return (
    <div className="stack">
      <h1>{t('importData')}</h1>
      <Card title={t('importStep1')}>
        <Select label={t('kind')} value={entity} onChange={(v) => { setEntity(v); setRows([]); setResult(null); }} options={(Object.keys(TEMPLATES) as Entity[]).map((k) => ({ value: k, label: t(k === 'customers' ? 'customers' : k === 'outlets' ? 'outlets' : 'organization') }))} />
        <div className="exportbar mt">
          <button type="button" className="btn" onClick={() => exportXlsx(`${entity}-template`, headers, headers, [])}>{t('template')} Excel</button>
          <button type="button" className="btn" onClick={() => exportCsv(`${entity}-template`, headers, headers, [])}>{t('template')} CSV</button>
        </div>
      </Card>
      <Card title={t('importStep2')}>
        <input className="input" type="file" accept=".xlsx,.csv" aria-label={t('importStep2')} onChange={pick} />
        {message && <p className="muted">{message}</p>}
        {result && (
          <div className="mt">
            <p>{t('validRows')}: <b>{result.valid}</b> / {rows.length}</p>
            {result.errors.slice(0, 50).map((e) => <p className="error" key={e.row}>{t('row')} {e.row}: <span dir="ltr">{e.message}</span></p>)}
            <button type="button" className="btn primary" disabled={result.errors.length > 0 || !rows.length} onClick={confirm}>{t('importConfirm')}</button>
          </div>
        )}
      </Card>
    </div>
  );
}
