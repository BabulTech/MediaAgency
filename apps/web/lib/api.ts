import type { RateRule } from '@mamp/pricing';
import { supabase } from './supabase';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface Category { id: string; code: string; name: string }
export interface Organization { id: string; code: string; name: string }
export interface Outlet { id: string; code: string; name: string; categoryId: string; organizationId: string; pageWidthCm: string | null; pageHeightCm: string | null; columns: number | null }
export interface RateCard { id: string; name: string; kind: string; status: string; effectiveFrom: string; isSample: boolean; currency: string }

export interface Me { id: string; name: string; email: string; roles: string[]; permissions: string[] }
export interface User { id: string; email: string; name: string; active: boolean; roles: string[] }
export interface Role { id: string; code: string; name: string }

export interface Customer { id: string; number: string; name: string; type: string; phone: string | null; email: string | null; city: string | null; ntn: string | null; creditLimit: string | null; status: string }
export interface Contact { id: string; name: string; phone: string | null; email: string | null }
export interface Campaign { id: string; name: string; startDate: string; endDate: string; budget: string | null; status: string }

export const isPortalOnly = (me: Me | null) => !!me && me.permissions.some((p) => p.startsWith('portal.')) && !me.permissions.includes('sales.read');

const CACHE_MS = 20_000;
const cache = new Map<string, { until: number; value: unknown }>();
let pending = 0;
const listeners = new Set<(busy: boolean) => void>();
const track = (n: number) => { pending += n; listeners.forEach((l) => l(pending > 0)); };
export const onBusy = (l: (busy: boolean) => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Reads are reused briefly so moving between screens is instant. Any save clears them. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const read = !init?.method || init.method === 'GET';
  const hit = read ? cache.get(path) : undefined;
  if (hit && hit.until > Date.now()) return hit.value as T;
  if (!read) cache.clear();
  track(1);
  try {
    const value = await request<T>(path, init);
    if (read) cache.set(path, { until: Date.now() + CACHE_MS, value });
    else cache.clear();
    return value;
  } finally { track(-1); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const auth: Record<string, string> = data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  const res = await fetch(`${BASE}/v1${path}`, { ...init, headers: { 'content-type': 'application/json', ...auth, ...init?.headers } });
  if (res.status === 401 && typeof window !== 'undefined') window.location.href = '/login';
  if (!res.ok) throw Object.assign(new Error(`API ${res.status}`), { status: res.status });
  return res.status === 204 ? (undefined as T) : res.json();
}

export const outletRules = (id: string) => api<RateRule[]>(`/outlets/${id}/rate-rules`);
