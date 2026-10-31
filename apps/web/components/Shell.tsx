'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, BarChart3, CalendarDays, LayoutDashboard, Building2, Landmark, CalendarCheck, Calculator, Contact, FileText, ShoppingCart, LogOut, Moon, Sun, Tags, Users } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { api, Me } from '@/lib/api';
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
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { t, theme, toggleLang, toggleTheme } = useI18n();
  const path = usePathname();
  const isLogin = path === '/login' || path === '/reset-password';
  const [me, setMe] = useState<Me | null>(null);
  const [alerts, setAlerts] = useState(0);
  useEffect(() => { if (!isLogin) api<Me>('/auth/me').then(setMe).catch(() => setMe(null)); }, [isLogin]);
  useEffect(() => { if (!isLogin) api<unknown[]>('/alerts').then((a) => setAlerts(a.length)).catch(() => setAlerts(0)); }, [isLogin, path]);
  const logout = async () => { await supabase.auth.signOut(); window.location.href = '/login'; };
  const items = [...NAV,
    ...(me?.permissions.includes('finance.read') ? [{ href: '/finance', key: 'finance', icon: Landmark } as const] : []),
    ...(me?.permissions.includes('users.read') ? [{ href: '/users', key: 'users', icon: Users } as const] : [])];
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
            <Link className="btn icon bell" href="/dashboard" aria-label={t('alerts')}><Bell size={18} />{alerts > 0 && <span>{alerts}</span>}</Link>
            <button type="button" className="btn" onClick={toggleLang}>{t('language')}</button>
            <button type="button" className="btn icon" aria-label={t('theme')} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button type="button" className="btn icon" aria-label={t('logout')} title={t('logout')} onClick={logout}><LogOut size={18} /></button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
      <nav className="bottomnav">{links.slice(0, 4)}</nav>
    </div>
  );
}
