'use client';
import { useState } from 'react';
import { NewspaperCalculator } from '@/components/NewspaperCalculator';
import { TvCalculator } from '@/components/TvCalculator';
import { Segmented } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

export default function CalculatorsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'newspaper' | 'tv'>('newspaper');
  return (
    <div className="stack">
      <h1>{t('calculators')}</h1>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'newspaper', label: t('newspaper') }, { value: 'tv', label: t('tv') }]} />
      {tab === 'newspaper' ? <NewspaperCalculator /> : <TvCalculator />}
    </div>
  );
}
