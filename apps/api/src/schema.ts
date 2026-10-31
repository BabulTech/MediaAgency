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
  previousVersionId: uuid('previous_version_id'),
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
  id: id(), tenantId: tenantId(), authId: uuid('auth_id').unique(), email: text('email').notNull().unique(), name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
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

export const counters = pgTable('counters', {
  tenantId: tenantId(), key: text('key').notNull(), value: integer('value').notNull(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.key] })]);

export const customers = pgTable('customers', {
  id: id(), tenantId: tenantId(), number: text('number').notNull(), name: text('name').notNull(), legalName: text('legal_name'),
  type: text('type').notNull().default('corporate'), ntn: text('ntn'), strn: text('strn'), phone: text('phone'), email: text('email'),
  address: text('address'), city: text('city'), province: text('province'), industry: text('industry'),
  salesOwnerId: uuid('sales_owner_id').references(() => users.id), creditLimit: money('credit_limit'), paymentTerms: text('payment_terms'),
  status: text('status').notNull().default('active'), notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.tenantId, t.number)]);

export const customerContacts = pgTable('customer_contacts', {
  id: id(), tenantId: tenantId(), customerId: uuid('customer_id').notNull().references(() => customers.id),
  name: text('name').notNull(), title: text('title'), phone: text('phone'), email: text('email'),
});

export const campaigns = pgTable('campaigns', {
  id: id(), tenantId: tenantId(), customerId: uuid('customer_id').notNull().references(() => customers.id),
  name: text('name').notNull(), objective: text('objective'), startDate: date('start_date').notNull(), endDate: date('end_date').notNull(),
  budget: money('budget'), ownerId: uuid('owner_id').references(() => users.id), status: text('status').notNull().default('planned'), description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const quotations = pgTable('quotations', {
  id: id(), tenantId: tenantId(), number: text('number').notNull(), customerId: uuid('customer_id').notNull().references(() => customers.id),
  campaignId: uuid('campaign_id').references(() => campaigns.id), status: text('status').notNull().default('draft'),
  validUntil: date('valid_until').notNull(), total: money('total').notNull().default('0'), createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.tenantId, t.number)]);

export const quotationLines = pgTable('quotation_lines', {
  id: id(), tenantId: tenantId(), quotationId: uuid('quotation_id').notNull().references(() => quotations.id),
  outletId: uuid('outlet_id').notNull().references(() => mediaOutlets.id), formatCode: text('format_code').notNull(), date: date('date').notNull(),
  request: jsonb('request').notNull(), snapshot: jsonb('snapshot').notNull(), discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).notNull().default('0'),
  net: money('net').notNull(), supplierCost: money('supplier_cost'),
});

export const orders = pgTable('orders', {
  id: id(), tenantId: tenantId(), number: text('number').notNull(), customerId: uuid('customer_id').notNull().references(() => customers.id),
  campaignId: uuid('campaign_id').references(() => campaigns.id), quotationId: uuid('quotation_id').references(() => quotations.id).unique(),
  status: text('status').notNull().default('confirmed'), total: money('total').notNull(), createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.tenantId, t.number)]);

export const placements = pgTable('placements', {
  id: id(), tenantId: tenantId(), orderId: uuid('order_id').notNull().references(() => orders.id),
  quotationLineId: uuid('quotation_line_id').references(() => quotationLines.id).unique(),
  outletId: uuid('outlet_id').notNull().references(() => mediaOutlets.id), formatCode: text('format_code').notNull(), date: date('date').notNull(),
  request: jsonb('request').notNull(), snapshot: jsonb('snapshot').notNull(), net: money('net').notNull(), supplierCost: money('supplier_cost'),
  status: text('status').notNull().default('pending'),
});

export const supplierBookings = pgTable('supplier_bookings', {
  id: id(), tenantId: tenantId(), number: text('number').notNull(), placementId: uuid('placement_id').notNull().references(() => placements.id),
  orderId: uuid('order_id').notNull().references(() => orders.id), outletId: uuid('outlet_id').notNull().references(() => mediaOutlets.id),
  status: text('status').notNull().default('submitted'), requestedDate: date('requested_date').notNull(), purchasePrice: money('purchase_price'), supplierReference: text('supplier_reference'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.tenantId, t.number)]);

export const creativeAssets = pgTable('creative_assets', {
  id: id(), tenantId: tenantId(), placementId: uuid('placement_id').notNull().references(() => placements.id),
  version: integer('version').notNull(), fileName: text('file_name').notNull(), storagePath: text('storage_path').notNull(),
  status: text('status').notNull().default('pending'), comment: text('comment'), uploadedBy: uuid('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.placementId, t.version)]);

export const executionProofs = pgTable('execution_proofs', {
  id: id(), tenantId: tenantId(), placementId: uuid('placement_id').notNull().references(() => placements.id),
  kind: text('kind').notNull(), fileName: text('file_name').notNull(), storagePath: text('storage_path').notNull(), actualDate: date('actual_date').notNull(), actualPage: text('actual_page'),
  status: text('status').notNull().default('uploaded'), comment: text('comment'), uploadedBy: uuid('uploaded_by').references(() => users.id), verifiedBy: uuid('verified_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
