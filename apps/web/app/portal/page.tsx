'use client';
import { useState } from 'react';
import { Card, Row, useLoad } from '@/components/ui';
import { api, Me } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type CustomerView = {
  quotations: { id: string; number: string; status: string; total: string; validUntil: string }[];
  orders: { id: string; number: string; status: string; total: string }[];
  placements: { id: string; orderId: string; formatCode: string; date: string; status: string }[];
  invoices: { id: string; number: string; dueDate: string; total: string; balance: string }[];
};
type SupplierBooking = { id: string; number: string; status: string; requestedDate: string; supplierReference: string | null; formatCode: string; outletName: string };

export default function PortalPage() {
  const { t, pkr } = useI18n();
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState('');
  const { data, error } = useLoad(async () => {
    const me = await api<Me>('/auth/me');
    const customer = me.permissions.includes('portal.customer') ? await api<CustomerView>('/portal/customer') : null;
    const supplier = me.permissions.includes('portal.supplier') ? await api<SupplierBooking[]>('/portal/supplier/bookings') : null;
    return { customer, supplier };
  }, null, [version]);
  const post = async (path: string, body: unknown = {}) => {
    setMessage('');
    try { await api(path, { method: 'POST', body: JSON.stringify(body) }); setVersion((v) => v + 1); }
    catch { setMessage(t('saveFailed')); }
  };
  if (error) return <p className="error">{t('accessDenied')}</p>;
  if (!data) return null;
  const { customer, supplier } = data;

  return (
    <div className="stack">
      <h1>{t('portal')}</h1>
      {message && <p className="error">{message}</p>}
      {customer && <>
        <Card title={t('quotations')}>
          {customer.quotations.length === 0 && <p className="muted">{t('noRecords')}</p>}
          {customer.quotations.map((q) => (
            <div key={q.id}>
              <Row label={`${q.number} · ${q.status}`} value={pkr(q.total)} />
              {q.status === 'sent' && <div className="artwork">
                <button type="button" className="btn primary" onClick={() => post(`/portal/customer/quotations/${q.id}/accept`)}>{t('approve')}</button>
                <button type="button" className="btn" onClick={() => post(`/portal/customer/quotations/${q.id}/reject`)}>{t('rejectItem')}</button>
              </div>}
            </div>
          ))}
        </Card>
        <Card title={t('orders')}>
          {customer.orders.length === 0 && <p className="muted">{t('noRecords')}</p>}
          {customer.orders.map((o) => (
            <div key={o.id}>
              <Row label={`${o.number} · ${o.status}`} value={pkr(o.total)} />
              {customer.placements.filter((p) => p.orderId === o.id).map((p) => <small className="muted" key={p.id}>{p.formatCode} · {p.date} · {p.status}</small>)}
            </div>
          ))}
        </Card>
        <Card title={t('invoices')}>
          {customer.invoices.length === 0 && <p className="muted">{t('noRecords')}</p>}
          {customer.invoices.map((i) => <Row key={i.id} label={`${i.number} · ${i.dueDate}`} value={`${pkr(i.balance)} / ${pkr(i.total)}`} />)}
        </Card>
      </>}
      {supplier && (
        <Card title={t('bookings')}>
          {supplier.length === 0 && <p className="muted">{t('noRecords')}</p>}
          {supplier.map((b) => (
            <div key={b.id}>
              <Row label={`${b.number} · ${b.outletName}`} value={`${b.formatCode} · ${b.requestedDate} · ${b.status}`} />
              {(b.status === 'submitted' || b.status === 'reschedule_requested') && <div className="artwork">
                <button type="button" className="btn primary" onClick={() => post(`/portal/supplier/bookings/${b.id}/respond`, { status: 'confirmed' })}>{t('approve')}</button>
                <button type="button" className="btn" onClick={() => post(`/portal/supplier/bookings/${b.id}/respond`, { status: 'rejected' })}>{t('rejectItem')}</button>
              </div>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
