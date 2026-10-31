'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Card, Field, Select, useLoad } from '@/components/ui';
import { api, Customer } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const TYPES = ['corporate', 'individual', 'government', 'public_sector', 'ngo', 'agency', 'other'] as const;

export default function CustomersPage() {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState({ name: '', type: 'corporate', phone: '', email: '', city: '', ntn: '', creditLimit: '' });
  const [message, setMessage] = useState('');
  const { data, error } = useLoad(() => api<Customer[]>(`/customers?q=${encodeURIComponent(q)}`), [], [q, version]);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      await api('/customers', { method: 'POST', body: JSON.stringify(form) });
      setForm({ ...form, name: '', phone: '', email: '', city: '', ntn: '', creditLimit: '' });
      setVersion((v) => v + 1);
    } catch { setMessage(t('saveFailed')); }
  }

  return (
    <div className="stack">
      <h1>{t('customers')}</h1>
      {error && <p className="error">{t('apiDown')}</p>}
      <Card>
        <input className="input" type="search" aria-label={t('search')} placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        {data.length === 0 && <p className="muted">{t('noRecords')}</p>}
        {data.map((c) => (
          <Link className="row" key={c.id} href={`/customers/${c.id}`}>
            <span><b>{c.name}</b><br /><small className="muted">{c.number} · {t(c.type as 'corporate')}{c.city ? ` · ${c.city}` : ''}</small></span>
            <small className="muted">{t(c.status === 'active' ? 'active' : 'inactive')}</small>
          </Link>
        ))}
      </Card>
      <Card title={t('addCustomer')}>
        <form className="grid2" onSubmit={submit}>
          <Field label={t('name')}><input className="input" required value={form.name} onChange={set('name')} /></Field>
          <Select label={t('kind')} value={form.type} onChange={(type) => setForm({ ...form, type })} options={TYPES.map((v) => ({ value: v, label: t(v) }))} />
          <Field label={t('phone')}><input className="input" type="tel" dir="ltr" value={form.phone} onChange={set('phone')} /></Field>
          <Field label={t('email')}><input className="input" type="email" dir="ltr" value={form.email} onChange={set('email')} /></Field>
          <Field label={t('city')}><input className="input" value={form.city} onChange={set('city')} /></Field>
          <Field label="NTN"><input className="input" dir="ltr" value={form.ntn} onChange={set('ntn')} /></Field>
          <Field label={t('creditLimit')}><input className="input" dir="ltr" inputMode="decimal" value={form.creditLimit} onChange={set('creditLimit')} /></Field>
          <div className="span2"><button className="btn primary">{t('save')}</button>{message && <p className="error">{message}</p>}</div>
        </form>
      </Card>
    </div>
  );
}
