'use client';
import { ChangeEvent, FormEvent, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, Field, NumberField, Row, Select, Status, useLoad } from '@/components/ui';
import { api, RateCard } from '@/lib/api';
import { RuleRow } from '@/lib/csv';
import { readRows } from '@/lib/sheet';
import { ExportBar } from '@/components/ExportBar';
import { useI18n } from '@/lib/i18n';
import { DictKey } from '@/lib/dict';

const UNITS = ['per_sq_cm', 'per_sq_inch', 'per_column_cm', 'per_word', 'per_line', 'fixed', 'per_second', 'per_minute', 'per_spot', 'per_ticker', 'per_ticker_second', 'per_day', 'per_week', 'per_month', 'per_cpm', 'per_cpc', 'per_cpv'] as const;
type Unit = (typeof UNITS)[number];
type Detail = { card: RateCard & { version: number }; rules: (RuleRow & { id: string })[]; history: { id: string; action: string; createdAt: string }[] };

export default function RateCardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, pkr } = useI18n();
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState('');
  const [rule, setRule] = useState({ formatCode: '', timeBandCode: '', unit: 'per_sq_cm' as Unit, rate: 0, multiplier: '', minimumCharge: '' });
  const [nextDate, setNextDate] = useState('');
  const { data, error } = useLoad<Detail | null>(() => api<Detail>(`/rate-cards/${id}`), null, [version]);

  const run = async (path: string, body?: unknown, method = 'POST') => {
    setMessage('');
    try {
      const res = await api<{ id?: string }>(`/rate-cards/${id}${path}`, { method, body: JSON.stringify(body ?? {}) });
      setVersion((v) => v + 1);
      return res;
    } catch { setMessage(t('saveFailed')); return null; }
  };

  async function importCsv(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMessage('');
    const res = await run('/rules/bulk', { rules: await readRows(file) });
    if (!res) setMessage(t('importFailed'));
  }

  if (error) return <p className="error">{t('apiDown')}</p>;
  if (!data) return null;
  const { card, rules, history } = data;
  const draft = card.status === 'draft';

  return (
    <div className="stack">
      <h1>{card.name}</h1>
      <ExportBar name="rate-rules" rows={rules.map(({ formatCode, editionCode, timeBandCode, priority, unit, rate, multiplier, minimumCharge }) => ({ formatCode, editionCode, timeBandCode, priority, unit, rate, multiplier, minimumCharge }))} />
      <Status value={card.status} />
      <p className="muted">v{card.version} · {t(card.kind === 'selling' ? 'selling' : 'supplier')} · {t('effectiveFrom')} {card.effectiveFrom}</p>
      {card.isSample && <small className="tag">{t('sampleRate')}</small>}
      {message && <p className="error">{message}</p>}

      <Card title={t('rules')}>
        {rules.length === 0 && <p className="muted">{t('noRecords')}</p>}
        {rules.map((r) => (
          <div className="row" key={r.id}>
            <span><b>{pkr(r.rate)}</b> · {t(r.unit as DictKey)}<br /><small className="muted">{[r.formatCode, r.timeBandCode, r.multiplier && `×${Number(r.multiplier)}`].filter(Boolean).join(' · ') || t('anyFormat')}</small></span>
            {draft && <button type="button" className="btn" onClick={() => run(`/rules/${r.id}`, undefined, 'DELETE')}>{t('removeArtwork')}</button>}
          </div>
        ))}
        <div className="artwork mt">
                    {draft && <label className="btn">{t('importSheet')}<input type="file" accept=".csv,.xlsx" hidden onChange={importCsv} /></label>}
        </div>
      </Card>

      {draft && (
        <Card title={t('addRule')}>
          <form className="grid2" onSubmit={(e: FormEvent) => { e.preventDefault(); run('/rules', { ...rule, rate: String(rule.rate) }); }}>
            <Field label={t('format')}><input className="input" dir="ltr" placeholder="display, tvc" value={rule.formatCode} onChange={(e) => setRule({ ...rule, formatCode: e.target.value })} /></Field>
            <Field label={t('timeBand')}><input className="input" dir="ltr" placeholder="prime" value={rule.timeBandCode} onChange={(e) => setRule({ ...rule, timeBandCode: e.target.value })} /></Field>
            <Select label={t('pricingMethod')} value={rule.unit} onChange={(unit) => setRule({ ...rule, unit })} options={UNITS.map((u) => ({ value: u, label: t(u) }))} />
            <NumberField label={t('rate')} value={rule.rate} onChange={(v) => setRule({ ...rule, rate: v })} />
            <Field label={t('multiplier')}><input className="input" dir="ltr" inputMode="decimal" value={rule.multiplier} onChange={(e) => setRule({ ...rule, multiplier: e.target.value })} /></Field>
            <Field label={t('minimumCharge')}><input className="input" dir="ltr" inputMode="decimal" value={rule.minimumCharge} onChange={(e) => setRule({ ...rule, minimumCharge: e.target.value })} /></Field>
            <div className="span2"><button className="btn primary">{t('save')}</button></div>
          </form>
        </Card>
      )}

      <Card title={t('actions')}>
        <div className="stack">
          {draft && <button type="button" className="btn primary" disabled={!rules.length} onClick={() => run('/publish')}>{t('publish')}</button>}
          {card.status === 'published' && <button type="button" className="btn" onClick={() => run('/expire')}>{t('expire')}</button>}
          <Field label={t('newVersionFrom')}><input className="input" type="date" dir="ltr" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></Field>
          <button type="button" className="btn" disabled={!nextDate} onClick={async () => {
            const n = await run('/new-version', { effectiveFrom: nextDate });
            if (n?.id) router.push(`/rate-cards/${n.id}`);
          }}>{t('newVersion')}</button>
        </div>
      </Card>

      <Card title={t('history')}>
        {history.map((h) => <Row key={h.id} label={h.action} value={new Date(h.createdAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })} />)}
      </Card>
    </div>
  );
}
