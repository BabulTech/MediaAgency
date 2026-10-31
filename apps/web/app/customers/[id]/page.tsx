'use client';
import { FormEvent, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, Field, Row, useLoad } from '@/components/ui';
import { api, Campaign, Contact, Customer } from '@/lib/api';
import { History } from '@/components/History';
import { useI18n } from '@/lib/i18n';

type Detail = { customer: Customer; contacts: Contact[]; campaigns: Campaign[] };

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { t, pkr } = useI18n();
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState('');
  const [edit, setEdit] = useState<Partial<Customer> | null>(null);
  const [contact, setContact] = useState({ name: '', phone: '', email: '' });
  const [campaign, setCampaign] = useState({ name: '', startDate: '', endDate: '', budget: '' });
  const { data, error } = useLoad<Detail | null>(() => api<Detail>(`/customers/${id}`), null, [version]);

  const save = async (path: string, body: unknown, reset: () => void) => {
    setMessage('');
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) });
      reset(); setVersion((v) => v + 1);
    } catch { setMessage(t('saveFailed')); }
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage('');
    try {
      await api(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(edit) });
      setEdit(null); setVersion((v) => v + 1);
    } catch { setMessage(t('saveFailed')); }
  };

  if (error) return <p className="error">{t('apiDown')}</p>;
  if (!data) return null;
  const { customer: c, contacts, campaigns } = data;

  return (
    <div className="stack">
      <h1>{c.name}</h1>
      <p className="muted">{c.number} · {t(c.type as 'corporate')}</p>
      {message && <p className="error">{message}</p>}
      <Card>
        {c.phone && <Row label={t('phone')} value={c.phone} />}
        {c.email && <Row label={t('email')} value={c.email} />}
        {c.city && <Row label={t('city')} value={c.city} />}
        {c.ntn && <Row label="NTN" value={c.ntn} />}
        {c.creditLimit && <Row label={t('creditLimit')} value={pkr(c.creditLimit)} />}
        {!edit && <button type="button" className="btn" onClick={() => { const { name, type, phone, email, city, ntn, creditLimit, status } = c; setEdit({ name, type, phone, email, city, ntn, creditLimit, status }); }}>{t('edit')}</button>}
        {edit && (
          <form className="grid2 mt" onSubmit={saveEdit}>
            <Field label={t('name')}><input className="input" required value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label={t('phone')}><input className="input" type="tel" dir="ltr" value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label={t('email')}><input className="input" type="email" dir="ltr" value={edit.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label={t('city')}><input className="input" value={edit.city ?? ''} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field>
            <div className="span2"><button className="btn primary">{t('save')}</button></div>
          </form>
        )}
      </Card>
      <Card title={t('contacts')}>
        {contacts.map((x) => <Row key={x.id} label={x.name} value={[x.phone, x.email].filter(Boolean).join(' · ')} />)}
        <form className="grid2 mt" onSubmit={(e: FormEvent) => { e.preventDefault(); save(`/customers/${id}/contacts`, contact, () => setContact({ name: '', phone: '', email: '' })); }}>
          <Field label={t('name')}><input className="input" required value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></Field>
          <Field label={t('phone')}><input className="input" type="tel" dir="ltr" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
          <Field label={t('email')}><input className="input" type="email" dir="ltr" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
          <div className="span2"><button className="btn primary">{t('save')}</button></div>
        </form>
      </Card>
      <History entity="customer" id={id} version={version} />
      <Card title={t('campaigns')}>
        {campaigns.map((x) => <Row key={x.id} label={x.name} value={`${x.startDate} – ${x.endDate}${x.budget ? ` · ${pkr(x.budget)}` : ''}`} />)}
        <form className="grid2 mt" onSubmit={(e: FormEvent) => { e.preventDefault(); save('/campaigns', { ...campaign, customerId: id }, () => setCampaign({ name: '', startDate: '', endDate: '', budget: '' })); }}>
          <Field label={t('name')}><input className="input" required value={campaign.name} onChange={(e) => setCampaign({ ...campaign, name: e.target.value })} /></Field>
          <Field label={t('budget')}><input className="input" dir="ltr" inputMode="decimal" value={campaign.budget} onChange={(e) => setCampaign({ ...campaign, budget: e.target.value })} /></Field>
          <Field label={t('startDate')}><input className="input" type="date" dir="ltr" required value={campaign.startDate} onChange={(e) => setCampaign({ ...campaign, startDate: e.target.value })} /></Field>
          <Field label={t('endDate')}><input className="input" type="date" dir="ltr" required value={campaign.endDate} onChange={(e) => setCampaign({ ...campaign, endDate: e.target.value })} /></Field>
          <div className="span2"><button className="btn primary">{t('save')}</button></div>
        </form>
      </Card>
    </div>
  );
}
