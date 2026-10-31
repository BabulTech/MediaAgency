'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Card, Field, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type Company = { name: string; address: string | null; phone: string | null; email: string | null; ntn: string | null; bankDetails: string | null };

export default function SettingsPage() {
  const { t } = useI18n();
  const { data, error } = useLoad<Company | null>(() => api<Company>('/settings'), null);
  const [form, setForm] = useState<Company | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { if (data) setForm(data); }, [data]);
  if (error) return <p className="error">{t('loadFailed')}</p>;
  if (!form) return null;
  const text = (k: keyof Company, label: string, ltr = false) => (
    <Field label={label}><input className="input" dir={ltr ? 'ltr' : undefined} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const { name, address, phone, email, ntn, bankDetails } = form!;
      await api('/settings', { method: 'POST', body: JSON.stringify({ name, address, phone, email, ntn, bankDetails }) });
      setMessage(t('saved'));
    } catch { setMessage(t('saveFailed')); }
  }
  return (
    <div className="stack">
      <h1>{t('settings')}</h1>
      <Card title={t('companyDetails')}>
        <form className="grid2" onSubmit={submit}>
          {text('name', t('name'))}{text('phone', t('phone'), true)}{text('email', t('email'), true)}{text('ntn', 'NTN', true)}
          <div className="span2">{text('address', t('address'))}</div>
          <div className="span2"><Field label={t('bankDetails')}><textarea className="input" rows={3} value={form.bankDetails ?? ''} onChange={(e) => setForm({ ...form, bankDetails: e.target.value })} /></Field></div>
          <div className="span2"><button className="btn primary">{t('save')}</button>{message && <small className="muted">{message}</small>}</div>
        </form>
      </Card>
    </div>
  );
}
