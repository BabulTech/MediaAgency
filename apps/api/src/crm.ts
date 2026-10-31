import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Perm } from './auth';
import { DB, Db } from './db';
import * as s from './schema';

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ code: 'VALIDATION', issues: r.error.issues });
  return r.data;
}
const uuid = (id: string) => parse(z.string().uuid(), id);
const blank = <T extends z.ZodTypeAny>(t: T) => z.preprocess((v) => (v === '' ? null : v), t.nullish()).transform((v) => v ?? null);
const text = (max = 200) => blank(z.string().trim().max(max));
const amount = blank(z.string().regex(/^\d+(\.\d{1,2})?$/));
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const CUSTOMER_TYPES = ['individual', 'corporate', 'government', 'public_sector', 'ngo', 'agency', 'other'] as const;
const customerDto = z.object({
  name: z.string().trim().min(1).max(200), legalName: text(), type: z.enum(CUSTOMER_TYPES).default('corporate'),
  ntn: text(40), strn: text(40), phone: text(40), email: blank(z.string().email()), address: text(500), city: text(100), province: text(100),
  industry: text(100), creditLimit: amount, paymentTerms: text(100), status: z.enum(['active', 'inactive']).default('active'), notes: text(2000),
});
const contactDto = z.object({ name: z.string().trim().min(1).max(200), title: text(100), phone: text(40), email: blank(z.string().email()) });
const campaignDto = z.object({
  customerId: z.string().uuid(), name: z.string().trim().min(1).max(200), objective: text(500), startDate: day, endDate: day,
  budget: amount, status: z.enum(['planned', 'active', 'completed', 'cancelled']).default('planned'), description: text(2000),
}).refine((c) => c.endDate >= c.startDate, { message: 'endDate before startDate', path: ['endDate'] });

/** Gap-safe per-tenant numbering: the upsert row lock serialises concurrent callers. */
export async function nextNumber(tx: Pick<Db, 'execute'>, tenantId: string, key: string) {
  const res = await tx.execute(sql`insert into counters (tenant_id, key, value) values (${tenantId}, ${key}, 1)
    on conflict (tenant_id, key) do update set value = counters.value + 1 returning value`);
  return Number((res.rows[0] as { value: number }).value);
}

@Controller('v1')
export class CrmController {
  constructor(@Inject(DB) private db: Db) {}

  private async customer(tenantId: string, id: string) {
    const [c] = await this.db.select().from(s.customers).where(and(eq(s.customers.id, uuid(id)), eq(s.customers.tenantId, tenantId)));
    if (!c) throw new NotFoundException({ code: 'NOT_FOUND' });
    return c;
  }
  private audit(tx: Pick<Db, 'insert'>, req: any, entity: string, recordId: string, action: string, newValue?: unknown) {
    return tx.insert(s.auditLogs).values({ tenantId: req.user.tenantId, entity, recordId, action, changedBy: req.user.id, newValue });
  }

  @Perm('sales.read') @Get('customers')
  customers(@Req() req: any, @Query('q') q?: string) {
    const like = `%${(q ?? '').replace(/[%_\\]/g, '\\$&')}%`;
    return this.db.select().from(s.customers)
      .where(and(eq(s.customers.tenantId, req.user.tenantId), q ? or(ilike(s.customers.name, like), ilike(s.customers.number, like)) : undefined))
      .orderBy(desc(s.customers.createdAt)).limit(200);
  }

  @Perm('sales.read') @Get('customers/:id')
  async getCustomer(@Req() req: any, @Param('id') id: string) {
    const customer = await this.customer(req.user.tenantId, id);
    const [contacts, campaigns] = await Promise.all([
      this.db.select().from(s.customerContacts).where(eq(s.customerContacts.customerId, customer.id)),
      this.db.select().from(s.campaigns).where(eq(s.campaigns.customerId, customer.id)),
    ]);
    return { customer, contacts, campaigns };
  }

  @Perm('sales.write') @Post('customers')
  async createCustomer(@Req() req: any, @Body() body: unknown) {
    const dto = parse(customerDto, body);
    const tenantId: string = req.user.tenantId;
    return this.db.transaction(async (tx) => {
      const n = await nextNumber(tx, tenantId, 'customer');
      const [c] = await tx.insert(s.customers).values({ ...dto, tenantId, number: `CUST-${String(n).padStart(5, '0')}`, salesOwnerId: req.user.id }).returning();
      await this.audit(tx, req, 'customer', c.id, 'create', dto);
      return c;
    });
  }

  @Perm('sales.write') @Patch('customers/:id')
  async updateCustomer(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const before = await this.customer(req.user.tenantId, id);
    const dto = parse(customerDto, body);
    return this.db.transaction(async (tx) => {
      const [c] = await tx.update(s.customers).set(dto).where(eq(s.customers.id, before.id)).returning();
      await this.audit(tx, req, 'customer', c.id, 'update', { before, after: dto });
      return c;
    });
  }

  @Perm('sales.write') @Post('customers/:id/contacts')
  async addContact(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const c = await this.customer(req.user.tenantId, id);
    const [row] = await this.db.insert(s.customerContacts).values({ ...parse(contactDto, body), tenantId: c.tenantId, customerId: c.id }).returning();
    return row;
  }

  @Perm('sales.read') @Get('campaigns')
  campaigns(@Req() req: any) {
    return this.db.select({ campaign: s.campaigns, customerName: s.customers.name }).from(s.campaigns)
      .innerJoin(s.customers, eq(s.campaigns.customerId, s.customers.id))
      .where(eq(s.campaigns.tenantId, req.user.tenantId)).orderBy(desc(s.campaigns.startDate)).limit(200);
  }

  @Perm('sales.write') @Post('campaigns')
  async createCampaign(@Req() req: any, @Body() body: unknown) {
    const dto = parse(campaignDto, body);
    await this.customer(req.user.tenantId, dto.customerId);
    return this.db.transaction(async (tx) => {
      const [c] = await tx.insert(s.campaigns).values({ ...dto, tenantId: req.user.tenantId, ownerId: req.user.id }).returning();
      await this.audit(tx, req, 'campaign', c.id, 'create', dto);
      return c;
    });
  }
}
