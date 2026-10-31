'use client';
import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { DictKey, Lang, translate } from './dict';

export type Theme = 'dark' | 'light';
interface Ctx { lang: Lang; theme: Theme; t: (k: DictKey) => string; pkr: (v: string | number) => string; toggleLang: () => void; toggleTheme: () => void }
const I18n = createContext<Ctx | null>(null);

const persist = (name: string, value: string) => { document.cookie = `${name}=${value};path=/;max-age=31536000;samesite=lax`; };

export function I18nProvider({ initialLang, initialTheme, children }: { initialLang: Lang; initialTheme: Theme; children: ReactNode }) {
  const [lang, setLang] = useState(initialLang);
  const [theme, setTheme] = useState(initialTheme);
  const value = useMemo<Ctx>(() => ({
    lang, theme,
    t: (k) => translate(lang, k),
    pkr: (v) => {
      const amount = Number(v).toLocaleString('en-PK', { maximumFractionDigits: 2 });
      return lang === 'ur' ? `${amount} روپے` : `PKR ${amount}`;
    },
    toggleLang: () => {
      const next = lang === 'en' ? 'ur' : 'en';
      setLang(next); persist('lang', next);
      document.documentElement.lang = next;
      document.documentElement.dir = next === 'ur' ? 'rtl' : 'ltr';
    },
    toggleTheme: () => {
      const next = theme === 'dark' ? 'light' : 'dark';
      setTheme(next); persist('theme', next);
      document.documentElement.dataset.theme = next;
    },
  }), [lang, theme]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18n);
  if (!ctx) throw new Error('useI18n outside provider');
  return ctx;
}
