'use client';
import { DictKey } from '@/lib/dict';
import { useI18n } from '@/lib/i18n';

export interface AdLine {
  outletName: string; formatCode: string; date: string; net: string;
  request?: { unit?: string; rate?: number; multiplier?: number; timeBandCode?: string; quantity?: Record<string, number>; ad?: { heading?: string; body?: string } };
  snapshot?: { unit?: string; rate?: string; breakdown?: { base?: string; surcharge?: string; premium?: string; discount?: string } };
}

const FIELDS: Record<string, string[]> = {
  per_sq_cm: ['widthCm', 'heightCm', 'insertions'], per_sq_inch: ['widthCm', 'heightCm', 'insertions'], per_column_cm: ['columns', 'heightCm', 'insertions'],
  per_word: ['words', 'insertions'], per_line: ['lines', 'insertions'], per_second: ['durationSeconds', 'spots'], per_minute: ['durationSeconds', 'spots'],
  per_spot: ['spots'], per_ticker: ['spots'], per_ticker_second: ['durationSeconds', 'spots'], per_day: ['periods'], per_week: ['periods'], per_month: ['periods'],
  per_cpm: ['impressions'], per_cpc: ['clicks'], per_cpv: ['views'],
};
const LABELS: Record<string, DictKey> = { widthCm: 'width', heightCm: 'height', columns: 'columns', words: 'words', lines: 'lines', insertions: 'insertions', durationSeconds: 'duration', spots: 'spots', periods: 'periods', impressions: 'impressions', clicks: 'clicks', views: 'views' };
const UNITS: Record<string, string> = { widthCm: ' cm', heightCm: ' cm', durationSeconds: ' sec' };

/** Everything agreed for one ad, shared by the order screen and the printed invoice. */
export function AdBreakdown({ line }: { line: AdLine }) {
  const { t, pkr } = useI18n();
  const unit = line.snapshot?.unit ?? line.request?.unit ?? '';
  const rate = line.snapshot?.rate ?? line.request?.rate;
  const b = line.snapshot?.breakdown;
  const q = line.request?.quantity ?? {};
  const facts: [string, string][] = [[t('format'), t(line.formatCode as DictKey) ?? line.formatCode], [t('publishDate'), line.date]];
  if (line.request?.ad?.heading) facts.push([t('heading'), line.request.ad.heading]);
  if (line.request?.ad?.body) facts.push([t('body'), line.request.ad.body]);
  if (line.request?.timeBandCode) facts.push([t('timeBand'), t(line.request.timeBandCode as DictKey) ?? line.request.timeBandCode]);
  for (const k of FIELDS[unit] ?? []) if (q[k] !== undefined) facts.push([t(LABELS[k]), `${q[k]}${UNITS[k] ?? ''}`]);
  if (unit) facts.push([t('pricingMethod'), t(unit as DictKey) ?? unit]);
  const money: [string, string][] = [];
  if (rate !== undefined) money.push([t('rate'), pkr(String(rate))]);
  if (Number(line.request?.multiplier ?? 1) !== 1) money.push([t('multiplier'), `${Number(line.request!.multiplier)}×`]);
  if (b?.base) money.push([t('baseCost'), pkr(b.base)]);
  if (Number(b?.surcharge ?? 0) > 0) money.push([t('surcharge'), pkr(b!.surcharge!)]);
  if (Number(b?.premium ?? 0) > 0) money.push([t('premiumLine'), pkr(b!.premium!)]);
  if (Number(b?.discount ?? 0) > 0) money.push([t('discountLine'), `– ${pkr(b!.discount!)}`]);
  return (
    <div className="ad-breakdown">
      <h3>{line.outletName}</h3>
      <div className="ad-columns">
        <dl>{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <dl>{money.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}<div className="ad-net"><dt>{t('lineTotal')}</dt><dd>{pkr(line.net)}</dd></div></dl>
      </div>
    </div>
  );
}
