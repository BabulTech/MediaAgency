'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { NewspaperCalculator } from '@/components/NewspaperCalculator';
import { OtherMediaCalculator } from '@/components/OtherMediaCalculator';
import { TvCalculator } from '@/components/TvCalculator';
import { Card, Field, Result, Segmented, useLoad } from '@/components/ui';
import { api, Customer } from '@/lib/api';
import { DictKey } from '@/lib/dict';
import { useI18n } from '@/lib/i18n';
import { AdDraft } from '@/lib/media';

type Media = 'newspaper' | 'tv' | 'other';
const today = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10); // Pakistan Standard Time

export default function NewOrderPage() {
  const { t, pkr } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<Customer | null>(null);
  const [typed, setTyped] = useState({ name: '', phone: '', email: '', city: '' });
  const [media, setMedia] = useState<Media>('newspaper');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState<AdDraft | null>(null);
  const [cart, setCart] = useState<(AdDraft & { date: string })[]>([]);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const { data: customers } = useLoad(() => api<Customer[]>('/customers'), [] as Customer[]);

  const matches = customers.filter((c) => `${c.name} ${c.phone ?? ''} ${c.number}`.toLowerCase().includes(search.toLowerCase())).slice(0, 6);
  const current = draft?.total ? { ...draft, date } : null;
  const needsOutlet = !!current && !current.outletId;
  const total = [...cart, ...(current ? [current] : [])].reduce((sum, l) => sum + Number(l.total), 0);

  function addAnother() {
    if (!current || needsOutlet) { setMessage(t('pickOutlet')); return; }
    setMessage('');
    setCart([...cart, current]);
    setDraft(null);
    setRound(round + 1);
  }

  async function generate() {
    const lines = [...cart, ...(current ? [current] : [])];
    if (!lines.length || needsOutlet) { setMessage(t('pickOutlet')); return; }
    setBusy(true); setMessage('');
    try {
      const body = {
        ...(chosen ? { customerId: chosen.id } : { customer: typed }), notes: notes || undefined,
        lines: lines.map(({ total: _total, outletName: _name, ...l }) => l),
      };
      const order = await api<{ id: string }>('/orders/quick', { method: 'POST', body: JSON.stringify(body) });
      router.push(`/orders/${order.id}`);
    } catch { setMessage(t('saveFailed')); setBusy(false); }
  }

  if (step === 1) return (
    <div className="stack">
      <h1>{t('newOrder')}</h1>
      <p className="muted">{t('step1')}</p>
      <Card title={t('existingCustomer')}>
        <Field label={t('search')}><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
        {matches.map((c) => (
          <button type="button" className="row pick" key={c.id} onClick={() => { setChosen(c); setStep(2); }}>
            <span><b>{c.name}</b><br /><small className="muted">{c.phone ?? c.number}</small></span>
          </button>
        ))}
      </Card>
      <Card title={t('newCustomerQuick')}>
        <form className="grid2" onSubmit={(e) => { e.preventDefault(); setChosen(null); setStep(2); }}>
          <Field label={t('name')}><input className="input" required value={typed.name} onChange={(e) => setTyped({ ...typed, name: e.target.value })} /></Field>
          <Field label={t('phone')}><input className="input" dir="ltr" value={typed.phone} onChange={(e) => setTyped({ ...typed, phone: e.target.value })} /></Field>
          <Field label={t('email')}><input className="input" type="email" dir="ltr" value={typed.email} onChange={(e) => setTyped({ ...typed, email: e.target.value })} /></Field>
          <Field label={t('city')}><input className="input" value={typed.city} onChange={(e) => setTyped({ ...typed, city: e.target.value })} /></Field>
          <div className="span2"><button className="btn primary">{t('next')}</button></div>
        </form>
      </Card>
    </div>
  );

  return (
    <div className="stack">
      <h1>{t('newOrder')}</h1>
      <div className="row"><span><small className="muted">{t('step2')}</small><br /><b>{chosen?.name ?? typed.name}</b></span><button type="button" className="btn" onClick={() => setStep(1)}>{t('change')}</button></div>
      <div className="order-layout">
      <div className="stack">
      <Segmented value={media} onChange={(m) => { setMedia(m); setDraft(null); }} options={[{ value: 'newspaper', label: t('newspaper') }, { value: 'tv', label: t('tv') }, { value: 'other', label: t('otherMedia') }]} />
      <Field label={t('publishDate')}><input className="input" type="date" dir="ltr" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <div key={`${media}-${round}`}>
        {media === 'newspaper' && <NewspaperCalculator onDraft={setDraft} />}
        {media === 'tv' && <TvCalculator onDraft={setDraft} />}
        {media === 'other' && <OtherMediaCalculator onDraft={setDraft} />}
      </div>
      <Card title={t('orderSummary')}>
        {cart.map((l, i) => (
          <div className="row" key={i}>
            <span><b>{l.outletName}</b><br /><small className="muted">{t(l.formatCode as DictKey) ?? l.formatCode} · {l.date}</small></span>
            <span className="row-end"><b>{pkr(l.total!)}</b><button type="button" className="btn icon" aria-label={t('remove')} onClick={() => setCart(cart.filter((_, x) => x !== i))}><X size={16} /></button></span>
          </div>
        ))}
        {current && <div className="row"><span><b>{current.outletName || t('outlet')}</b><br /><small className="muted">{t(current.formatCode as DictKey) ?? current.formatCode} · {current.date}</small></span><b>{pkr(current.total!)}</b></div>}
        {!current && <p className="muted">{t('pickOutlet')}</p>}
        <Field label={t('notes')}><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="quick">
          <button type="button" className="btn" onClick={addAnother}>{t('addAnotherAd')}</button>
        </div>
      </Card>
      </div>
      <div className="stack order-side">
      <Card>
        <Result label={t('orderTotal')} value={pkr(String(total))} />
        {(message || needsOutlet || !current) && <p className="error">{message || t('pickOutlet')}</p>}
        <button type="button" className="btn primary order-go" disabled={busy} onClick={generate}>{t('generateOrder')}</button>
      </Card>
      <div id="order-preview" />
      </div>
      </div>
    </div>
  );
}
