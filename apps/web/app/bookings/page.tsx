'use client';
import Link from 'next/link';
import { Card, Status, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type Row = { booking: { id: string; number: string; status: string; requestedDate: string; placementId: string }; outletName: string };

export default function BookingsPage() {
  const { t } = useI18n();
  const { data, error } = useLoad(() => api<Row[]>('/bookings'), []);
  return (
    <div className="stack">
      <h1>{t('bookings')}</h1>
      {error && <p className="error">{t('apiDown')}</p>}
      <Card>
        {data.length === 0 && <p className="muted">{t('noRecords')}</p>}
        {data.map(({ booking: b, outletName }) => (
          <Link className="row" key={b.id} href={`/placements/${b.placementId}`}>
            <span><b>{b.number}</b><br /><small className="muted">{outletName} · {b.requestedDate}</small></span><Status value={b.status} />
          </Link>
        ))}
      </Card>
    </div>
  );
}
