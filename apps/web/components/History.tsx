'use client';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Card, Row, useLoad } from './ui';

type Entry = { id: string; action: string; createdAt: string; user: string | null };

export function History({ entity, id, version }: { entity: string; id: string; version?: number }) {
  const { t } = useI18n();
  const { data } = useLoad(() => api<Entry[]>(`/history/${entity}/${id}`), [] as Entry[], [entity, id, version]);
  return (
    <Card title={t('history')}>
      {data.length === 0 && <p className="muted">{t('noRecords')}</p>}
      {data.map((h) => (
        <Row key={h.id} label={`${h.user ?? '—'} · ${h.action.replace(/_/g, ' ')}`} value={new Date(h.createdAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' })} />
      ))}
    </Card>
  );
}
