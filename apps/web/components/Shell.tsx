'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Newspaper, PanelLeftClose, PanelLeftOpen, Plus, Shield, Upload, Settings, BarChart3, Menu, CalendarDays, LayoutDashboard, Building2, Landmark, CalendarCheck, Calculator, Contact, FileText, ShoppingCart, LogOut, Moon, Sun, Tags, Users } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { api, isPortalOnly, Me, onBusy } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';

const NAV = [
  { href: '/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { href: '/orders', key: 'orders', icon: ShoppingCart },
  { href: '/customers', key: 'customers', icon: Contact },
  { href: '/calculators', key: 'calculators', icon: Calculator },
  { href: '/quotations', key: 'quotations', icon: FileText },
  { href: '/bookings', key: 'bookings', icon: CalendarCheck },
  { href: '/media', key: 'media', icon: Building2 },
  { href: '/rate-cards', key: 'rateCards', icon: Tags },
  { href: '/calendar', key: 'calendar', icon: CalendarDays },
  { href: '/reports', key: 'reports', icon: BarChart3 },
  { href: '/import', key: 'importData', icon: Upload },
  { href: '/security', key: 'security', icon: Shield },
] as const;

function ProgressBar() {
  const [busy, setBusy] = useState(false);
  useEffect(() => onBusy(setBusy), []);
  return busy ? <div className="progress" /> : null;
}

export function Shell({ children }: { children: ReactNode }) {
  const { t, theme, toggleLang, toggleTheme } = useI18n();
  const path = usePathname();
  const isLogin = path === '/login' || path === '/reset-password';
  const [me, setMe] = useState<Me | null>(null);
  const [more, setMore] = useState(false);
  const [rail, setRail] = useState(false);
  const wide = path === '/orders/new';
  const portal = isPortalOnly(me);
  useEffect(() => { if (!isLogin) api<Me>('/auth/me').then(setMe).catch(() => setMe(null)); }, [isLogin]);
  useEffect(() => { setMore(false); if (path === '/orders/new') setRail(true); }, [path]);
  useEffect(() => { if (portal && path !== '/portal' && !path.startsWith('/print')) window.location.href = '/portal'; }, [portal, path]);
  useEffect(() => { try { if (localStorage.getItem('rail') === '1') setRail(true); } catch {} }, []);
  const toggleRail = () => { setRail(!rail); try { localStorage.setItem('rail', rail ? '0' : '1'); } catch {} };
  const logout = async () => { await supabase.auth.signOut(); window.location.href = '/login'; };
  const items = portal ? [{ href: '/portal', key: 'portal', icon: Users } as const] : [...NAV,
    ...(me?.permissions.includes('finance.read') ? [{ href: '/finance', key: 'finance', icon: Landmark } as const] : []),
    ...(me?.permissions.includes('users.read') ? [{ href: '/users', key: 'users', icon: Users } as const] : []),
    ...(me?.permissions.includes('users.write') ? [{ href: '/settings', key: 'settings', icon: Settings } as const] : [])];
  const links = items.map(({ href, key, icon: Icon }) => (
    <Link key={href} href={href} title={t(key)} aria-current={path.startsWith(href) && path !== '/orders/new' ? 'page' : undefined}><Icon size={18} /><span>{t(key)}</span></Link>
  ));
  if (isLogin || path.startsWith('/print')) return <>{children}</>;
  return (
    <div className={`shell${wide ? ' wide' : ''}`}>
      <aside className={`sidebar${rail ? ' rail' : ''}`}>
        <b className="brand"><i>M</i><span>{t('appName')}</span></b>
        <button type="button" className="btn icon railbtn" aria-label={t('more')} aria-expanded={!rail} onClick={toggleRail}>{rail ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
        <nav>{links}</nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <b className="brand mobile-only">{t('appName')}</b>
          <div className="actions">
            {!portal && <Link className="btn primary neworder" href="/orders/new" aria-label={t('newOrder')}><Newspaper size={18} /><Plus size={14} /><span>{t('newOrder')}</span></Link>}
            <button type="button" className="btn" onClick={toggleLang}>{t('language')}</button>
            <button type="button" className="btn icon" aria-label={t('theme')} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button type="button" className="btn icon" aria-label={t('logout')} title={t('logout')} onClick={logout}><LogOut size={18} /></button>
          </div>
        </header>
        <ProgressBar />
        <main className="content">{children}</main>
      </div>
      {more && <nav className="moremenu">{links.slice(3)}</nav>}
      <nav className="bottomnav">{links.slice(0, 3)}{links.length > 3 && <button type="button" aria-expanded={more} aria-label={t('more')} onClick={() => setMore(!more)}><Menu size={18} />{t('more')}</button>}</nav>
    </div>
  );
}
