'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Printer } from 'lucide-react';
import { Card, Field, NumberField, Result, Row, Select, Status, useLoad } from '@/components/ui';
import { api, Customer, Me } from '@/lib/api';
import { DictKey } from '@/lib/dict';
import { History } from '@/components/History';
import { useI18n } from '@/lib/i18n';

type Placement = { id: string; formatCode: string; date: string; net: string; status: string; sentOn: string | null; sentVia: string | null; sentNote: string | null; request: { ad?: { heading?: string } } };
type Detail = {
  order: { number: string; status: string; total: string; notes: string | null };
  customer: Customer;
  placements: { placement: Placement; outletName: string }[];
};
type Money = {
  invoices: { invoice: { id: string; number: string; total: string; dueDate: string }; balance: string }[];
  payments: { id: string; number: string; date: string; method: string | null; reference: string | null; amount: string; invoiceId: string }[];
  invoicedPlacements: string[];
};
const today = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10); // Pakistan Standard Time
const CHANNELS = ['in_person', 'email', 'whatsapp', 'courier'] as const;
const METHODS = ['cash', 'bank_transfer', 'cheque', 'online'] as const;
const EMPTY: Money = { invoices: [], payments: [], invoicedPlacements: [] };

function SentForm({ id, onDone }: { id: string; onDone: () => void }) {
  const { t } = useI18n();
  const [sentOn, setSentOn] = useState(today());
  const [sentVia, setSentVia] = useState<(typeof CHANNELS)[number]>('in_person');
  const [sentNote, setSentNote] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    await api(`/placements/${id}/sent`, { method: 'POST', body: JSON.stringify({ sentOn, sentVia, sentNote: sentNote || undefined }) });
    onDone();
  }
  return (
    <form className="grid2 mt" onSubmit={save}>
      <Field label={t('sentOn')}><input className="input" type="date" dir="ltr" required value={sentOn} onChange={(e) => setSentOn(e.target.value)} /></Field>
      <Select label={t('sentVia')} value={sentVia} onChange={setSentVia} options={CHANNELS.map((c) => ({ value: c, label: t(c) }))} />
      <div className="span2"><Field label={t('notes')}><input className="input" value={sentNote} onChange={(e) => setSentNote(e.target.value)} /></Field></div>
      <div className="span2"><button className="btn primary">{t('markSentMedia')}</button></div>
    </form>
  );
}

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const { t, pkr } = useI18n();
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState('');
  const [taxPercent, setTax] = useState(0);
  const [dueDate, setDue] = useState(today());
  const [pay, setPay] = useState({ amount: 0, date: today(), method: 'cash' as (typeof METHODS)[number], reference: '' });
  const { data, error } = useLoad<Detail | null>(() => api<Detail>(`/orders/${id}`), null, [version]);
  const { data: me } = useLoad<Me | null>(() => api<Me>('/auth/me'), null);
  const finance = !!me?.permissions.includes('finance.read');
  const { data: money } = useLoad<Money>(() => (finance ? api<Money>(`/finance/orders/${id}`) : Promise.resolve(EMPTY)), EMPTY, [version, finance]);
  if (error) return <p className="error">{t('apiDown')}</p>;
  if (!data) return null;
  const { order, customer, placements } = data;
  const refresh = () => { setSending(''); setVersion((v) => v + 1); };
  const open = money.invoices.find((i) => Number(i.balance) > 0);
  const uninvoiced = placements.filter((p) => !money.invoicedPlacements.includes(p.placement.id));

  async function run(path: string, body: unknown = {}) {
    setMessage('');
    try { await api(path, { method: 'POST', body: JSON.stringify(body) }); refresh(); return true; }
    catch { setMessage(t('saveFailed')); return false; }
  }
  async function pay_(e: FormEvent) {
    e.preventDefault();
    if (!open) return;
    const ok = await run('/finance/payments', {
      customerId: customer.id, amount: pay.amount.toFixed(2), date: pay.date, method: pay.method, reference: pay.reference || undefined,
      idempotencyKey: crypto.randomUUID(), allocations: [{ invoiceId: open.invoice.id, amount: pay.amount.toFixed(2) }],
    });
    if (ok) setPay({ ...pay, amount: 0, reference: '' });
  }

  return (
    <div className="stack">
      <h1>{order.number}</h1>
      <Status value={order.status === 'confirmed' ? 'active' : order.status} />
      {message && <p className="error">{message}</p>}
      <Card title={t('customer')}>
        <Row label={t('name')} value={customer.name} />
        {customer.phone && <Row label={t('phone')} value={customer.phone} />}
        {order.notes && <p className="muted">{order.notes}</p>}
      </Card>
      <Card title={t('orderStatus')}>
        <div className="quick">
          {order.status !== 'cancelled' && order.status !== 'confirmed' && <button type="button" className="btn" onClick={() => run(`/orders/${id}/status`, { status: 'confirmed' })}>{t('markActive')}</button>}
          {(order.status === 'confirmed' || order.status === 'inactive') && <button type="button" className="btn primary" onClick={() => run(`/orders/${id}/status`, { status: 'completed' })}>{t('markComplete')}</button>}
          {order.status === 'confirmed' && <button type="button" className="btn" onClick={() => run(`/orders/${id}/status`, { status: 'inactive' })}>{t('markInactive')}</button>}
          {(order.status === 'confirmed' || order.status === 'inactive') && <button type="button" className="btn" onClick={() => run(`/orders/${id}/cancel`)}>{t('cancelOrder')}</button>}
        </div>
      </Card>
      <Card title={t('adsAndDelivery')}>
        {placements.map(({ placement: p, outletName }) => (
          <div key={p.id}>
            <div className="row">
              <span><Link href={`/placements/${p.id}`}><b>{outletName}</b></Link><br /><small className="muted">{t(p.formatCode as DictKey) ?? p.formatCode} · {p.date}{p.request?.ad?.heading ? ` · ${p.request.ad.heading}` : ''}</small><br />
                <small className="muted">{p.sentOn ? `${t('sentOn')} ${p.sentOn} · ${t(p.sentVia as DictKey) ?? p.sentVia}${p.sentNote ? ` · ${p.sentNote}` : ''}` : t('notSentYet')}</small></span>
              <span className="row-end"><b>{pkr(p.net)}</b><button type="button" className="btn" onClick={() => setSending(sending === p.id ? '' : p.id)}>{t('markSentMedia')}</button></span>
            </div>
            {sending === p.id && <SentForm id={p.id} onDone={refresh} />}
          </div>
        ))}
        <Result label={t('orderTotal')} value={pkr(order.total)} />
      </Card>
      {finance && (
        <Card title={t('invoiceAndPayments')}>
          {money.invoices.map(({ invoice: i, balance }) => (
            <div className="row" key={i.id}>
              <span><b>{i.number}</b><br /><small className="muted">{pkr(i.total)} · {t('balanceDue')} {pkr(balance)}</small></span>
              <a className="btn" href={`/print/invoice/${i.id}`} target="_blank"><Printer size={16} /> {t('printPdf')}</a>
            </div>
          ))}
          {money.payments.map((p) => <Row key={p.id} label={`${p.date} · ${t(p.method as DictKey) ?? p.method}${p.reference ? ` · ${p.reference}` : ''}`} value={pkr(p.amount)} />)}
          {uninvoiced.length > 0 && (order.status === 'confirmed' || order.status === 'completed') && (
            <div className="grid2 mt">
              <NumberField label={t('taxPercent')} value={taxPercent} onChange={setTax} />
              <Field label={t('dueDate')}><input className="input" type="date" dir="ltr" value={dueDate} onChange={(e) => setDue(e.target.value)} /></Field>
              <div className="span2"><button type="button" className="btn primary" onClick={() => run(`/finance/orders/${id}/invoice`, { invoiceDate: today(), dueDate, taxPercent: taxPercent || 0 })}>{t('generateInvoice')}</button></div>
            </div>
          )}
          {open && (
            <form className="grid2 mt" onSubmit={pay_}>
              <NumberField label={t('amount')} value={pay.amount} onChange={(amount) => setPay({ ...pay, amount })} />
              <Field label={t('paymentDate')}><input className="input" type="date" dir="ltr" required value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></Field>
              <Select label={t('paymentType')} value={pay.method} onChange={(method) => setPay({ ...pay, method })} options={METHODS.map((m) => ({ value: m, label: t(m) }))} />
              <Field label={t('reference')}><input className="input" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
              <div className="span2"><button className="btn primary" disabled={!(pay.amount > 0)}>{t('recordPayment')}</button></div>
            </form>
          )}
        </Card>
      )}
      <History entity="order" id={id} version={version} />
    </div>
  );
}
