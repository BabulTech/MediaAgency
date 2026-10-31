import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { IdentityProvider } from '../src/auth';
import { Db, openDb } from '../src/db';
import { auditLogs, mediaOrganizations, mediaOutlets, pricingSnapshots, tenants, users } from '../src/schema';

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
  app = await NestFactory.create(AppModule.forDb(db, identity, { uploadUrl: async (p) => `https://files.test/${p}`, downloadUrl: async (p) => `https://files.test/${p}` }), { logger: false });
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
    const pc = await (await post('/v1/customers', { name: 'Portal seed' })).json();
    await post('/v1/users', { email: 'cust@example.com', name: 'U', password: 'long-password-1', roleCodes: ['customer_portal'], customerId: pc.id });
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
  it('expires a published card and removes it from pricing', async () => {
    const c = await draft();
    await post(`/v1/rate-cards/${c.id}/rules`, rule);
    expect((await post(`/v1/rate-cards/${c.id}/expire`, {})).status).toBe(409);
    await post(`/v1/rate-cards/${c.id}/publish`, {});
    expect((await (await post(`/v1/rate-cards/${c.id}/expire`, {})).json()).status).toBe('expired');
  });
  it('blocks read-only users from editing', async () => {
    const c = await draft();
    expect((await post(`/v1/rate-cards/${c.id}/rules`, rule, 'ro@example.com')).status).toBe(403);
  });
});

describe('customers and campaigns', () => {
  const mk = (name: string, t = token) => post('/v1/customers', { name, phone: '', email: '' }, t);
  it('numbers customers uniquely even when concurrent', async () => {
    const rows = await Promise.all(['A', 'B', 'C'].map((n) => mk(n).then((r) => r.json())));
    expect(new Set(rows.map((r) => r.number)).size).toBe(3);
  });
  it('searches literally', async () => {
    await mk('Lahore Foods');
    const found = await (await fetch(`${url}/v1/customers?q=lahore`, { headers: headers(token) })).json();
    expect(found.length).toBe(1);
    expect(await (await fetch(`${url}/v1/customers?q=%25`, { headers: headers(token) })).json()).toEqual([]);
  });
  it('rejects a campaign ending before it starts', async () => {
    const c = await (await mk('D')).json();
    expect((await post('/v1/campaigns', { customerId: c.id, name: 'X', startDate: '2027-02-01', endDate: '2027-01-01' })).status).toBe(400);
    expect((await post('/v1/campaigns', { customerId: c.id, name: 'X', startDate: '2027-01-01', endDate: '2027-02-01' })).status).toBe(201);
    const d = await (await fetch(`${url}/v1/customers/${c.id}`, { headers: headers(token) })).json();
    expect(d.campaigns.length).toBe(1);
  });
  it('lets read-only users view but not change', async () => {
    expect((await fetch(`${url}/v1/customers`, { headers: headers('ro@example.com') })).status).toBe(200);
    expect((await mk('No', 'ro@example.com')).status).toBe(403);
  });
});

