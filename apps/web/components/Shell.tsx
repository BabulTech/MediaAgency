'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Calculator, LogOut, Moon, Sun, Tags, Users } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { api, Me } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';

const NAV = [
  { href: '/calculators', key: 'calculators', icon: Calculator },
  { href: '/media', key: 'media', icon: Building2 },
  { href: '/rate-cards', key: 'rateCards', icon: Tags },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { t, theme, toggleLang, toggleTheme } = useI18n();
  const path = usePathname();
  const isLogin = path === '/login' || path === '/reset-password';
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { if (!isLogin) api<Me>('/auth/me').then(setMe).catch(() => setMe(null)); }, [isLogin]);
  const logout = async () => { await supabase.auth.signOut(); window.location.href = '/login'; };
  const items = me?.permissions.includes('users.read') ? [...NAV, { href: '/users', key: 'users', icon: Users } as const] : NAV;
  const links = items.map(({ href, key, icon: Icon }) => (
    <Link key={href} href={href} aria-current={path.startsWith(href) ? 'page' : undefined}><Icon size={18} />{t(key)}</Link>
  ));
  if (isLogin) return <>{children}</>;
  return (
    <div className="shell">
      <aside className="sidebar"><b className="brand">{t('appName')}</b><nav>{links}</nav></aside>
      <div className="main">
        <header className="topbar">
          <b className="brand mobile-only">{t('appName')}</b>
          <div className="actions">
            <button type="button" className="btn" onClick={toggleLang}>{t('language')}</button>
            <button type="button" className="btn icon" aria-label={t('theme')} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button type="button" className="btn icon" aria-label={t('logout')} title={t('logout')} onClick={logout}><LogOut size={18} /></button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
      <nav className="bottomnav">{links}</nav>
    </div>
  );
}
