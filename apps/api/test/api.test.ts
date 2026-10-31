import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { Db, openDb } from '../src/db';
import { auditLogs, mediaOutlets, pricingSnapshots, tenants } from '../src/schema';

let app: INestApplication; let url: string; let db: Db;
let cookie = '';
const post = (p: string, body: unknown, c = cookie) => fetch(url + p, { method: 'POST', headers: { 'content-type': 'application/json', cookie: c }, body: JSON.stringify(body) });
const login = async (email: string, password: string) => {
  const res = await post('/v1/auth/login', { email, password }, '');
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
};

beforeAll(async () => {
  process.env.SEED_ADMIN_PASSWORD = 'test-password-1';
  db = await openDb({ memory: true });
  app = await NestFactory.create(AppModule.forDb(db), { logger: false });
  await app.listen(0, '127.0.0.1');
  url = (await app.getUrl()).replace('[::1]', 'localhost');
  cookie = await login('admin@example.com', 'test-password-1');
}, 30000);
afterAll(() => app.close());

const outlet = async (code: string) => ((await (await fetch(`${url}/v1/outlets`, { headers: { cookie } })).json()) as any[]).find((o) => o.code === code);

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
  const get = (p: string, c: string) => fetch(url + p, { headers: { cookie: c } });

  it('refuses anonymous requests', async () => {
    expect((await get('/v1/outlets', '')).status).toBe(401);
  });
  it('enforces permissions on the server', async () => {
    await user('ro@example.com', ['read_only']);
    const c = await login('ro@example.com', 'long-password-1');
    expect((await get('/v1/outlets', c)).status).toBe(200);
    expect((await get('/v1/users', c)).status).toBe(403);
    expect((await post('/v1/users', {}, c)).status).toBe(403);
    expect((await post('/v1/outlets', {}, c)).status).toBe(403);
  });
  it('gives portal users nothing internal', async () => {
    await user('cust@example.com', ['customer_portal']);
    expect((await get('/v1/outlets', await login('cust@example.com', 'long-password-1'))).status).toBe(403);
  });
  it('locks after five failures, without revealing it to wrong-password probes first', async () => {
    await user('lock@example.com', ['read_only']);
    for (let i = 0; i < 5; i++) expect((await post('/v1/auth/login', { email: 'lock@example.com', password: 'nope' }, '')).status).toBe(401);
    expect((await post('/v1/auth/login', { email: 'lock@example.com', password: 'long-password-1' }, '')).status).toBe(423);
  });
  it('revokes sessions on deactivate and on logout', async () => {
    const created = await (await user('gone@example.com', ['read_only'])).json();
    const c = await login('gone@example.com', 'long-password-1');
    await fetch(`${url}/v1/users/${created.id}/active`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ active: false }) });
    expect((await get('/v1/auth/me', c)).status).toBe(401);
    const c2 = await login('ro@example.com', 'long-password-1');
    await post('/v1/auth/logout', {}, c2);
    expect((await get('/v1/auth/me', c2)).status).toBe(401);
  });
  it('hides other tenants records', async () => {
    const [other] = await db.insert(tenants).values({ name: 'Other' }).returning();
    const o = await outlet('SAMPLE-TV');
    await db.insert(mediaOutlets).values({ tenantId: other.id, organizationId: o.organizationId, categoryId: o.categoryId, code: 'OTHER', name: 'Other' });
    expect(await outlet('OTHER')).toBeUndefined();
  });
});
