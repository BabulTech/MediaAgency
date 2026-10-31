'use client';
import { useI18n } from '@/lib/i18n';
import { Lang } from '@/lib/dict';
import { Artwork, Field, Select } from './ui';

export interface AdContent { lang: Lang; heading: string; body: string; artwork: string | null }

export const sampleAd: Record<Lang, Pick<AdContent, 'heading' | 'body'>> = {
  en: { heading: 'Grand Opening Sale', body: 'Up to 40% off this weekend. Visit our new store in Gulberg, Lahore.' },
  ur: { heading: 'شاندار افتتاحی سیل', body: 'اس ہفتے 40 فیصد تک رعایت۔ گلبرگ لاہور میں ہمارے نئے اسٹور پر تشریف لائیں۔' },
};

export function AdFields({ ad, setAd, headingLabel }: { ad: AdContent; setAd: (a: AdContent) => void; headingLabel?: string }) {
  const { t } = useI18n();
  const dir = ad.lang === 'ur' ? 'rtl' : 'ltr';
  return (
    <div className="grid2">
      <Select label={t('adLanguage')} value={ad.lang} onChange={(lang) => setAd({ ...ad, lang, ...sampleAd[lang] })}
        options={[{ value: 'en', label: t('english') }, { value: 'ur', label: t('urdu') }]} />
      <Field label={headingLabel ?? t('heading')}>
        <input className="input" dir={dir} value={ad.heading} onChange={(e) => setAd({ ...ad, heading: e.target.value })} />
      </Field>
      <div className="span2">
        <Field label={t('body')}>
          <textarea className="input" rows={2} dir={dir} value={ad.body} onChange={(e) => setAd({ ...ad, body: e.target.value })} />
        </Field>
      </div>
      <div className="span2"><Artwork url={ad.artwork} onChange={(artwork) => setAd({ ...ad, artwork })} /></div>
    </div>
  );
}
