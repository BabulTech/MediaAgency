import { boolean, date, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const money = (name: string) => numeric(name, { precision: 18, scale: 4 });

export const tenants = pgTable('tenants', { id: id(), name: text('name').notNull() });

export const mediaCategories = pgTable('media_categories', {
  id: id(), tenantId: tenantId(), code: text('code').notNull(), name: text('name').notNull(),
}, (t) => [unique().on(t.tenantId, t.code)]);

export const mediaOrganizations = pgTable('media_organizations', {
  id: id(), tenantId: tenantId(), code: text('code').notNull(), name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
}, (t) => [unique().on(t.tenantId, t.code)]);

export const mediaOutlets = pgTable('media_outlets', {
  id: id(), tenantId: tenantId(),
  organizationId: uuid('organization_id').notNull().references(() => mediaOrganizations.id),
  categoryId: uuid('category_id').notNull().references(() => mediaCategories.id),
  code: text('code').notNull(), name: text('name').notNull(), language: text('language').notNull().default('en'),
  // Newspaper page geometry varies by title, so it belongs to the outlet.
  pageWidthCm: numeric('page_width_cm', { precision: 8, scale: 2 }),
  pageHeightCm: numeric('page_height_cm', { precision: 8, scale: 2 }),
  columns: integer('columns'),
  active: boolean('active').notNull().default(true),
}, (t) => [unique().on(t.tenantId, t.code)]);

export const rateCards = pgTable('rate_cards', {
  id: id(), tenantId: tenantId(), outletId: uuid('outlet_id').notNull().references(() => mediaOutlets.id),
  name: text('name').notNull(), kind: text('kind').notNull(), currency: text('currency').notNull().default('PKR'),
  effectiveFrom: date('effective_from').notNull(), effectiveTo: date('effective_to'),
  status: text('status').notNull().default('draft'), version: integer('version').notNull().default(1),
  isSample: boolean('is_sample').notNull().default(false),
});

export const rateRules = pgTable('rate_rules', {
  id: id(), tenantId: tenantId(), rateCardId: uuid('rate_card_id').notNull().references(() => rateCards.id),
  formatCode: text('format_code'), editionCode: text('edition_code'), timeBandCode: text('time_band_code'),
  daysOfWeek: jsonb('days_of_week').$type<number[]>(), customerId: uuid('customer_id'),
  priority: integer('priority').notNull().default(0), unit: text('unit').notNull(), rate: money('rate').notNull(),
  multiplier: money('multiplier'), minimumCharge: money('minimum_charge'),
});

export const pricingSnapshots = pgTable('pricing_snapshots', {
  id: id(), tenantId: tenantId(), request: jsonb('request').notNull(), result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: id(), tenantId: tenantId(), entity: text('entity').notNull(), recordId: uuid('record_id').notNull(),
  action: text('action').notNull(), newValue: jsonb('new_value'), changedBy: uuid('changed_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: id(), tenantId: tenantId(), email: text('email').notNull().unique(), name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(), active: boolean('active').notNull().default(true),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable('roles', {
  id: id(), tenantId: tenantId(), code: text('code').notNull(), name: text('name').notNull(),
}, (t) => [unique().on(t.tenantId, t.code)]);

export const rolePermissions = pgTable('role_permissions', {
  roleId: uuid('role_id').notNull().references(() => roles.id), permission: text('permission').notNull(),
}, (t) => [primaryKey({ columns: [t.roleId, t.permission] })]);

export const userRoles = pgTable('user_roles', {
  userId: uuid('user_id').notNull().references(() => users.id), roleId: uuid('role_id').notNull().references(() => roles.id),
}, (t) => [primaryKey({ columns: [t.userId, t.roleId] })]);

export const userSessions = pgTable('user_sessions', {
  id: id(), userId: uuid('user_id').notNull().references(() => users.id), tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
