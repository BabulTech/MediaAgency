'use client';
import Link from 'next/link';
import { Card, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type Row = { order: { id: string; number: string; status: string; total: string }; customerName: string };

export default function OrdersPage() {
  const { t, pkr } = useI18n();
  const { data, error } = useLoad(() => api<Row[]>('/orders'), []);
  return (
    <div className="stack">
      <h1>{t('orders')}</h1>
      {error && <p className="error">{t('apiDown')}</p>}
      <Card>
        {data.length === 0 && <p className="muted">{t('noRecords')}</p>}
        {data.map(({ order: o, customerName }) => (
          <Link className="row" key={o.id} href={`/orders/${o.id}`}>
            <span><b>{o.number}</b><br /><small className="muted">{customerName} · {o.status}</small></span><b>{pkr(o.total)}</b>
          </Link>
        ))}
      </Card>
    </div>
  );
}
