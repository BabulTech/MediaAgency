'use client';
import { Card, useLoad } from '@/components/ui';
import { api, RateCard } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function RateCardsPage() {
  const { t } = useI18n();
  const { data, error } = useLoad(() => api<RateCard[]>('/rate-cards'), []);
  return (
    <div className="stack">
      <h1>{t('rateCards')}</h1>
      {error && <p className="error">{t('apiDown')}</p>}
      <Card>
        {data.length === 0 && <p className="muted">{t('noRecords')}</p>}
        {data.map((c) => (
          <div className="row" key={c.id}>
            <span><b>{c.name}</b><br /><small className="muted">{t(c.kind === 'selling' ? 'selling' : 'supplier')} · {c.status} · {t('effectiveFrom')} {c.effectiveFrom}</small></span>
            {c.isSample && <small className="tag">{t('sample')}</small>}
          </div>
        ))}
      </Card>
    </div>
  );
}
