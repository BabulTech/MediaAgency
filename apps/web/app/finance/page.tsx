'use client';
import { FormEvent, useState } from 'react';
import { Card, Field, NumberField, Row, Select, useLoad } from '@/components/ui';
import { api, Customer } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type Inv = { invoice: { id: string; number: string; customerId: string; dueDate: string; total: string }; customerName: string; balance: string };
type Bill = { bill: { id: string; supplierReference: string; dueDate: string; total: string }; balance: string };
type Summary = { receivables: string; payables: string; advances: string; aging: Record<string, string> };
type Profit = { id: string; orderNumber: string; outletName: string; selling: string; quotedMargin: string | null; committedMargin: string | null; actualMargin: string | null };
type Eligible = { placement: { id: string; formatCode: string; date: string; net: string }; orderNumber: string };
type Billable = { booking: { id: string; number: string; purchasePrice: string | null } };

const key = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10);

export default function FinancePage() {
  const { t, pkr } = useI18n();
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [taxPercent, setTaxPercent] = useState(0);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [bill, setBill] = useState({ bookingId: '', supplierReference: '', amount: '', dueDate: '' });

  const { data, error } = useLoad(async () => {
    const [summary, invoices, bills, profit, customers, billable] = await Promise.all([
      api<Summary>('/finance/summary'), api<Inv[]>('/finance/invoices'), api<Bill[]>('/finance/bills'), api<Profit[]>('/finance/profitability'), api<Customer[]>('/customers'), api<Billable[]>('/finance/billable-bookings'),
    ]);
    return { summary, invoices, bills, profit, customers, billable };
  }, null, [version]);
  const chosen = customerId || data?.customers[0]?.id || '';
  const { data: eligible } = useLoad(() => (chosen ? api<Eligible[]>(`/finance/eligible-placements?customerId=${chosen}`) : Promise.resolve([])), [] as Eligible[], [chosen, version]);

  const post = async (path: string, body: unknown) => {
    setMessage('');
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) });
      setAmounts({}); setPicked([]); setVersion((v) => v + 1);
    } catch { setMessage(t('saveFailed')); }
  };

  if (error) return <p className="error">{t('loadFailed')}</p>;
  if (!data) return null;
  const { summary, invoices, bills, profit, billable } = data;
  const bookingId = bill.bookingId || billable[0]?.booking.id || '';
  const money = (v: string | null) => (v === null ? '—' : pkr(v));

  return (
    <div className="stack">
      <h1>{t('finance')}</h1>
      {message && <p className="error">{message}</p>}
      <Card>
        <Row label={t('receivables')} value={pkr(summary.receivables)} />
        <Row label={t('payables')} value={pkr(summary.payables)} />
        <Row label={t('advances')} value={pkr(summary.advances)} />
        {Object.entries(summary.aging).map(([k, v]) => <Row key={k} label={k === 'current' ? t('notDue') : k.replace('d90_plus', '90+').replace('d', '').replace('_', '–')} value={pkr(v)} />)}
      </Card>

      <Card title={t('invoices')}>
        {invoices.length === 0 && <p className="muted">{t('noRecords')}</p>}
        {invoices.map(({ invoice: i, customerName, balance }) => (
          <div key={i.id}>
            <Row label={`${i.number} · ${customerName} · ${i.dueDate}`} value={`${pkr(balance)} / ${pkr(i.total)}`} />
            <a className="btn" target="_blank" href={`/print/invoice/${i.id}`}>{t('printPdf')}</a>
            {Number(balance) > 0 && (
              <form className="artwork" onSubmit={(e: FormEvent) => {
                e.preventDefault();
                const amount = amounts[i.id] ?? balance;
                post('/finance/payments', { customerId: i.customerId, amount, date: today(), idempotencyKey: key(), allocations: [{ invoiceId: i.id, amount }] });
              }}>
                <input className="input" dir="ltr" inputMode="decimal" aria-label={t('amount')} value={amounts[i.id] ?? Number(balance).toFixed(2)} onChange={(e) => setAmounts({ ...amounts, [i.id]: e.target.value })} />
                <button className="btn">{t('recordPayment')}</button>
              </form>
            )}
          </div>
        ))}
      </Card>

      <Card title={t('newInvoice')}>
        <div className="grid2">
          <Select label={t('customers')} value={chosen} onChange={(v) => { setCustomerId(v); setPicked([]); }} options={data.customers.map((c) => ({ value: c.id, label: c.name }))} />
          <Field label={t('dueDate')}><input className="input" type="date" dir="ltr" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <NumberField label={t('taxPercent')} value={taxPercent} onChange={setTaxPercent} />
          <div className="span2">
            {eligible.length === 0 && <p className="muted">{t('nothingToInvoice')}</p>}
            {eligible.map(({ placement: p, orderNumber }) => (
              <label className="row" key={p.id}>
                <span><input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} /> {orderNumber} · {p.formatCode} · {p.date}</span><b>{pkr(p.net)}</b>
              </label>
            ))}
            <button type="button" className="btn primary" disabled={!picked.length || !dueDate} onClick={() => post('/finance/invoices', { customerId: chosen, placementIds: picked, invoiceDate: today(), dueDate, taxPercent })}>{t('issueInvoice')}</button>
            <small className="muted">{t('taxNote')}</small>
          </div>
        </div>
      </Card>

      <Card title={t('supplierBills')}>
        {bills.map(({ bill: b, balance }) => (
          <div key={b.id}>
            <Row label={`${b.supplierReference} · ${b.dueDate}`} value={`${pkr(balance)} / ${pkr(b.total)}`} />
            {Number(balance) > 0 && <button type="button" className="btn" onClick={() => post(`/finance/bills/${b.id}/payments`, { amount: balance, date: today(), idempotencyKey: key() })}>{t('recordPayment')}</button>}
          </div>
        ))}
        <form className="grid2 mt" onSubmit={(e: FormEvent) => { e.preventDefault(); post('/finance/bills', { supplierReference: bill.supplierReference, bookingIds: [bookingId], billDate: today(), dueDate: bill.dueDate, amount: bill.amount }); }}>
          <Select label={t('bookings')} value={bookingId} onChange={(v) => setBill({ ...bill, bookingId: v })} options={billable.map((b) => ({ value: b.booking.id, label: b.booking.number }))} />
          <Field label={t('supplierReference')}><input className="input" dir="ltr" required value={bill.supplierReference} onChange={(e) => setBill({ ...bill, supplierReference: e.target.value })} /></Field>
          <Field label={t('amount')}><input className="input" dir="ltr" inputMode="decimal" required value={bill.amount} onChange={(e) => setBill({ ...bill, amount: e.target.value })} /></Field>
          <Field label={t('dueDate')}><input className="input" type="date" dir="ltr" required value={bill.dueDate} onChange={(e) => setBill({ ...bill, dueDate: e.target.value })} /></Field>
          <div className="span2"><button className="btn primary" disabled={!bookingId}>{t('save')}</button></div>
        </form>
      </Card>

      <Card title={t('profitability')}>
        {profit.length === 0 && <p className="muted">{t('noRecords')}</p>}
        {profit.map((p) => (
          <div className="row" key={p.id}>
            <span><b>{p.orderNumber}</b> · {p.outletName}<br /><small className="muted">{t('quoted')} {money(p.quotedMargin)} · {t('committed')} {money(p.committedMargin)} · {t('actual')} {money(p.actualMargin)}</small></span>
            <b>{pkr(p.selling)}</b>
          </div>
        ))}
      </Card>
    </div>
  );
}
