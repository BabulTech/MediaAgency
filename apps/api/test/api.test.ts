import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { IdentityProvider } from '../src/auth';
import { Db, openDb } from '../src/db';
import { auditLogs, mediaOutlets, pricingSnapshots, tenants, users } from '../src/schema';

let app: INestApplication; let url: string; let db: Db;
let token = 'admin@example.com';
const headers = (t: string) => ({ 'content-type': 'application/json', authorization: `Bearer ${t}` });
const post = (p: string, body: unknown, t = token) => fetch(url + p, { method: 'POST', headers: headers(t), body: JSON.stringify(body) });
const accounts = new Map<string, string>(); // token -> Supabase id
const banned = new Set<string>();
const identity: IdentityProvider = {
  verify: async (t) => { const id = accounts.get(t); return id && !banned.has(id) ? id : null; },
  create: async (email) => { const id = randomUUID(); accounts.set(email, id); return id; },
  setBanned: async (id, b) => { if (b) banned.add(id); else banned.delete(id); },
};

beforeAll(async () => {
  db = await openDb({ memory: true });
  app = await NestFactory.create(AppModule.forDb(db, identity), { logger: false });
  await app.listen(0, '127.0.0.1');
  url = (await app.getUrl()).replace('[::1]', 'localhost');
  const adminId = await identity.create('admin@example.com', '');
  await db.update(users).set({ authId: adminId }).where(eq(users.email, 'admin@example.com'));
}, 30000);
afterAll(() => app.close());

const outlet = async (code: string) => ((await (await fetch(`${url}/v1/outlets`, { headers: headers(token) })).json()) as any[]).find((o) => o.code === code);

describe('pricing API', () => {
  it('prices the TV reference and stores a snapshot', async () => {
    const tv = await outlet('SAMPLE-TV');
    const res = await post('/v1/pricing/calculate', { outletId: tv.id, formatCode: 'tvc', date: '2026-11-02', timeBandCode: 'special', quantity: { durationSeconds: 30, spots: 5 } });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.breakdown.total).toBe('675000.00');
    expect(body.breakdown.supplierCost).toBe('180000.00');
    expect(body.breakdown.margin).toBe('495000.00');
    expect((await db.select().from(pricingSnapshots)).length).toBe(1);
  });
  it('returns 422 when no rate exists, never a guessed price', async () => {
    const tv = await outlet('SAMPLE-TV');
    const res = await post('/v1/pricing/calculate', { outletId: tv.id, formatCode: 'ticker', date: '2026-11-02', quantity: { spots: 1 } });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('NO_RATE');
  });
  it('rejects invalid bodies', async () => {
    expect((await post('/v1/pricing/calculate', { outletId: 'x' })).status).toBe(400);
  });
});

describe('outlets', () => {
  it('creates with an audit row and refuses duplicate codes', async () => {
    const o = await outlet('SAMPLE-TV');
    const dto = { organizationId: o.organizationId, categoryId: o.categoryId, code: 'NEW-1', name: 'New outlet' };
    expect((await post('/v1/outlets', dto)).status).toBe(201);
    expect((await post('/v1/outlets', dto)).status).toBe(409);
    expect((await db.select().from(auditLogs).where(eq(auditLogs.entity, 'media_outlet'))).length).toBe(1);
  });
});

