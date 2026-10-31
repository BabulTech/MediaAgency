import type { RateRule } from '@mamp/pricing';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface Category { id: string; code: string; name: string }
export interface Organization { id: string; code: string; name: string }
export interface Outlet { id: string; code: string; name: string; categoryId: string; organizationId: string; pageWidthCm: string | null; pageHeightCm: string | null; columns: number | null }
export interface RateCard { id: string; name: string; kind: string; status: string; effectiveFrom: string; isSample: boolean; currency: string }

export interface Me { id: string; name: string; email: string; roles: string[]; permissions: string[] }
export interface User { id: string; email: string; name: string; active: boolean; roles: string[] }
export interface Role { id: string; code: string; name: string }

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/v1${path}`, { ...init, credentials: 'include', headers: { 'content-type': 'application/json', ...init?.headers } });
  if (res.status === 401 && path !== '/auth/login' && typeof window !== 'undefined') window.location.href = '/login';
  if (!res.ok) throw Object.assign(new Error(`API ${res.status}`), { status: res.status });
  return res.status === 204 ? (undefined as T) : res.json();
}

export const outletRules = (id: string) => api<RateRule[]>(`/outlets/${id}/rate-rules`);
