'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, Upload, Settings, Bell, BarChart3, Menu, CalendarDays, LayoutDashboard, Building2, Landmark, CalendarCheck, Calculator, Contact, FileText, ShoppingCart, LogOut, Moon, Sun, Tags, Users } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { api, isPortalOnly, Me } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';

const NAV = [
  { href: '/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { href: '/calculators', key: 'calculators', icon: Calculator },
  { href: '/customers', key: 'customers', icon: Contact },
  { href: '/quotations', key: 'quotations', icon: FileText },
  { href: '/orders', key: 'orders', icon: ShoppingCart },
  { href: '/bookings', key: 'bookings', icon: CalendarCheck },
  { href: '/media', key: 'media', icon: Building2 },
  { href: '/rate-cards', key: 'rateCards', icon: Tags },
  { href: '/calendar', key: 'calendar', icon: CalendarDays },
  { href: '/reports', key: 'reports', icon: BarChart3 },
  { href: '/import', key: 'importData', icon: Upload },
  { href: '/security', key: 'security', icon: Shield },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { t, theme, toggleLang, toggleTheme } = useI18n();
  const path = usePathname();
  const isLogin = path === '/login' || path === '/reset-password';
  const [me, setMe] = useState<Me | null>(null);
  const [alerts, setAlerts] = useState(0);
  const [more, setMore] = useState(false);
  const portal = isPortalOnly(me);
  useEffect(() => { if (!isLogin) api<Me>('/auth/me').then(setMe).catch(() => setMe(null)); }, [isLogin]);
  useEffect(() => { setMore(false); }, [path]);
  useEffect(() => { if (portal && path !== '/portal' && !path.startsWith('/print')) window.location.href = '/portal'; }, [portal, path]);
  useEffect(() => { if (!isLogin && me && !portal) api<unknown[]>('/alerts').then((a) => setAlerts(a.length)).catch(() => setAlerts(0)); }, [isLogin, path, me, portal]);
  const logout = async () => { await supabase.auth.signOut(); window.location.href = '/login'; };
  const items = portal ? [{ href: '/portal', key: 'portal', icon: Users } as const] : [...NAV,
    ...(me?.permissions.includes('finance.read') ? [{ href: '/finance', key: 'finance', icon: Landmark } as const] : []),
    ...(me?.permissions.includes('users.read') ? [{ href: '/users', key: 'users', icon: Users } as const] : []),
    ...(me?.permissions.includes('users.write') ? [{ href: '/settings', key: 'settings', icon: Settings } as const] : [])];
  const links = items.map(({ href, key, icon: Icon }) => (
    <Link key={href} href={href} aria-current={path.startsWith(href) ? 'page' : undefined}><Icon size={18} />{t(key)}</Link>
  ));
  if (isLogin || path.startsWith('/print')) return <>{children}</>;
  return (
    <div className="shell">
      <aside className="sidebar"><b className="brand"><i>M</i>{t('appName')}</b><nav>{links}</nav></aside>
      <div className="main">
        <header className="topbar">
          <b className="brand mobile-only">{t('appName')}</b>
          <div className="actions">
            <Link className="btn icon bell" href="/dashboard" aria-label={t('alerts')}><Bell size={18} />{alerts > 0 && <span>{alerts}</span>}</Link>
            <button type="button" className="btn" onClick={toggleLang}>{t('language')}</button>
            <button type="button" className="btn icon" aria-label={t('theme')} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button type="button" className="btn icon" aria-label={t('logout')} title={t('logout')} onClick={logout}><LogOut size={18} /></button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
      {more && <nav className="moremenu">{links.slice(3)}</nav>}
      <nav className="bottomnav">{links.slice(0, 3)}{links.length > 3 && <button type="button" aria-expanded={more} aria-label={t('more')} onClick={() => setMore(!more)}><Menu size={18} />{t('more')}</button>}</nav>
    </div>
  );
}
