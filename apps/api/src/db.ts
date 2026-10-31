import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { and, eq } from 'drizzle-orm';
import * as s from './schema';

export const DB = Symbol('DB');
export type Db = ReturnType<typeof drizzlePglite<typeof s>>;

const migrationsFolder = join(__dirname, '..', 'drizzle');

export async function openDb(opts: { memory?: boolean } = {}): Promise<Db> {
  if (process.env.DATABASE_URL && !opts.memory) {
    const db = drizzlePg(new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : undefined }), { schema: s });
    await migratePg(db, { migrationsFolder });
    await seed(db as unknown as Db);
    return db as unknown as Db;
  }
  let dataDir: string | undefined;
  if (!opts.memory) { dataDir = join(__dirname, '..', '.data'); mkdirSync(dataDir, { recursive: true }); }
  const db = drizzlePglite(new PGlite(dataDir), { schema: s });
  await migratePglite(db, { migrationsFolder });
  await seed(db);
  return db;
}

/** SAMPLE data for development only. These rates are invented and belong to no real outlet. */
async function seed(db: Db) {
  if ((await db.select().from(s.tenants).limit(1)).length) return seedAccess(db);
  const [tenant] = await db.insert(s.tenants).values({ name: 'Demo Agency' }).returning();
  const tenantId = tenant.id;
  const cats = await db.insert(s.mediaCategories).values([
    { tenantId, code: 'newspaper', name: 'Newspapers' }, { tenantId, code: 'tv', name: 'Television Channels' },
  ]).returning();
  const [org] = await db.insert(s.mediaOrganizations).values({ tenantId, code: 'SAMPLE', name: 'Sample Media Group' }).returning();
  const cat = (code: string) => cats.find((c) => c.code === code)!.id;
  const [paper, tv] = await db.insert(s.mediaOutlets).values([
    { tenantId, organizationId: org.id, categoryId: cat('newspaper'), code: 'SAMPLE-DAILY', name: 'Sample Daily', pageWidthCm: '33', pageHeightCm: '54', columns: 8 },
    { tenantId, organizationId: org.id, categoryId: cat('tv'), code: 'SAMPLE-TV', name: 'Sample News TV' },
  ]).returning();
  const card = async (outletId: string, kind: string, name: string) => (await db.insert(s.rateCards).values({
    tenantId, outletId, kind, name, effectiveFrom: '2026-01-01', status: 'published', isSample: true,
  }).returning())[0].id;
  const paperSell = await card(paper.id, 'selling', 'Sample Daily selling (sample rates)');
  const paperBuy = await card(paper.id, 'supplier', 'Sample Daily purchase (sample rates)');
  const tvSell = await card(tv.id, 'selling', 'Sample News TV selling (sample rates)');
  const tvBuy = await card(tv.id, 'supplier', 'Sample News TV purchase (sample rates)');
  await db.insert(s.rateRules).values([
    { tenantId, rateCardId: paperSell, formatCode: 'display', unit: 'per_sq_cm', rate: '250' },
    { tenantId, rateCardId: paperBuy, formatCode: 'display', unit: 'per_sq_cm', rate: '200' },
    { tenantId, rateCardId: tvSell, formatCode: 'tvc', unit: 'per_second', rate: '1500' },
    { tenantId, rateCardId: tvSell, formatCode: 'tvc', timeBandCode: 'special', unit: 'per_second', rate: '1500', multiplier: '3' },
    { tenantId, rateCardId: tvBuy, formatCode: 'tvc', unit: 'per_second', rate: '1200' },
  ]);
  await seedAccess(db);
}

const READ = ['media.read', 'ratecards.read', 'sales.read'];
const PRICE = [...READ, 'pricing.calculate'];
const MANAGE = [...PRICE, 'media.write', 'ratecards.write'];
const ADMIN = [...MANAGE, 'sales.write', 'ratecards.approve', 'users.read', 'users.write', 'audit.read'];
export const DEFAULT_ROLES: [string, string, string[]][] = [
  ['super_admin', 'Super Administrator', ADMIN], ['agency_admin', 'Agency Administrator', ADMIN],
  ['director', 'Chief Executive / Director', [...PRICE, 'users.read', 'audit.read']],
  ['sales_manager', 'Sales Manager', [...PRICE, 'sales.write']], ['sales_executive', 'Sales Executive', [...PRICE, 'sales.write']],
  ['booking_manager', 'Booking Manager', MANAGE], ['newspaper_booking', 'Newspaper Booking Officer', PRICE],
  ['broadcast_booking', 'TV/Radio Booking Officer', PRICE], ['creative_manager', 'Creative/Artwork Manager', READ],
  ['finance_manager', 'Finance Manager', PRICE], ['accountant', 'Accountant', PRICE],
  ['operations', 'Operations Executive', READ], ['read_only', 'Reporting/Read-Only User', READ],
  ['customer_portal', 'Customer Portal User', []], ['supplier_portal', 'Media Supplier Portal User', []],
];

/** Adds default roles and the first administrator to a tenant that has none. */
async function seedAccess(db: Db) {
  const [tenant] = await db.select().from(s.tenants).limit(1);
  if ((await db.select().from(s.roles).where(eq(s.roles.tenantId, tenant.id)).limit(1)).length) return;
  let adminRole = '';
  for (const [code, name, permissions] of DEFAULT_ROLES) {
    const [role] = await db.insert(s.roles).values({ tenantId: tenant.id, code, name }).returning();
    if (code === 'super_admin') adminRole = role.id;
    if (permissions.length) await db.insert(s.rolePermissions).values(permissions.map((permission) => ({ roleId: role.id, permission })));
  }
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const [admin] = await db.insert(s.users).values({ tenantId: tenant.id, email, name: 'Administrator' }).returning();
  await db.insert(s.userRoles).values({ userId: admin.id, roleId: adminRole });
}

export const rulesForOutlet = (db: Db, tenantId: string, outletId: string) =>
  db.select({ rule: s.rateRules, card: s.rateCards }).from(s.rateRules)
    .innerJoin(s.rateCards, eq(s.rateRules.rateCardId, s.rateCards.id))
    .where(and(eq(s.rateCards.tenantId, tenantId), eq(s.rateCards.outletId, outletId)));
