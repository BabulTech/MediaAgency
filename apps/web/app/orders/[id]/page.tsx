'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, Result, Status, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { DictKey } from '@/lib/dict';
import { useI18n } from '@/lib/i18n';

type Detail = {
  order: { number: string; status: string; total: string };
  placements: { placement: { id: string; formatCode: string; date: string; net: string; status: string }; outletName: string }[];
};

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const { t, pkr } = useI18n();
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState('');
  const { data, error } = useLoad<Detail | null>(() => api<Detail>(`/orders/${id}`), null, [version]);
  if (error) return <p className="error">{t('apiDown')}</p>;
  if (!data) return null;

  async function cancel() {
    setMessage('');
    try { await api(`/orders/${id}/cancel`, { method: 'POST', body: '{}' }); setVersion((v) => v + 1); }
    catch { setMessage(t('saveFailed')); }
  }

  return (
    <div className="stack">
      <h1>{data.order.number}</h1>
      <Status value={data.order.status} />
      {message && <p className="error">{message}</p>}
      <Card title={t('placements')}>
        {data.placements.map(({ placement: p, outletName }) => (
          <Link className="row" key={p.id} href={`/placements/${p.id}`}>
            <span><b>{outletName}</b><br /><small className="muted">{t(p.formatCode as DictKey) ?? p.formatCode} · {p.date}</small></span><span className="row-end"><Status value={p.status} /><b>{pkr(p.net)}</b></span>
          </Link>
        ))}
        <Result label={t('paperResult')} value={pkr(data.order.total)} />
      </Card>
      {data.order.status === 'confirmed' && <button type="button" className="btn" onClick={cancel}>{t('cancelOrder')}</button>}
    </div>
  );
}
