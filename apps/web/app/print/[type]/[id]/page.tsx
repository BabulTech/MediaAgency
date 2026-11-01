'use client';
import { useParams } from 'next/navigation';
import { useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { DictKey } from '@/lib/dict';
import { useI18n } from '@/lib/i18n';

type Doc = {
  agency: string; company?: { address: string | null; phone: string | null; email: string | null; ntn: string | null; bankDetails: string | null }; number: string; date: string; dueDate?: string; party: string; status?: string;
  lines: { description: string; amount?: string }[];
  subtotal?: string; tax?: string; total?: string; paid?: string; balance?: string; note?: string; customer?: { phone: string | null; email: string | null; address: string | null; city: string | null; ntn: string | null }; payments?: { date: string; method: string | null; reference: string | null; amount: string }[];
};
const ROUTES: Record<string, (id: string) => string> = {
  quotation: (id) => `/quotations/${id}/document`,
  invoice: (id) => `/finance/invoices/${id}/document`,
  'my-invoice': (id) => `/portal/customer/invoices/${id}/document`,
  booking: (id) => `/bookings/${id}/document`,
};
const TITLES = { quotation: 'quotationDoc', invoice: 'invoiceDoc', 'my-invoice': 'invoiceDoc', booking: 'bookingDoc' } as const;

export default function PrintPage() {
  const { type, id } = useParams<{ type: keyof typeof TITLES; id: string }>();
  const { t, pkr } = useI18n();
  const { data, error } = useLoad<Doc | null>(() => api<Doc>(ROUTES[type](id)), null);
  if (error) return <p className="error">{t('loadFailed')}</p>;
  if (!data) return null;
  return (
    <main className="doc">
      <button type="button" className="btn primary no-print" onClick={() => window.print()}>{t('printPdf')}</button>
      <header><div><h1>{data.agency}</h1>{[data.company?.address, data.company?.phone, data.company?.email].filter(Boolean).map((v) => <small className="muted" key={v!}>{v}</small>)}{data.company?.ntn && <small className="muted">NTN {data.company.ntn}</small>}<p><b>{t(TITLES[type])}</b></p></div><div><b>{data.number}</b><p>{data.date}</p>{data.dueDate && <p>{t(type === 'quotation' ? 'validUntil' : type === 'booking' ? 'publishDate' : 'dueDate')}: {data.dueDate}</p>}</div></header>
      <p><b>{data.party}</b></p>
      {data.customer && <p className="muted">{[data.customer.phone, data.customer.email, data.customer.address, data.customer.city, data.customer.ntn && `NTN ${data.customer.ntn}`].filter(Boolean).join(' · ')}</p>}
      <table className="table doc-table">
        <tbody>{data.lines.map((l, i) => <tr key={i}><td style={{ whiteSpace: 'normal' }}>{l.description.split(' · ').map((x) => t(x as DictKey) ?? x).join(' · ')}</td>{l.amount !== undefined && <td>{pkr(l.amount)}</td>}</tr>)}</tbody>
      </table>
      <div className="doc-totals">
        {data.subtotal && data.tax && <p>{t('taxPercent')}: {pkr(data.tax)}</p>}
        {data.total && <p><b>{pkr(data.total)}</b></p>}
        {data.paid && <p>{t('paidAmount')}: {pkr(data.paid)}</p>}
        {data.balance && <p><b>{t('balanceDue')}: {pkr(data.balance)}</b></p>}
      </div>
      {!!data.payments?.length && <h2 className="card-title">{t('paymentsReceived')}</h2>}
      {!!data.payments?.length && <table className="table doc-table"><tbody>{data.payments.map((p, i) => <tr key={i}><td>{[p.date, p.method && (t(p.method as DictKey) ?? p.method), p.reference].filter(Boolean).join(' · ')}</td><td>{pkr(p.amount)}</td></tr>)}</tbody></table>}
      {data.company?.bankDetails && type !== 'booking' && <p className="muted" style={{ whiteSpace: 'pre-line' }}>{data.company.bankDetails}</p>}
    </main>
  );
}