describe('quotations and orders', () => {
  const go = (id: string, step: string, t = token) => post(`/v1/quotations/${id}/${step}`, {}, t);
  const setup = async (discountPercent = 0) => {
    const cust = await (await post('/v1/customers', { name: 'Q' })).json();
    const q = await (await post('/v1/quotations', { customerId: cust.id, validUntil: '2026-12-31' })).json();
    const o = await outlet('SAMPLE-TV');
    const res = await post(`/v1/quotations/${q.id}/lines`, { outletId: o.id, formatCode: 'tvc', date: '2026-11-02', timeBandCode: 'special', discountPercent, quantity: { durationSeconds: 30, spots: 5 } });
    return { q, line: await res.json(), status: res.status };
  };
  it('prices lines on the server and totals the quotation', async () => {
    const { q, line } = await setup();
    expect(line.snapshot.breakdown.total).toBe('675000.00');
    const d = await (await fetch(`${url}/v1/quotations/${q.id}`, { headers: headers(token) })).json();
    expect(d.quotation.total).toBe('675000.0000');
  });
  it('requires approval above the discount limit', async () => {
    const { q } = await setup(20);
    expect((await (await go(q.id, 'submit')).json()).status).toBe('pending_approval');
    expect((await go(q.id, 'send')).status).toBe(409);
    expect((await go(q.id, 'approve', 'ro@example.com')).status).toBe(403);
    expect((await (await go(q.id, 'approve')).json()).status).toBe('approved');
  });
  it('turns acceptance into exactly one order with frozen prices', async () => {
    const { q } = await setup();
    await go(q.id, 'submit'); await go(q.id, 'send');
    const [a, b] = await Promise.all([go(q.id, 'accept'), go(q.id, 'accept')]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const o = await (a.status === 201 ? a : b).json();
    const d = await (await fetch(`${url}/v1/orders/${o.id}`, { headers: headers(token) })).json();
    expect(d.placements.length).toBe(1);
    expect(d.placements[0].placement.net).toBe('675000.0000');
    expect((await post(`/v1/orders/${o.id}/cancel`, {})).status).toBe(201);
    expect((await post(`/v1/orders/${o.id}/cancel`, {})).status).toBe(409);
  });
  it('locks lines after submission and refuses unpriced lines', async () => {
    const { q } = await setup();
    await go(q.id, 'submit');
    const o = await outlet('SAMPLE-TV');
    expect((await post(`/v1/quotations/${q.id}/lines`, { outletId: o.id, formatCode: 'tvc', date: '2026-11-02', quantity: {} })).status).toBe(409);
    const fresh = await (await post('/v1/quotations', { customerId: q.customerId, validUntil: '2026-12-31' })).json();
    expect((await post(`/v1/quotations/${fresh.id}/lines`, { outletId: o.id, formatCode: 'ticker', date: '2026-11-02', quantity: {} })).status).toBe(422);
  });
});

describe('operations', () => {
  const placement = async () => {
    const cust = await (await post('/v1/customers', { name: 'Ops' })).json();
    const q = await (await post('/v1/quotations', { customerId: cust.id, validUntil: '2026-12-31' })).json();
    const o = await outlet('SAMPLE-TV');
    await post(`/v1/quotations/${q.id}/lines`, { outletId: o.id, formatCode: 'tvc', date: '2026-11-02', quantity: { durationSeconds: 30, spots: 1 } });
    for (const step of ['submit', 'send']) await post(`/v1/quotations/${q.id}/${step}`, {});
    const order = await (await post(`/v1/quotations/${q.id}/accept`, {})).json();
    const d = await (await fetch(`${url}/v1/orders/${order.id}`, { headers: headers(token) })).json();
    return { id: d.placements[0].placement.id as string, orderId: order.id as string };
  };
  const detail = async (id: string) => (await fetch(`${url}/v1/placements/${id}`, { headers: headers(token) })).json();
  const status = (id: string, s: string) => post(`/v1/bookings/${id}/status`, { status: s });
  const proof = async (id: string) => {
    const { path } = await (await post(`/v1/placements/${id}/upload-url`, { fileName: 'proof.jpg' })).json();
    return (await post(`/v1/placements/${id}/proofs`, { path, fileName: 'proof.jpg', kind: 'publication', actualDate: '2026-11-02' })).json();
  };

  it('allows one live booking but a retry after rejection', async () => {
    const { id } = await placement();
    const b = await (await post(`/v1/placements/${id}/bookings`, {})).json();
    expect(b.status).toBe('submitted');
    expect(b.purchasePrice).toBe('36000.0000');
    expect((await post(`/v1/placements/${id}/bookings`, {})).status).toBe(409);
    await status(b.id, 'rejected');
    expect((await post(`/v1/placements/${id}/bookings`, {})).status).toBe(201);
  });
  it('refuses illegal booking moves', async () => {
    const { id } = await placement();
    const b = await (await post(`/v1/placements/${id}/bookings`, {})).json();
    expect((await status(b.id, 'executed')).status).toBe(409);
    expect((await status(b.id, 'nonsense')).status).toBe(400);
  });
  it('verifies only through reviewed proof after execution', async () => {
    const { id } = await placement();
    const b = await (await post(`/v1/placements/${id}/bookings`, {})).json();
    await status(b.id, 'confirmed');
    expect((await detail(id)).placement.status).toBe('booked');
    const early = await proof(id);
    expect((await post(`/v1/proofs/${early.id}/review`, { approved: true })).status).toBe(409);
    await status(b.id, 'executed');
    expect((await post(`/v1/proofs/${early.id}/review`, { approved: true })).status).toBe(201);
    expect((await detail(id)).placement.status).toBe('verified');
  });
  it('versions artwork and rejects foreign file paths', async () => {
    const { id } = await placement();
    const up = async () => {
      const { path } = await (await post(`/v1/placements/${id}/upload-url`, { fileName: 'a b.png' })).json();
      return (await post(`/v1/placements/${id}/creatives`, { path, fileName: 'a b.png' })).json();
    };
    await up();
    expect((await up()).version).toBe(2);
    expect((await post(`/v1/placements/${id}/creatives`, { path: 'other/x/y.png', fileName: 'y' })).status).toBe(400);
    const dl = await fetch(`${url}/v1/files/download?path=other/x/y.png`, { headers: headers(token) });
    expect(dl.status).toBe(404);
  });
  it('refuses booking a cancelled order', async () => {
    const { id, orderId } = await placement();
    await post(`/v1/orders/${orderId}/cancel`, {});
    expect((await post(`/v1/placements/${id}/bookings`, {})).status).toBe(409);
  });
});

describe('finance', () => {
  const get = async (p: string) => (await fetch(url + p, { headers: headers(token) })).json();
  let seq = 0; const key = () => `key-${++seq}-abcdef`;
  const run = async () => {
    const cust = await (await post('/v1/customers', { name: 'Fin' })).json();
    const q = await (await post('/v1/quotations', { customerId: cust.id, validUntil: '2026-12-31' })).json();
    const o = await outlet('SAMPLE-TV');
    await post(`/v1/quotations/${q.id}/lines`, { outletId: o.id, formatCode: 'tvc', date: '2026-11-02', quantity: { durationSeconds: 10, spots: 1 } });
    for (const step of ['submit', 'send']) await post(`/v1/quotations/${q.id}/${step}`, {});
    const order = await (await post(`/v1/quotations/${q.id}/accept`, {})).json();
    const d = await get(`/v1/orders/${order.id}`);
    const placementId = d.placements[0].placement.id;
    const b = await (await post(`/v1/placements/${placementId}/bookings`, {})).json();
    await post(`/v1/bookings/${b.id}/status`, { status: 'confirmed' });
    return { customerId: cust.id, placementId, bookingId: b.id, orderId: order.id };
  };
  const invoice = (r: any, taxPercent = 0) => post('/v1/finance/invoices', { customerId: r.customerId, placementIds: [r.placementId], invoiceDate: '2026-11-03', dueDate: '2026-12-03', taxPercent });
  const ran = async () => { const r = await run(); await post(`/v1/bookings/${r.bookingId}/status`, { status: 'executed' }); return r; };

  it('invoices only run placements, and only once', async () => {
    const r = await run();
    expect((await invoice(r)).status).toBe(409);
    await post(`/v1/bookings/${r.bookingId}/status`, { status: 'executed' });
    const inv = await (await invoice(r, 10)).json();
    expect([inv.subtotal, inv.tax, inv.total]).toEqual(['15000.0000', '1500.0000', '16500.0000']);
    expect((await invoice(r)).status).toBe(409);
  });
  it('tracks partial payment, credit and blocks overpayment', async () => {
    const r = await ran();
    const inv = await (await invoice(r)).json();
    const pay = (amount: string, k = key()) => post('/v1/finance/payments', { customerId: r.customerId, amount, date: '2026-11-05', idempotencyKey: k, allocations: [{ invoiceId: inv.id, amount }] });
    expect((await pay('5000')).status).toBe(201);
    expect((await pay('10000.01')).status).toBe(409);
    expect((await post(`/v1/finance/invoices/${inv.id}/credit-notes`, { amount: '1000', reason: 'Adjustment' })).status).toBe(201);
    expect((await post(`/v1/finance/invoices/${inv.id}/credit-notes`, { amount: '9000.01', reason: 'Too much' })).status).toBe(409);
    const list = await get('/v1/finance/invoices');
    expect(list.find((i: any) => i.invoice.id === inv.id).balance).toBe('9000.00');
  });
  it('rolls back a failed payment and ignores a repeated request', async () => {
    const r = await ran();
    const inv = await (await invoice(r)).json();
    const k = key();
    const body = { customerId: r.customerId, amount: '100', date: '2026-11-05', idempotencyKey: k, allocations: [{ invoiceId: inv.id, amount: '100' }] };
    const [a, b] = [await (await post('/v1/finance/payments', body)).json(), await (await post('/v1/finance/payments', body)).json()];
    expect(a.id).toBe(b.id);
    const list = await get('/v1/finance/invoices');
    expect(list.find((i: any) => i.invoice.id === inv.id).balance).toBe('14900.00');
    const bad = await post('/v1/finance/payments', { ...body, idempotencyKey: key(), amount: '20000', allocations: [{ invoiceId: inv.id, amount: '20000' }] });
    expect(bad.status).toBe(409);
    expect((await get('/v1/finance/invoices')).find((i: any) => i.invoice.id === inv.id).balance).toBe('14900.00');
  });
  it('keeps unallocated money as an advance', async () => {
    const before = (await get('/v1/finance/summary')).advances;
    const r = await run();
    await post('/v1/finance/payments', { customerId: r.customerId, amount: '250', date: '2026-11-05', idempotencyKey: key() });
    expect(Number((await get('/v1/finance/summary')).advances) - Number(before)).toBe(250);
  });
  it('bills a booking once, pays it, and shows three margins', async () => {
    const r = await ran();
    const body = { supplierReference: 'S-1', bookingIds: [r.bookingId], billDate: '2026-11-04', dueDate: '2026-12-04', amount: '11000' };
    const bill = await (await post('/v1/finance/bills', body)).json();
    expect((await post('/v1/finance/bills', body)).status).toBe(409);
    expect((await post(`/v1/finance/bills/${bill.id}/payments`, { amount: '11000.01', date: '2026-11-05', idempotencyKey: key() })).status).toBe(409);
    expect((await post(`/v1/finance/bills/${bill.id}/payments`, { amount: '11000', date: '2026-11-05', idempotencyKey: key() })).status).toBe(201);
    const row = (await get('/v1/finance/profitability')).find((p: any) => p.id === r.placementId);
    expect([row.quotedMargin, row.committedMargin, row.actualMargin]).toEqual(['3000.00', '3000.00', '4000.00']);
  });
  it('cancelling cascades, but not once invoiced', async () => {
    const r = await run();
    await post(`/v1/orders/${r.orderId}/cancel`, {});
    expect((await get(`/v1/placements/${r.placementId}`)).bookings[0].status).toBe('cancelled');
    const i = await ran();
    await invoice(i);
    expect((await post(`/v1/orders/${i.orderId}/cancel`, {})).status).toBe(409);
  });
  it('hides finance from sales-free read-only users', async () => {
    expect((await fetch(`${url}/v1/finance/summary`, { headers: headers('ro@example.com') })).status).toBe(403);
  });
});

describe('reports and dashboard', () => {
  const get = async (p: string, t = token) => (await fetch(url + p, { headers: headers(t) })).json();
  it('agrees with placements and excludes cancelled orders', async () => {
    const before = await get('/v1/dashboard?from=2030-01-01&to=2030-12-31');
    expect(before.sales).toBe('0.00');
    const cust = await (await post('/v1/customers', { name: 'Report Co' })).json();
    const mk = async () => {
      const q = await (await post('/v1/quotations', { customerId: cust.id, validUntil: '2030-12-31' })).json();
      const o = await outlet('SAMPLE-TV');
      await post(`/v1/quotations/${q.id}/lines`, { outletId: o.id, formatCode: 'tvc', date: '2030-03-01', quantity: { durationSeconds: 10, spots: 1 } });
      for (const step of ['submit', 'send']) await post(`/v1/quotations/${q.id}/${step}`, {});
      return (await post(`/v1/quotations/${q.id}/accept`, {})).json();
    };
    await mk();
    const gone = await mk();
    await post(`/v1/orders/${gone.id}/cancel`, {});
    const d = await get('/v1/dashboard?from=2030-01-01&to=2030-12-31');
    expect([d.sales, d.placements, d.monthly[0].name]).toEqual(['15000.00', 1, '2030-03']);
    const rows = await get('/v1/reports/sales-by-customer?from=2030-01-01&to=2030-12-31');
    expect(rows).toEqual([{ name: 'Report Co', count: 1, total: '15000.00' }]);
    expect((await get('/v1/calendar?from=2030-03-01&to=2030-03-02')).length).toBe(1);
  });
  it('rejects bad dates and unknown reports', async () => {
    expect((await fetch(`${url}/v1/dashboard?from=nope`, { headers: headers(token) })).status).toBe(400);
    expect((await fetch(`${url}/v1/reports/nope`, { headers: headers(token) })).status).toBe(404);
  });
  it('alerts on a past-due unconfirmed placement', async () => {
    const a = await get('/v1/alerts');
    expect(a.some((x: any) => x.kind === 'unconfirmed_soon')).toBe(true);
  });
  it('keeps finance items away from non-finance users', async () => {
    const a = await get('/v1/alerts', 'ro@example.com');
    expect(a.some((x: any) => x.kind === 'invoice_overdue')).toBe(false);
  });
  it('keeps portal users out', async () => {
    expect((await fetch(`${url}/v1/dashboard`, { headers: headers('cust@example.com') })).status).toBe(403);
  });
});

describe('portals', () => {
  const get = (p: string, t: string) => fetch(url + p, { headers: headers(t) });
  const sell = async (name: string) => {
    const cust = await (await post('/v1/customers', { name })).json();
    const q = await (await post('/v1/quotations', { customerId: cust.id, validUntil: '2026-12-31' })).json();
    const o = await outlet('SAMPLE-TV');
    await post(`/v1/quotations/${q.id}/lines`, { outletId: o.id, formatCode: 'tvc', date: '2026-11-02', quantity: { durationSeconds: 10, spots: 1 } });
    for (const step of ['submit', 'send']) await post(`/v1/quotations/${q.id}/${step}`, {});
    return { cust, q, orgId: o.organizationId };
  };
  const account = (email: string, role: string, link: object) => post('/v1/users', { email, name: 'P', password: 'long-password-1', roleCodes: [role], ...link });

  it('requires a link for portal accounts', async () => {
    expect((await account('nolink@example.com', 'customer_portal', {})).status).toBe(400);
  });
  it('shows a customer only their own records, without costs', async () => {
    const a = await sell('Portal A'); const b = await sell('Portal B');
    await account('a@portal.test', 'customer_portal', { customerId: a.cust.id });
    const view = await get('/v1/portal/customer', 'a@portal.test');
    const text = await view.text();
    expect(JSON.parse(text).quotations.map((q: any) => q.id)).toEqual([a.q.id]);
    expect(text).not.toMatch(/supplierCost|snapshot/);
    expect((await post(`/v1/portal/customer/quotations/${b.q.id}/accept`, {}, 'a@portal.test')).status).toBe(404);
    expect((await post(`/v1/portal/customer/quotations/${a.q.id}/accept`, {}, 'a@portal.test')).status).toBe(201);
    expect((await get('/v1/customers', 'a@portal.test')).status).toBe(403);
  });
  it('limits a supplier to its own bookings and hides selling prices', async () => {
    const { q, orgId } = await sell('Portal C');
    const order = await (await post(`/v1/quotations/${q.id}/accept`, {})).json();
    const d = await (await get(`/v1/orders/${order.id}`, token)).json();
    const b = await (await post(`/v1/placements/${d.placements[0].placement.id}/bookings`, {})).json();
    await account('s@portal.test', 'supplier_portal', { organizationId: orgId });
    const other = await (await db.insert(mediaOrganizations).values({ tenantId: (await outlet('SAMPLE-TV')).tenantId, code: 'OTHER-ORG', name: 'Other' }).returning())[0];
    await account('s2@portal.test', 'supplier_portal', { organizationId: other.id });
    const text = await (await get('/v1/portal/supplier/bookings', 's@portal.test')).text();
    expect(text).toContain(b.number); expect(text).not.toMatch(/snapshot|"net"/);
    expect(await (await get('/v1/portal/supplier/bookings', 's2@portal.test')).json()).toEqual([]);
    const url2 = `/v1/portal/supplier/bookings/${b.id}/respond`;
    expect((await post(url2, { status: 'confirmed' }, 's2@portal.test')).status).toBe(404);
    expect((await post(url2, { status: 'executed' }, 's@portal.test')).status).toBe(400);
    expect((await post(url2, { status: 'confirmed' }, 's@portal.test')).status).toBe(201);
  });
});

describe('documents', () => {
  const get = (p: string, t = token) => fetch(url + p, { headers: headers(t) });
  it('hides each side\'s price and respects ownership', async () => {
    const cust = await (await post('/v1/customers', { name: 'Doc Co' })).json();
    const q = await (await post('/v1/quotations', { customerId: cust.id, validUntil: '2026-12-31' })).json();
    const o = await outlet('SAMPLE-TV');
    await post(`/v1/quotations/${q.id}/lines`, { outletId: o.id, formatCode: 'tvc', date: '2026-11-02', quantity: { durationSeconds: 10, spots: 1 } });
    const quote = await (await get(`/v1/quotations/${q.id}/document`)).text();
    expect(quote).toContain('15000'); expect(quote).not.toMatch(/12000|supplier/i);
    for (const step of ['submit', 'send']) await post(`/v1/quotations/${q.id}/${step}`, {});
    const order = await (await post(`/v1/quotations/${q.id}/accept`, {})).json();
    const placementId = (await (await get(`/v1/orders/${order.id}`)).json()).placements[0].placement.id;
    const b = await (await post(`/v1/placements/${placementId}/bookings`, {})).json();
    const booking = await (await get(`/v1/bookings/${b.id}/document`)).json();
    expect(booking.total).toBe('12000.0000'); expect(JSON.stringify(booking)).not.toContain('15000');
    await post(`/v1/bookings/${b.id}/status`, { status: 'confirmed' });
    await post(`/v1/bookings/${b.id}/status`, { status: 'executed' });
    const inv = await (await post('/v1/finance/invoices', { customerId: cust.id, placementIds: [placementId], invoiceDate: '2026-11-03', dueDate: '2026-12-03' })).json();
    expect((await (await get(`/v1/finance/invoices/${inv.id}/document`)).json()).balance).toBe('15000.00');
    expect((await get(`/v1/portal/customer/invoices/${inv.id}/document`, 'cust@example.com')).status).toBe(404);
    expect((await get(`/v1/finance/invoices/${inv.id}/document`, 'ro@example.com')).status).toBe(403);
  });
});

describe('report catalogue and imports', () => {
  const get = (p: string, t = token) => fetch(url + p, { headers: headers(t) });
  it('runs all 30+ reports without error', async () => {
    const list = await (await get('/v1/reports')).json();
    expect(list.length).toBeGreaterThanOrEqual(30);
    for (const r of list) expect([r.name, (await get(`/v1/reports/${r.name}`)).status]).toEqual([r.name, 200]);
  });
  it('blocks finance reports by permission on the server', async () => {
    expect((await get('/v1/reports/gross-profit', 'ro@example.com')).status).toBe(403);
    const list = await (await get('/v1/reports', 'ro@example.com')).json();
    expect(list.some((r: any) => r.name === 'gross-profit')).toBe(false);
  });
  it('previews, then imports all or nothing, and catches duplicates', async () => {
    const rows = [{ name: 'Imported One', phone: '', email: '' }, { name: 'Imported Two', type: 'ngo' }];
    const dry = await (await post('/v1/import/customers', { rows })).json();
    expect(dry).toMatchObject({ valid: 2, imported: 0 });
    expect((await (await get('/v1/customers?q=Imported')).json()).length).toBe(0);
    const bad = [...rows, { name: 'imported one' }, { name: 'X', email: 'nope' }];
    const preview = await (await post('/v1/import/customers', { rows: bad })).json();
    expect(preview.errors.map((e: any) => e.row)).toEqual([3, 4]);
    expect((await post('/v1/import/customers', { rows: bad, dryRun: false })).status).toBe(400);
    expect((await (await get('/v1/customers?q=Imported')).json()).length).toBe(0);
    expect((await (await post('/v1/import/customers', { rows, dryRun: false })).json()).imported).toBe(2);
    expect((await (await post('/v1/import/customers', { rows })).json()).errors.length).toBe(2);
  });
  it('imports outlets by code', async () => {
    const res = await post('/v1/import/outlets', { dryRun: false, rows: [{ code: 'IMP-1', name: 'Imported Paper', categoryCode: 'newspaper', organizationCode: 'SAMPLE' }] });
    expect((await res.json()).imported).toBe(1);
    expect((await (await post('/v1/import/outlets', { rows: [{ code: 'IMP-2', name: 'X', categoryCode: 'nope', organizationCode: 'SAMPLE' }] })).json()).errors[0].message).toContain('Unknown category');
  });
  it('stops read-only users importing', async () => {
    expect((await post('/v1/import/customers', { rows: [{ name: 'N' }] }, 'ro@example.com')).status).toBe(403);
  });
});

describe('other media', () => {
  it('quotes a CPM digital placement end to end', async () => {
    const cats = await (await fetch(`${url}/v1/categories`, { headers: headers(token) })).json();
    const o = await outlet('SAMPLE-TV');
    const digital = cats.find((c: any) => c.code === 'digital');
    const site = await (await post('/v1/outlets', { organizationId: o.organizationId, categoryId: digital.id, code: 'WEB-1', name: 'Sample Site' })).json();
    const card = await (await post('/v1/rate-cards', { outletId: site.id, name: 'Web', kind: 'selling', effectiveFrom: '2026-01-01' })).json();
    await post(`/v1/rate-cards/${card.id}/rules`, { formatCode: 'website_banner', unit: 'per_cpm', rate: '200' });
    await post(`/v1/rate-cards/${card.id}/publish`, {});
    const res = await post('/v1/pricing/calculate', { outletId: site.id, formatCode: 'website_banner', date: '2026-11-02', quantity: { impressions: 150000 } });
    expect((await res.json()).breakdown.total).toBe('30000.00');
  });
});
