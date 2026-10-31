import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Inter, Noto_Nastaliq_Urdu } from 'next/font/google';
import { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import { I18nProvider, Theme } from '@/lib/i18n';
import { Lang } from '@/lib/dict';
import './globals.css';

const latin = Inter({ subsets: ['latin'], variable: '--font-latin' });
const urdu = Noto_Nastaliq_Urdu({ subsets: ['arabic'], weight: ['400', '700'], variable: '--font-urdu' });

export const metadata: Metadata = { title: 'Media Agency Portal', manifest: '/manifest.webmanifest' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0a0a0a' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const lang: Lang = store.get('lang')?.value === 'ur' ? 'ur' : 'en';
  const theme: Theme = store.get('theme')?.value === 'light' ? 'light' : 'dark';
  return (
    <html lang={lang} dir={lang === 'ur' ? 'rtl' : 'ltr'} data-theme={theme} className={`${latin.variable} ${urdu.variable}`}>
      <body><I18nProvider initialLang={lang} initialTheme={theme}><Shell>{children}</Shell></I18nProvider></body>
    </html>
  );
}
