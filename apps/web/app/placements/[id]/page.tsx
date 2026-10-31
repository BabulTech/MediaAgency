'use client';
import { ChangeEvent, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, Field, Select, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type Booking = { id: string; number: string; status: string; supplierReference: string | null };
type Creative = { id: string; version: number; fileName: string; storagePath: string; status: string };
type Proof = { id: string; kind: string; fileName: string; storagePath: string; status: string; actualDate: string };
type Detail = { placement: { formatCode: string; date: string; status: string }; bookings: Booking[]; creatives: Creative[]; proofs: Proof[] };

const NEXT: Record<string, string[]> = {
  submitted: ['confirmed', 'rejected', 'reschedule_requested', 'cancelled'],
  reschedule_requested: ['confirmed', 'cancelled'],
  confirmed: ['executed', 'cancelled'],
};
const KINDS = ['publication', 'telecast_certificate', 'broadcast_log', 'screenshot', 'video', 'supplier_confirmation', 'other'];

export default function PlacementPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState('');
  const [kind, setKind] = useState('publication');
  const [actualDate, setActualDate] = useState('');
  const { data, error } = useLoad<Detail | null>(() => api<Detail>(`/placements/${id}`), null, [version]);

  const post = async (path: string, body: unknown = {}) => {
    setMessage('');
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) });
      setVersion((v) => v + 1);
    } catch { setMessage(t('saveFailed')); }
  };

  const upload = (register: (path: string, fileName: string) => Promise<void>) => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMessage('');
    try {
      const { path, url } = await api<{ path: string; url: string }>(`/placements/${id}/upload-url`, { method: 'POST', body: JSON.stringify({ fileName: file.name }) });
      const res = await fetch(url, { method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });
      if (!res.ok) throw new Error('upload');
      await register(path, file.name);
    } catch { setMessage(t('saveFailed')); }
  };

  const open = async (path: string) => {
    const { url } = await api<{ url: string }>(`/files/download?path=${encodeURIComponent(path)}`);
    window.open(url, '_blank', 'noopener');
  };

  if (error) return <p className="error">{t('apiDown')}</p>;
  if (!data) return null;
  const { placement: p, bookings, creatives, proofs } = data;
  const live = bookings.find((b) => NEXT[b.status] || b.status === 'executed');

  return (
    <div className="stack">
      <h1>{p.formatCode} · {p.date}</h1>
      <p className="muted">{p.status}</p>
      {message && <p className="error">{message}</p>}

      <Card title={t('bookings')}>
        {bookings.map((b) => (
          <div key={b.id}>
            <a className="btn" target="_blank" href={`/print/booking/${b.id}`}>{t('printPdf')}</a>
            <div className="row"><b>{b.number}</b><small className="muted">{b.status}{b.supplierReference ? ` · ${b.supplierReference}` : ''}</small></div>
            {NEXT[b.status] && (
              <div className="stack">
                <Field label={t('supplierReference')}><input className="input" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
                <div className="artwork" style={{ flexWrap: 'wrap' }}>
                  {NEXT[b.status].map((s) => <button key={s} type="button" className="btn" onClick={() => post(`/bookings/${b.id}/status`, { status: s, supplierReference: reference || undefined })}>{s}</button>)}
                </div>
              </div>
            )}
          </div>
        ))}
        {!live && <button type="button" className="btn primary" onClick={() => post(`/placements/${id}/bookings`)}>{t('createBooking')}</button>}
      </Card>

      <Card title={t('artwork')}>
        {creatives.map((c) => (
          <div className="row" key={c.id}>
            <span><button type="button" className="btn" onClick={() => open(c.storagePath)}>v{c.version} · {c.fileName}</button><br /><small className="muted">{c.status}</small></span>
            {c.status === 'pending' && <span className="artwork">
              <button type="button" className="btn" onClick={() => post(`/creatives/${c.id}/review`, { approved: true })}>{t('approve')}</button>
              <button type="button" className="btn" onClick={() => post(`/creatives/${c.id}/review`, { approved: false })}>{t('rejectItem')}</button>
            </span>}
          </div>
        ))}
        <input className="input mt" type="file" aria-label={t('artwork')} onChange={upload((path, fileName) => post(`/placements/${id}/creatives`, { path, fileName }))} />
      </Card>

      <Card title={t('proofs')}>
        {proofs.map((r) => (
          <div className="row" key={r.id}>
            <span><button type="button" className="btn" onClick={() => open(r.storagePath)}>{r.fileName}</button><br /><small className="muted">{r.kind} · {r.actualDate} · {r.status}</small></span>
            {r.status === 'uploaded' && <span className="artwork">
              <button type="button" className="btn" onClick={() => post(`/proofs/${r.id}/review`, { approved: true })}>{t('verify')}</button>
              <button type="button" className="btn" onClick={() => post(`/proofs/${r.id}/review`, { approved: false })}>{t('rejectItem')}</button>
            </span>}
          </div>
        ))}
        <div className="grid2 mt">
          <Select label={t('kind')} value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: k }))} />
          <Field label={t('actualDate')}><input className="input" type="date" dir="ltr" value={actualDate} onChange={(e) => setActualDate(e.target.value)} /></Field>
          <div className="span2"><input className="input" type="file" accept="image/*,video/*,application/pdf" capture="environment" aria-label={t('proofs')} disabled={!actualDate} onChange={upload((path, fileName) => post(`/placements/${id}/proofs`, { path, fileName, kind, actualDate }))} /></div>
        </div>
      </Card>
    </div>
  );
}