describe('access control', () => {
  const user = (email: string, roleCodes: string[]) => post('/v1/users', { email, name: 'U', password: 'long-password-1', roleCodes });
  const get = (p: string, t: string) => fetch(url + p, { headers: headers(t) });

  it('refuses anonymous and unknown tokens', async () => {
    expect((await fetch(`${url}/v1/outlets`)).status).toBe(401);
    expect((await get('/v1/outlets', 'bogus')).status).toBe(401);
  });
  it('refuses a valid Supabase account nobody provisioned', async () => {
    accounts.set('stranger', randomUUID());
    expect((await get('/v1/auth/me', 'stranger')).status).toBe(401);
  });
  it('enforces permissions on the server', async () => {
    await user('ro@example.com', ['read_only']);
    expect((await get('/v1/outlets', 'ro@example.com')).status).toBe(200);
    expect((await get('/v1/users', 'ro@example.com')).status).toBe(403);
    expect((await post('/v1/users', {}, 'ro@example.com')).status).toBe(403);
    expect((await post('/v1/outlets', {}, 'ro@example.com')).status).toBe(403);
  });
  it('gives portal users nothing internal', async () => {
    await user('cust@example.com', ['customer_portal']);
    expect((await get('/v1/outlets', 'cust@example.com')).status).toBe(403);
  });
  it('cuts access on deactivate', async () => {
    const created = await (await user('gone@example.com', ['read_only'])).json();
    await fetch(`${url}/v1/users/${created.id}/active`, { method: 'PATCH', headers: headers(token), body: JSON.stringify({ active: false }) });
    expect((await get('/v1/auth/me', 'gone@example.com')).status).toBe(401);
  });
  it('hides other tenants records', async () => {
    const [other] = await db.insert(tenants).values({ name: 'Other' }).returning();
    const o = await outlet('SAMPLE-TV');
    await db.insert(mediaOutlets).values({ tenantId: other.id, organizationId: o.organizationId, categoryId: o.categoryId, code: 'OTHER', name: 'Other' });
    expect(await outlet('OTHER')).toBeUndefined();
  });
});

describe('rate cards', () => {
  const rule = { formatCode: 'display', unit: 'per_sq_cm', rate: '100' };
  const draft = async () => {
    const o = await outlet('SAMPLE-DAILY');
    return (await post('/v1/rate-cards', { outletId: o.id, name: 'Card', kind: 'selling', effectiveFrom: '2027-01-01' })).json();
  };
  it('publishes only with rules, then locks the card', async () => {
    const c = await draft();
    expect((await post(`/v1/rate-cards/${c.id}/publish`, {})).status).toBe(409);
    expect((await post(`/v1/rate-cards/${c.id}/rules`, rule)).status).toBe(201);
    expect((await post(`/v1/rate-cards/${c.id}/publish`, {})).status).toBe(201);
    expect((await post(`/v1/rate-cards/${c.id}/rules`, rule)).status).toBe(409);
  });
  it('closes the old version without changing its rules', async () => {
    const c = await draft();
    await post(`/v1/rate-cards/${c.id}/rules`, rule);
    await post(`/v1/rate-cards/${c.id}/publish`, {});
    const n = await (await post(`/v1/rate-cards/${c.id}/new-version`, { effectiveFrom: '2027-06-01' })).json();
    expect(n.version).toBe(2);
    await post(`/v1/rate-cards/${n.id}/publish`, {});
    const old = await (await fetch(`${url}/v1/rate-cards/${c.id}`, { headers: headers(token) })).json();
    expect(old.card.effectiveTo).toBe('2027-05-31');
    expect(old.rules[0].rate).toBe('100.0000');
    expect(old.history.map((h: any) => h.action)).toContain('publish');
  });
  it('rejects a whole import if one row is bad', async () => {
    const c = await draft();
    const res = await post(`/v1/rate-cards/${c.id}/rules/bulk`, { rules: [rule, { unit: 'nonsense', rate: 'x' }] });
    expect(res.status).toBe(400);
    expect((await res.json()).errors[0].row).toBe(2);
    const got = await (await fetch(`${url}/v1/rate-cards/${c.id}`, { headers: headers(token) })).json();
    expect(got.rules.length).toBe(0);
  });
  it('treats blank optional cells as empty', async () => {
    const c = await draft();
    expect((await post(`/v1/rate-cards/${c.id}/rules`, { ...rule, multiplier: '', minimumCharge: '', timeBandCode: '' })).status).toBe(201);
  });
  it('blocks read-only users from editing', async () => {
    const c = await draft();
    expect((await post(`/v1/rate-cards/${c.id}/rules`, rule, 'ro@example.com')).status).toBe(403);
  });
});
