'use client';
import { useMemo, useState } from 'react';
import { priceLine, PricingUnit } from '@mamp/pricing';
import { useI18n } from '@/lib/i18n';
import { AdContent, AdFields, sampleAd } from './AdFields';
import { OutletRatePicker } from './OutletRatePicker';
import { TvFormat, TvPreview } from './TvPreview';
import { Card, NumberField, Result, Select, SliderField } from './ui';

const FORMATS: { code: TvFormat; unit: PricingUnit }[] = [
  { code: 'tvc', unit: 'per_second' }, { code: 'ticker', unit: 'per_ticker' }, { code: 'breaking_ticker', unit: 'per_ticker_second' },
  { code: 'lower_third', unit: 'per_second' }, { code: 'l_shape', unit: 'per_second' }, { code: 'logo_placement', unit: 'per_day' },
  { code: 'sponsorship', unit: 'fixed' }, { code: 'scroll', unit: 'per_ticker_second' },
];
const UNITS: PricingUnit[] = ['per_second', 'per_minute', 'per_spot', 'per_ticker', 'per_ticker_second', 'per_day', 'per_week', 'per_month', 'fixed'];
// Demo multipliers only. Real values come from each channel's rate card and can be edited here.
const BANDS = { morning: 1, afternoon: 1.25, evening: 1.75, prime: 2.5, late: 0.75, special: 3 };
type Band = keyof typeof BANDS;

export function TvCalculator() {
  const { t, pkr, lang } = useI18n();
  const [format, setFormat] = useState<TvFormat>('tvc');
  const [unit, setUnit] = useState<PricingUnit>('per_second');
  const [durationSeconds, setDuration] = useState(30);
  const [spots, setSpots] = useState(5);
  const [periods, setPeriods] = useState(1);
  const [rate, setRate] = useState(1500);
  const [band, setBand] = useState<Band>('special');
  const [multiplier, setMultiplier] = useState(3);
  const [discountPercent, setDiscount] = useState(0);
  const [ad, setAd] = useState<AdContent>({ lang, ...sampleAd[lang], artwork: null });

  const price = useMemo(() => {
    try {
      return priceLine({ unit, rate, multiplier, discountPercent, quantity: { durationSeconds, spots, periods } });
    } catch { return null; }
  }, [unit, rate, multiplier, discountPercent, durationSeconds, spots, periods]);

  const byPeriod = unit === 'per_day' || unit === 'per_week' || unit === 'per_month';

  return (
    <div className="stack">
      <Card title={t('tvTitle')}>
        <div className="grid2">
          <OutletRatePicker categoryCode="tv" formatCode={format} timeBandCode={band}
            onRule={(r) => { setUnit(r.unit); setRate(Number(r.rate)); if (r.multiplier) setMultiplier(Number(r.multiplier)); }} />
          <Select label={t('format')} value={format} options={FORMATS.map((f) => ({ value: f.code, label: t(f.code) }))}
            onChange={(code) => { setFormat(code); setUnit(FORMATS.find((f) => f.code === code)!.unit); }} />
          <Select label={t('pricingMethod')} value={unit} onChange={setUnit} options={UNITS.map((u) => ({ value: u, label: t(u) }))} />
          <NumberField label={t('duration')} value={durationSeconds} onChange={setDuration} />
          {byPeriod
            ? <NumberField label={t('periods')} value={periods} onChange={setPeriods} />
            : <NumberField label={t('spots')} value={spots} onChange={setSpots} />}
          <NumberField label={t('baseRate')} value={rate} onChange={setRate} />
          <Select label={t('timeBand')} value={band} onChange={(b) => { setBand(b); setMultiplier(BANDS[b]); }}
            options={(Object.keys(BANDS) as Band[]).map((b) => ({ value: b, label: `${t(b)} (${BANDS[b].toFixed(2)}×)` }))} />
          <NumberField label={t('multiplier')} value={multiplier} onChange={setMultiplier} />
          <SliderField label={t('discount')} unit="%" value={discountPercent} min={0} max={30} onChange={setDiscount} />
        </div>
        {price ? <Result label={t('tvResult')} value={pkr(price.total)} /> : <p className="error">{t('minimumNote')}</p>}
        <p className="muted">{t('tvNote')}</p>
      </Card>

      <Card title={t('preview')}>
        <AdFields ad={ad} setAd={setAd} headingLabel={t('sponsor')} />
        <div className="mt"><TvPreview format={format} ad={ad} durationSeconds={durationSeconds || 0} /></div>
        <p className="muted">{t('previewNote')}</p>
      </Card>
    </div>
  );
}
