'use client';
import { useEffect, useMemo, useState } from 'react';
import { priceLine, PricingUnit } from '@mamp/pricing';
import { Outlet } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { AdDraft, PAPER_FORMATS } from '@/lib/media';
import { AdContent, AdFields, sampleAd } from './AdFields';
import { NewspaperPreview, PagePosition, PageType } from './NewspaperPreview';
import { OutletRatePicker } from './OutletRatePicker';
import { Card, NumberField, Result, Row, Select, SliderField } from './ui';

const UNITS: PricingUnit[] = ['per_sq_cm', 'per_sq_inch', 'per_column_cm', 'per_word', 'per_line', 'fixed'];
const POSITIONS: PagePosition[] = ['top_left', 'top_right', 'center', 'bottom_left', 'bottom_right', 'bottom_full'];
const PAGES: PageType[] = ['front', 'inner', 'back'];

export function NewspaperCalculator({ onDraft }: { onDraft?: (d: AdDraft | null) => void }) {
  const { t, pkr, lang } = useI18n();
  const [unit, setUnit] = useState<PricingUnit>('per_sq_cm');
  const [widthCm, setWidth] = useState(9);
  const [heightCm, setHeight] = useState(15);
  const [rate, setRate] = useState(250);
  const [insertions, setInsertions] = useState(onDraft ? 1 : 2);
  const [premiumFixed, setPremium] = useState(0);
  const [discountPercent, setDiscount] = useState(onDraft ? 0 : 30);
  const [format, setFormat] = useState<string>('display');
  const [outlet, setOutlet] = useState<Outlet | null>(null);
  const [surchargePercent, setSurcharge] = useState(0);
  const [columns, setColumns] = useState(3);
  const [words, setWords] = useState(25);
  const [lines, setLines] = useState(5);
  const [pageWidthCm, setPageWidth] = useState(33);
  const [pageHeightCm, setPageHeight] = useState(54);
  const [pageColumns, setPageColumns] = useState(8);
  const [position, setPosition] = useState<PagePosition>('bottom_right');
  const [pageType, setPageType] = useState<PageType>('inner');
  const [colour, setColour] = useState('colour');
  const [ad, setAd] = useState<AdContent>({ lang, ...(onDraft ? { heading: '', body: '' } : sampleAd[lang]), artwork: null });

  const price = useMemo(() => {
    try {
      return priceLine({ unit, rate, premiumFixed, discountPercent, surchargePercent, quantity: { widthCm, heightCm, columns, words, lines, insertions } });
    } catch { return null; }
  }, [unit, rate, premiumFixed, discountPercent, surchargePercent, widthCm, heightCm, columns, words, lines, insertions]);

  const draft = onDraft && outlet ? { outletId: outlet.id, outletName: outlet.name, formatCode: format, unit, rate, premiumFixed, surchargePercent, discountPercent, quantity: Object.fromEntries(Object.entries({ widthCm, heightCm, columns, words, lines, insertions }).filter(([, v]) => Number.isFinite(v))), ad: { heading: ad.heading, body: ad.body, lang: ad.lang }, total: price?.total ?? null } : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onDraft?.(draft); }, [JSON.stringify(draft)]);
  const isSize = unit === 'per_sq_cm' || unit === 'per_sq_inch' || unit === 'per_column_cm';
  const tooBig = widthCm > pageWidthCm || heightCm > pageHeightCm;

  return (
    <div className="stack">
      <Card title={t('paperTitle')}>
        <div className="grid2">
          <OutletRatePicker categoryCode="newspaper" formatCode={format}
            onRule={(r) => { setUnit(r.unit); setRate(Number(r.rate)); }}
            onOutlet={(o) => {
              setOutlet(o);
              if (o?.pageWidthCm) setPageWidth(Number(o.pageWidthCm));
              if (o?.pageHeightCm) setPageHeight(Number(o.pageHeightCm));
              if (o?.columns) setPageColumns(o.columns);
            }} />
          <Select label={t('format')} value={format} onChange={setFormat} options={PAPER_FORMATS.map((f) => ({ value: f as string, label: t(f) }))} />
          <Select label={t('pricingMethod')} value={unit} onChange={setUnit} options={UNITS.map((u) => ({ value: u, label: t(u) }))} />
          <NumberField label={t('rate')} value={rate} onChange={setRate} />
          <SliderField label={t('width')} unit=" cm" value={widthCm} min={1} max={Math.max(pageWidthCm, 1)} onChange={setWidth} />
          <SliderField label={t('height')} unit=" cm" value={heightCm} min={1} max={Math.max(pageHeightCm, 1)} onChange={setHeight} />
          {unit === 'per_column_cm' && <NumberField label={t('columns')} value={columns} onChange={setColumns} />}
          {unit === 'per_word' && <NumberField label={t('words')} value={words} onChange={setWords} />}
          {unit === 'per_line' && <NumberField label={t('lines')} value={lines} onChange={setLines} />}
          <NumberField label={t('insertions')} value={insertions} onChange={setInsertions} />
          <NumberField label={t('premium')} value={premiumFixed} onChange={setPremium} />
          <NumberField label={t('colourSurcharge')} value={surchargePercent} onChange={setSurcharge} />
          <SliderField label={t('discount')} unit="%" value={discountPercent} min={0} max={30} onChange={setDiscount} />
        </div>
        <hr />
        {price ? (
          <>
            <Row label={t('baseCost')} value={pkr(price.base)} />
            {Number(price.surcharge) > 0 && <Row label={t('surcharge')} value={pkr(price.surcharge)} />}
            <Row label={t('premiumLine')} value={pkr(price.premium)} />
            <Row label={t('discountLine')} value={`– ${pkr(price.discount)}`} />
            <Result label={t('paperResult')} value={pkr(price.total)} />
          </>
        ) : <p className="error">{t('minimumNote')}</p>}
        <p className="muted">{t('paperNote')}</p>
      </Card>

      <Card title={t('preview')}>
        <AdFields ad={ad} setAd={setAd} />
        <div className="grid2 mt">
          <Select label={t('pageType')} value={pageType} onChange={setPageType} options={PAGES.map((p) => ({ value: p, label: t(p) }))} />
          <Select label={t('position')} value={position} onChange={setPosition} options={POSITIONS.map((p) => ({ value: p, label: t(p) }))} />
          <Select label={t('colour')} value={colour} onChange={setColour}
            options={[{ value: 'colour', label: t('colour') }, { value: 'mono', label: t('blackWhite') }]} />
          <NumberField label={t('pageColumns')} value={pageColumns} onChange={setPageColumns} step={1} />
          <NumberField label={t('pageWidth')} value={pageWidthCm} onChange={setPageWidth} />
          <NumberField label={t('pageHeight')} value={pageHeightCm} onChange={setPageHeight} />
        </div>
        {tooBig && isSize && <p className="error">{t('tooBig')}</p>}
        <NewspaperPreview {...{ ad, widthCm, heightCm, pageWidthCm, pageHeightCm, pageColumns, position, pageType }} colour={colour === 'colour'} />
        <p className="muted">{t('previewNote')}</p>
      </Card>
    </div>
  );
}
