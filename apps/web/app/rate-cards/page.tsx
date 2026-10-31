'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Field, Select, Status, useLoad } from '@/components/ui';
import { api, Outlet, RateCard } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function RateCardsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', outletId: '', kind: 'selling', effectiveFrom: '' });
  const [message, setMessage] = useState('');
  const { data, error } = useLoad(async () => {
    const [cards, outlets] = await Promise.all([api<RateCard[]>('/rate-cards'), api<Outlet[]>('/outlets')]);
    return { cards, outlets };
  }, { cards: [] as RateCard[], outlets: [] as Outlet[] });
  const outletId = form.outletId || data.outlets[0]?.id || '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      const c = await api<RateCard>('/rate-cards', { method: 'POST', body: JSON.stringify({ ...form, outletId }) });
      router.push(`/rate-cards/${c.id}`);
    } catch { setMessage(t('saveFailed')); }
  }

  return (
    <div className="stack">
      <h1>{t('rateCards')}</h1>
      {error && <p className="error">{t('apiDown')}</p>}
      <Card>
        {data.cards.length === 0 && <p className="muted">{t('noRecords')}</p>}
        {data.cards.map((c) => (
          <Link className="row" key={c.id} href={`/rate-cards/${c.id}`}>
            <span><b>{c.name}</b><br /><small className="muted">{t(c.kind === 'selling' ? 'selling' : 'supplier')} · {t('effectiveFrom')} {c.effectiveFrom}</small></span>
            <span className="row-end">{c.isSample && <small className="tag">{t('sample')}</small>}<Status value={c.status} /></span>
          </Link>
        ))}
      </Card>
      <Card title={t('newRateCard')}>
        <form className="grid2" onSubmit={submit}>
          <Field label={t('name')}><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Select label={t('outlets')} value={outletId} onChange={(v) => setForm({ ...form, outletId: v })} options={data.outlets.map((o) => ({ value: o.id, label: o.name }))} />
          <Select label={t('kind')} value={form.kind} onChange={(kind) => setForm({ ...form, kind })} options={[{ value: 'selling', label: t('selling') }, { value: 'supplier', label: t('supplier') }]} />
          <Field label={t('effectiveFrom')}><input className="input" type="date" dir="ltr" required value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></Field>
          <div className="span2"><button className="btn primary">{t('save')}</button>{message && <p className="error">{message}</p>}</div>
        </form>
      </Card>
    </div>
  );
}
