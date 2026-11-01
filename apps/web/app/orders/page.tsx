'use client';
import Link from 'next/link';
import { Card, Status, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { ExportBar } from '@/components/ExportBar';
import { useI18n } from '@/lib/i18n';

type Row = { order: { id: string; number: string; status: string; total: string }; customerName: string };

export default function OrdersPage() {
  const { t, pkr } = useI18n();
  const { data, error } = useLoad(() => api<Row[]>('/orders'), []);
  return (
    <div className="stack">
      <h1>{t('orders')}</h1>
            <ExportBar name="orders" rows={data.map((r) => ({ number: r.order.number, customer: r.customerName, status: r.order.status, total: r.order.total }))} />
      {error && <p className="error">{t('apiDown')}</p>}
      <Card>
        {data.length === 0 && <p className="muted">{t('noRecords')}</p>}
        {data.map(({ order: o, customerName }) => (
          <Link className="row" key={o.id} href={`/orders/${o.id}`}>
            <span><b>{o.number}</b><br /><small className="muted">{customerName}</small></span><span className="row-end"><Status value={o.status === 'confirmed' ? 'active' : o.status} /><b>{pkr(o.total)}</b></span>
          </Link>
        ))}
      </Card>
    </div>
  );
}
