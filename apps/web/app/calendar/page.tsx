'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Card, Field, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { DictKey } from '@/lib/dict';
import { useI18n } from '@/lib/i18n';

type Event = { date: string; kind: string; title: string; status: string; href: string };

export default function CalendarPage() {
  const { t } = useI18n();
  const [from, setFrom] = useState('');
  const { data, error } = useLoad(() => api<Event[]>(`/calendar?from=${from}`), [] as Event[], [from]);
  const days = [...new Set(data.map((e) => e.date))];
  return (
    <div className="stack">
      <h1>{t('calendar')}</h1>
      {error && <p className="error">{t('loadFailed')}</p>}
      <Field label={t('startDate')}><input className="input" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      {days.length === 0 && <p className="muted">{t('noRecords')}</p>}
      {days.map((d) => (
        <Card key={d} title={d}>
          {data.filter((e) => e.date === d).map((e, i) => (
            <Link className="row" key={i} href={e.href}><span>{e.title}</span><small className="muted">{t(e.kind as DictKey)}{e.status ? ` · ${e.status}` : ''}</small></Link>
          ))}
        </Card>
      ))}
    </div>
  );
}
