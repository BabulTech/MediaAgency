'use client';
import { useEffect, useState } from 'react';
import type { RateRule } from '@mamp/pricing';
import { useI18n } from '@/lib/i18n';
import { api, Category, Outlet, outletRules } from '@/lib/api';
import { Select, useLoad } from './ui';

interface Props {
  categoryCode: 'newspaper' | 'tv';
  formatCode: string;
  timeBandCode?: string;
  onRule: (rule: RateRule) => void;
  onOutlet?: (outlet: Outlet | null) => void;
}

/** Optional: fills the calculator from a published selling rule. Manual entry stays available. */
export function OutletRatePicker({ categoryCode, formatCode, timeBandCode, onRule, onOutlet }: Props) {
  const { t } = useI18n();
  const [outletId, setOutletId] = useState('');
  const [state, setState] = useState<'idle' | 'loaded' | 'none'>('idle');
  const { data, error } = useLoad(
    async () => {
      const [cats, outlets] = await Promise.all([api<Category[]>('/categories'), api<Outlet[]>('/outlets')]);
      const cat = cats.find((c) => c.code === categoryCode);
      return outlets.filter((o) => o.categoryId === cat?.id);
    },
    [] as Outlet[],
  );

  useEffect(() => {
    onOutlet?.(data.find((o) => o.id === outletId) ?? null);
    if (!outletId) { setState('idle'); return; }
    let live = true;
    outletRules(outletId).then((rules) => {
      if (!live) return;
      const selling = rules.filter((r) => r.cardKind === 'selling' && (!r.formatCode || r.formatCode === formatCode));
      const rule = selling.find((r) => r.timeBandCode === timeBandCode) ?? selling.find((r) => !r.timeBandCode);
      if (rule) onRule(rule);
      setState(rule ? 'loaded' : 'none');
    }).catch(() => live && setState('none'));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId, formatCode, timeBandCode]);

  return (
    <div className="span2">
      <Select label={t('outlet')} value={outletId} onChange={setOutletId}
        options={[{ value: '', label: t('manualEntry') }, ...data.map((o) => ({ value: o.id, label: o.name }))]} />
      {error && <small className="muted">{t('apiDown')}</small>}
      {state === 'loaded' && <small className="tag">{t('sampleRate')}</small>}
      {state === 'none' && <small className="muted">{t('noRule')}</small>}
    </div>
  );
}
