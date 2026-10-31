'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Field, Select, Status, useLoad } from '@/components/ui';
import { api, Customer } from '@/lib/api';
import { ExportBar } from '@/components/ExportBar';
import { useI18n } from '@/lib/i18n';

type Row = { quotation: { id: string; number: string; status: string; total: string }; customerName: string };

export default function QuotationsPage() {
  const { t, pkr } = useI18n();
  const router = useRouter();
  const [customerId, setCustomerId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [message, setMessage] = useState('');
  const { data, error } = useLoad(async () => {
    const [rows, customers] = await Promise.all([api<Row[]>('/quotations'), api<Customer[]>('/customers')]);
    return { rows, customers };
  }, { rows: [] as Row[], customers: [] as Customer[] });
  const chosen = customerId || data.customers[0]?.id || '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      const q = await api<{ id: string }>('/quotations', { method: 'POST', body: JSON.stringify({ customerId: chosen, validUntil }) });
      router.push(`/quotations/${q.id}`);
    } catch { setMessage(t('saveFailed')); }
  }

  return (
    <div className="stack">
      <h1>{t('quotations')}</h1>
      <ExportBar name="quotations" rows={data.rows.map((r) => ({ number: r.quotation.number, customer: r.customerName, status: r.quotation.status, total: r.quotation.total }))} />
      {error && <p className="error">{t('apiDown')}</p>}
      <Card>
        {data.rows.length === 0 && <p className="muted">{t('noRecords')}</p>}
        {data.rows.map(({ quotation: q, customerName }) => (
          <Link className="row" key={q.id} href={`/quotations/${q.id}`}>
            <span><b>{q.number}</b><br /><small className="muted">{customerName}</small></span><span className="row-end"><Status value={q.status} /><b>{pkr(q.total)}</b></span>
          </Link>
        ))}
      </Card>
      <Card title={t('newQuotation')}>
        <form className="grid2" onSubmit={submit}>
          <Select label={t('customers')} value={chosen} onChange={setCustomerId} options={data.customers.map((c) => ({ value: c.id, label: c.name }))} />
          <Field label={t('validUntil')}><input className="input" type="date" dir="ltr" required value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
          <div className="span2"><button className="btn primary" disabled={!chosen}>{t('save')}</button>{message && <p className="error">{message}</p>}</div>
        </form>
      </Card>
    </div>
  );
}
