'use client';
import { useMemo, useState } from 'react';
import { priceLine, PricingUnit } from '@mamp/pricing';
import { useI18n } from '@/lib/i18n';
import { MEDIA_UNITS, OTHER_FORMATS, OtherKind } from '@/lib/media';
import { Card, NumberField, Result, Select, SliderField } from './ui';

export function OtherMediaCalculator() {
  const { t, pkr } = useI18n();
  const [kind, setKind] = useState<OtherKind>('radio');
  const [format, setFormat] = useState<string>(OTHER_FORMATS.radio[0]);
  const [unit, setUnit] = useState<PricingUnit>(MEDIA_UNITS.radio[0]);
  const [rate, setRate] = useState(500);
  const [durationSeconds, setDuration] = useState(30);
  const [spots, setSpots] = useState(10);
  const [periods, setPeriods] = useState(1);
  const [impressions, setImpressions] = useState(100000);
  const [clicks, setClicks] = useState(1000);
  const [views, setViews] = useState(1000);
  const [premiumFixed, setPremium] = useState(0);
  const [discountPercent, setDiscount] = useState(0);

  const price = useMemo(() => {
    try { return priceLine({ unit, rate, premiumFixed, discountPercent, quantity: { durationSeconds, spots, periods, impressions, clicks, views } }); } catch { return null; }
  }, [unit, rate, premiumFixed, discountPercent, durationSeconds, spots, periods, impressions, clicks, views]);

  const change = (k: OtherKind) => { setKind(k); setFormat(OTHER_FORMATS[k][0]); setUnit(MEDIA_UNITS[k][0]); };

  return (
    <Card title={t('otherTitle')}>
      <div className="grid2">
        <Select label={t('category')} value={kind} onChange={change} options={(Object.keys(OTHER_FORMATS) as OtherKind[]).map((k) => ({ value: k, label: t(k) }))} />
        <Select label={t('format')} value={format} onChange={setFormat} options={OTHER_FORMATS[kind].map((f) => ({ value: f, label: t(f) }))} />
        <Select label={t('pricingMethod')} value={unit} onChange={setUnit} options={MEDIA_UNITS[kind].map((u) => ({ value: u, label: t(u) }))} />
        <NumberField label={t('rate')} value={rate} onChange={setRate} />
        {unit === 'per_second' && <NumberField label={t('duration')} value={durationSeconds} onChange={setDuration} />}
        {(unit === 'per_second' || unit === 'per_spot') && <NumberField label={t('spots')} value={spots} onChange={setSpots} />}
        {(unit === 'per_day' || unit === 'per_week' || unit === 'per_month') && <NumberField label={t('periods')} value={periods} onChange={setPeriods} />}
        {unit === 'per_cpm' && <NumberField label={t('impressions')} value={impressions} onChange={setImpressions} />}
        {unit === 'per_cpc' && <NumberField label={t('clicks')} value={clicks} onChange={setClicks} />}
        {unit === 'per_cpv' && <NumberField label={t('views')} value={views} onChange={setViews} />}
        <NumberField label={t(kind === 'outdoor' ? 'installation' : 'premium')} value={premiumFixed} onChange={setPremium} />
        <SliderField label={t('discount')} unit="%" value={discountPercent} min={0} max={30} onChange={setDiscount} />
      </div>
      {price ? <Result label={t('paperResult')} value={pkr(price.total)} /> : <p className="error">{t('minimumNote')}</p>}
      <p className="muted">{t('otherNote')}</p>
    </Card>
  );
}
