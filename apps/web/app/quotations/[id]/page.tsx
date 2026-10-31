'use client';
import { FormEvent, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, Field, NumberField, Result, Row, Select, SliderField, useLoad } from '@/components/ui';
import { api, Outlet } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type Line = { id: string; formatCode: string; date: string; net: string; supplierCost: string | null; outletId: string };
type Detail = { quotation: { number: string; status: string; total: string }; lines: Line[] };

export default function QuotationPage() {
  const { id } = useParams<{ id: string }>();
  const { t, pkr } = useI18n();
  const router = useRouter();
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState('');
  const [line, setLine] = useState({ outletId: '', formatCode: 'display', date: '', timeBandCode: '', widthCm: 9, heightCm: 15, insertions: 1, durationSeconds: 30, spots: 1, words: 0, lines: 0, discountPercent: 0 });
  const { data, error } = useLoad(async () => {
    const [detail, outlets] = await Promise.all([api<Detail>(`/quotations/${id}`), api<Outlet[]>('/outlets')]);
    return { detail, outlets };
  }, null as { detail: Detail; outlets: Outlet[] } | null, [version]);

  const call = async (path: string, init: RequestInit = { method: 'POST', body: '{}' }) => {
    setMessage('');
    try {
      const res = await api<{ id?: string; number?: string }>(path, init);
      setVersion((v) => v + 1);
      return res;
    } catch (err) {
      setMessage(t((err as { status?: number }).status === 422 ? 'noRule' : 'saveFailed'));
      return null;
    }
  };

  if (error) return <p className="error">{t('apiDown')}</p>;
  if (!data) return null;
  const { quotation: q, lines } = data.detail;
  const outletId = line.outletId || data.outlets[0]?.id || '';
  const outletName = (oid: string) => data.outlets.find((o) => o.id === oid)?.name ?? '';
  const n = (k: keyof typeof line) => line[k] as number;
  const setN = (k: keyof typeof line) => (v: number) => setLine({ ...line, [k]: v });

  async function add(e: FormEvent) {
    e.preventDefault();
    const { widthCm, heightCm, insertions, durationSeconds, spots, words, lines: textLines, discountPercent, formatCode, date, timeBandCode } = line;
    await call(`/quotations/${id}/lines`, { method: 'POST', body: JSON.stringify({
      outletId, formatCode, date, timeBandCode: timeBandCode || undefined, discountPercent,
      quantity: { widthCm, heightCm, insertions, durationSeconds, spots, words, lines: textLines },
    }) });
  }

  return (
    <div className="stack">
      <h1>{q.number}</h1>
      <p className="muted">{q.status}</p>
      <a className="btn" target="_blank" href={`/print/quotation/${id}`}>{t('printPdf')}</a>
      {message && <p className="error">{message}</p>}
      <Card title={t('placements')}>
        {lines.length === 0 && <p className="muted">{t('noRecords')}</p>}
        {lines.map((l) => (
          <div className="row" key={l.id}>
            <span><b>{outletName(l.outletId)}</b><br /><small className="muted">{l.formatCode} · {l.date}{l.supplierCost ? ` · ${t('supplier')} ${pkr(l.supplierCost)}` : ''}</small></span>
            <span><b>{pkr(l.net)}</b>{q.status === 'draft' && <> <button type="button" className="btn" onClick={() => call(`/quotations/${id}/lines/${l.id}`, { method: 'DELETE' })}>{t('removeArtwork')}</button></>}</span>
          </div>
        ))}
        <Result label={t('paperResult')} value={pkr(q.total)} />
      </Card>
      {q.status === 'draft' && (
        <Card title={t('addPlacement')}>
          <form className="grid2" onSubmit={add}>
            <Select label={t('outlets')} value={outletId} onChange={(v) => setLine({ ...line, outletId: v })} options={data.outlets.map((o) => ({ value: o.id, label: o.name }))} />
            <Field label={t('format')}><input className="input" dir="ltr" required value={line.formatCode} onChange={(e) => setLine({ ...line, formatCode: e.target.value })} /></Field>
            <Field label={t('publishDate')}><input className="input" type="date" dir="ltr" required value={line.date} onChange={(e) => setLine({ ...line, date: e.target.value })} /></Field>
            <Field label={t('timeBand')}><input className="input" dir="ltr" value={line.timeBandCode} onChange={(e) => setLine({ ...line, timeBandCode: e.target.value })} /></Field>
            <NumberField label={t('width')} value={n('widthCm')} onChange={setN('widthCm')} />
            <NumberField label={t('height')} value={n('heightCm')} onChange={setN('heightCm')} />
            <NumberField label={t('insertions')} value={n('insertions')} onChange={setN('insertions')} />
            <NumberField label={t('duration')} value={n('durationSeconds')} onChange={setN('durationSeconds')} />
            <NumberField label={t('spots')} value={n('spots')} onChange={setN('spots')} />
            <NumberField label={t('words')} value={n('words')} onChange={setN('words')} />
            <SliderField label={t('discount')} unit="%" value={n('discountPercent')} min={0} max={30} onChange={setN('discountPercent')} />
            <div className="span2"><button className="btn primary">{t('save')}</button></div>
          </form>
        </Card>
      )}
      <Card title={t('actions')}>
        <div className="stack">
          {q.status === 'draft' && <button type="button" className="btn primary" disabled={!lines.length} onClick={() => call(`/quotations/${id}/submit`)}>{t('submit')}</button>}
          {q.status === 'pending_approval' && <button type="button" className="btn primary" onClick={() => call(`/quotations/${id}/approve`)}>{t('approve')}</button>}
          {q.status === 'approved' && <button type="button" className="btn primary" onClick={() => call(`/quotations/${id}/send`)}>{t('markSent')}</button>}
          {q.status === 'sent' && <>
            <button type="button" className="btn primary" onClick={async () => { const o = await call(`/quotations/${id}/accept`); if (o?.id) router.push(`/orders/${o.id}`); }}>{t('accept')}</button>
            <button type="button" className="btn" onClick={() => call(`/quotations/${id}/reject`)}>{t('reject')}</button>
          </>}
        </div>
      </Card>
    </div>
  );
}
