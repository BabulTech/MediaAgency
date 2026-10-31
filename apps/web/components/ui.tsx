'use client';
import { ChangeEvent, ReactNode, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';

export const Card = ({ title, children }: { title?: string; children: ReactNode }) => (
  <section className="card">{title && <h2 className="card-title">{title}</h2>}{children}</section>
);

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="field"><span>{label}</span>{children}</label>
);

export function NumberField({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <Field label={label}>
      <input className="input" type="number" inputMode="decimal" min={0} step={step ?? 'any'} dir="ltr" value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
    </Field>
  );
}

export function SliderField({ label, value, unit = '', min, max, onChange }: { label: string; value: number; unit?: string; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="field"><span>{label}: <b dir="ltr">{value}{unit}</b></span>
      <input type="range" className="slider" min={min} max={max} value={Math.min(value, max)} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <Field label={label}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => <button key={o.value} type="button" role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Artwork({ url, onChange }: { url: string | null; onChange: (u: string | null) => void }) {
  const { t } = useI18n();
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onChange(URL.createObjectURL(file));
    e.target.value = '';
  };
  return (
    <Field label={t('artwork')}>
      <div className="artwork">
        <input className="input" type="file" accept="image/*" onChange={pick} />
        {url && <button type="button" className="btn" onClick={() => onChange(null)}>{t('removeArtwork')}</button>}
      </div>
      <small className="muted">{t('artworkNote')}</small>
    </Field>
  );
}

export const Result = ({ label, value }: { label: string; value: string }) => (
  <div className="result"><span>{label}</span><strong>{value}</strong></div>
);

export const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="row"><span>{label}</span><b>{value}</b></div>
);

/** Fetches once on mount; `error` lets screens show that the API is unreachable. */
export function useLoad<T>(load: () => Promise<T>, fallback: T, deps: unknown[] = []) {
  const [data, setData] = useState(fallback);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    load().then((d) => { if (live) { setData(d); setError(false); } }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error };
}
