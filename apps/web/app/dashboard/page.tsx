'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Card, Field, Row, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { DictKey } from '@/lib/dict';
import { useI18n } from '@/lib/i18n';

type Group = { name: string; count: number; total: string };
type Dash = { sales: string; placements: number; activeCampaigns: number; pendingApprovals: number; pendingBookings: number; proofsPending: number; monthly: Group[]; topCustomers: Group[]; topOutlets: Group[] };
type Alert = { kind: string; title: string; href: string };

export default function DashboardPage() {
  const { t, pkr } = useI18n();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, error } = useLoad<Dash | null>(() => api<Dash>(`/dashboard?from=${from}&to=${to}`), null, [from, to]);
  const { data: alerts } = useLoad(() => api<Alert[]>('/alerts'), [] as Alert[]);
  if (error) return <p className="error">{t('loadFailed')}</p>;
  if (!data) return null;
  const list = (title: DictKey, rows: Group[]) => (
    <Card title={t(title)}>
      {rows.length === 0 && <p className="muted">{t('noRecords')}</p>}
      {rows.map((r) => <Row key={r.name} label={r.name} value={pkr(r.total)} />)}
    </Card>
  );
  return (
    <div className="stack">
      <h1>{t('dashboard')}</h1>
      <Card title={t('getStarted')}>
        <p className="muted">{t('flowHint')}</p>
        <div className="quick">
          <Link className="btn primary" href="/customers">1. {t('addCustomerAction')}</Link>
          <Link className="btn primary" href="/quotations">2. {t('newQuotationAction')}</Link>
          <Link className="btn" href="/calculators">{t('calculators')}</Link>
          <Link className="btn" href="/import">{t('importData')}</Link>
        </div>
      </Card>
      <div className="grid2">
        <Field label={t('startDate')}><input className="input" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t('endDate')}><input className="input" type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="stats">
        <div className="stat lead"><span>{t('totalSales')}</span><strong>{pkr(data.sales)}</strong></div>
        {(['placements', 'activeCampaigns', 'pendingApprovals', 'pendingBookings', 'proofsPending'] as const).map((k) => (
          <div className="stat" key={k}><span>{t(k)}</span><strong>{data[k]}</strong></div>
        ))}
      </div>
      <Card title={t('alerts')}>
        {alerts.length === 0 && <p className="muted">{t('noRecords')}</p>}
        {alerts.map((a, i) => <Link className="row" key={i} href={a.href}><span>{t(a.kind as DictKey)}</span><small className="muted">{a.title}</small></Link>)}
      </Card>
      {list('salesByMonth', data.monthly)}
      {list('topCustomers', data.topCustomers)}
      {list('topOutlets', data.topOutlets)}
    </div>
  );
}
