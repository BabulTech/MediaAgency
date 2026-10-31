import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { sumMoney } from '@mamp/pricing';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { Perm } from './auth';
import { nextNumber } from './crm';
import { DB, Db } from './db';
import { priceRequest } from './pricing';
import * as s from './schema';

/** Default from docs/plan.md: discounts above this need sales.approve. */
const DISCOUNT_APPROVAL_PERCENT = 10;

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ code: 'VALIDATION', issues: r.error.issues });
  return r.data;
}
const uuid = (id: string) => parse(z.string().uuid(), id);
const num = z.number().nonnegative().optional();
const quotationDto = z.object({ customerId: z.string().uuid(), campaignId: z.string().uuid().nullish(), validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const lineDto = z.object({
  outletId: z.string().uuid(), formatCode: z.string().trim().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), timeBandCode: z.string().optional(),
  quantity: z.object({ widthCm: num, heightCm: num, columns: num, words: num, lines: num, insertions: num, durationSeconds: num, spots: num, periods: num }),
  premiumFixed: num, discountPercent: z.number().min(0).max(100).optional(),
});

@Controller('v1')
export class SalesController {
  constructor(@Inject(DB) private db: Db) {}

  private audit(tx: Pick<Db, 'insert'>, req: any, entity: string, recordId: string, action: string, newValue?: unknown) {
    return tx.insert(s.auditLogs).values({ tenantId: req.user.tenantId, entity, recordId, action, changedBy: req.user.id, newValue });
  }
  private async quotation(tenantId: string, id: string) {
    const [q] = await this.db.select().from(s.quotations).where(and(eq(s.quotations.id, uuid(id)), eq(s.quotations.tenantId, tenantId)));
    if (!q) throw new NotFoundException({ code: 'NOT_FOUND' });
    return q;
  }
  private lines(quotationId: string) {
    return this.db.select().from(s.quotationLines).where(eq(s.quotationLines.quotationId, quotationId));
  }
  /** Moves status atomically, so two simultaneous clicks cannot both succeed. */
  private async transition(req: any, id: string, from: string[], to: string) {
    return this.db.transaction(async (tx) => {
      const [q] = await tx.update(s.quotations).set({ status: to })
        .where(and(eq(s.quotations.id, uuid(id)), eq(s.quotations.tenantId, req.user.tenantId), inArray(s.quotations.status, from))).returning();
      if (!q) throw new ConflictException({ code: 'INVALID_STATUS' });
      await this.audit(tx, req, 'quotation', q.id, to);
      return q;
    });
  }

  @Perm('sales.read') @Get('quotations')
  quotations(@Req() req: any) {
    return this.db.select({ quotation: s.quotations, customerName: s.customers.name }).from(s.quotations)
      .innerJoin(s.customers, eq(s.quotations.customerId, s.customers.id))
      .where(eq(s.quotations.tenantId, req.user.tenantId)).orderBy(desc(s.quotations.createdAt)).limit(200);
  }

  @Perm('sales.read') @Get('quotations/:id')
  async getQuotation(@Req() req: any, @Param('id') id: string) {
    const quotation = await this.quotation(req.user.tenantId, id);
    return { quotation, lines: await this.lines(quotation.id) };
  }

  /** Customer-facing: never includes supplier cost. */
  @Perm('sales.read') @Get('quotations/:id/document')
  async quotationDocument(@Req() req: any, @Param('id') id: string) {
    const q = await this.quotation(req.user.tenantId, id);
    const [[tenant], [customer], rows] = await Promise.all([
      this.db.select().from(s.tenants).where(eq(s.tenants.id, q.tenantId)),
      this.db.select().from(s.customers).where(eq(s.customers.id, q.customerId)),
      this.db.select({ l: s.quotationLines, outletName: s.mediaOutlets.name }).from(s.quotationLines).innerJoin(s.mediaOutlets, eq(s.quotationLines.outletId, s.mediaOutlets.id)).where(eq(s.quotationLines.quotationId, q.id)),
    ]);
    return { agency: tenant.name, number: q.number, date: q.createdAt.toISOString().slice(0, 10), dueDate: q.validUntil, party: customer.name, status: q.status, total: q.total,
      lines: rows.map((r) => ({ description: `${r.outletName} · ${r.l.formatCode} · ${r.l.date}`, amount: r.l.net })) };
  }

  @Perm('sales.write') @Post('quotations')
  async create(@Req() req: any, @Body() body: unknown) {
    const dto = parse(quotationDto, body);
    const tenantId: string = req.user.tenantId;
    const [customer] = await this.db.select().from(s.customers).where(and(eq(s.customers.id, dto.customerId), eq(s.customers.tenantId, tenantId)));
    if (!customer) throw new NotFoundException({ code: 'NOT_FOUND' });
    if (dto.campaignId) {
      const [c] = await this.db.select().from(s.campaigns).where(and(eq(s.campaigns.id, dto.campaignId), eq(s.campaigns.customerId, customer.id)));
      if (!c) throw new NotFoundException({ code: 'NOT_FOUND' });
    }
    return this.db.transaction(async (tx) => {
      const n = await nextNumber(tx, tenantId, 'quotation');
      const [q] = await tx.insert(s.quotations).values({ ...dto, tenantId, number: `QUO-${new Date().getFullYear()}-${String(n).padStart(5, '0')}`, createdBy: req.user.id }).returning();
      await this.audit(tx, req, 'quotation', q.id, 'create', dto);
      return q;
    });
  }

  @Perm('sales.write') @Post('quotations/:id/lines')
  async addLine(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const q = await this.quotation(req.user.tenantId, id);
    if (q.status !== 'draft') throw new ConflictException({ code: 'NOT_DRAFT' });
    const dto = parse(lineDto, body);
    const snapshot = await priceRequest(this.db, q.tenantId, { ...dto, customerId: q.customerId });
    return this.db.transaction(async (tx) => {
      const [l] = await tx.insert(s.quotationLines).values({
        tenantId: q.tenantId, quotationId: q.id, outletId: dto.outletId, formatCode: dto.formatCode, date: dto.date, request: dto, snapshot,
        discountPercent: String(dto.discountPercent ?? 0), net: snapshot.breakdown.net, supplierCost: snapshot.breakdown.supplierCost,
      }).returning();
      await this.syncTotal(tx, q.id);
      await this.audit(tx, req, 'quotation', q.id, 'add_line', { lineId: l.id });
      return l;
    });
  }

  private async syncTotal(tx: Pick<Db, 'select' | 'update'>, quotationId: string) {
    const rows = await tx.select({ net: s.quotationLines.net }).from(s.quotationLines).where(eq(s.quotationLines.quotationId, quotationId));
    await tx.update(s.quotations).set({ total: sumMoney(rows.map((r) => r.net)) }).where(eq(s.quotations.id, quotationId));
  }

  @Perm('sales.write') @Delete('quotations/:id/lines/:lineId')
  async removeLine(@Req() req: any, @Param('id') id: string, @Param('lineId') lineId: string) {
    const q = await this.quotation(req.user.tenantId, id);
    if (q.status !== 'draft') throw new ConflictException({ code: 'NOT_DRAFT' });
    return this.db.transaction(async (tx) => {
      const gone = await tx.delete(s.quotationLines).where(and(eq(s.quotationLines.id, uuid(lineId)), eq(s.quotationLines.quotationId, q.id))).returning();
      if (!gone.length) throw new NotFoundException({ code: 'NOT_FOUND' });
      await this.syncTotal(tx, q.id);
      await this.audit(tx, req, 'quotation', q.id, 'remove_line', { lineId });
      return { removed: true };
    });
  }

  @Perm('sales.write') @Post('quotations/:id/submit')
  async submit(@Req() req: any, @Param('id') id: string) {
    const q = await this.quotation(req.user.tenantId, id);
    const lines = await this.lines(q.id);
    if (!lines.length) throw new ConflictException({ code: 'NO_LINES' });
    const needsApproval = lines.some((l) => Number(l.discountPercent) > DISCOUNT_APPROVAL_PERCENT);
    return this.transition(req, id, ['draft'], needsApproval ? 'pending_approval' : 'approved');
  }

  @Perm('sales.approve') @Post('quotations/:id/approve') approve(@Req() req: any, @Param('id') id: string) { return this.transition(req, id, ['pending_approval'], 'approved'); }
  @Perm('sales.write') @Post('quotations/:id/send') send(@Req() req: any, @Param('id') id: string) { return this.transition(req, id, ['approved'], 'sent'); }
  @Perm('sales.write') @Post('quotations/:id/reject') reject(@Req() req: any, @Param('id') id: string) { return this.transition(req, id, ['sent'], 'rejected'); }

  /** Acceptance creates the order. Placements copy the snapshot, so later rate changes cannot touch them. */
  @Perm('sales.write') @Post('quotations/:id/accept')
  async accept(@Req() req: any, @Param('id') id: string) {
    const q = await this.transition(req, id, ['sent'], 'accepted');
    const lines = await this.lines(q.id);
    return this.db.transaction(async (tx) => {
      const n = await nextNumber(tx, q.tenantId, 'order');
      const [order] = await tx.insert(s.orders).values({
        tenantId: q.tenantId, number: `MAMP-${new Date().getFullYear()}-${String(n).padStart(5, '0')}`, customerId: q.customerId,
        campaignId: q.campaignId, quotationId: q.id, total: q.total, createdBy: req.user.id,
      }).returning();
      await tx.insert(s.placements).values(lines.map((l) => ({
        tenantId: q.tenantId, orderId: order.id, quotationLineId: l.id, outletId: l.outletId, formatCode: l.formatCode, date: l.date,
        request: l.request, snapshot: l.snapshot, net: l.net, supplierCost: l.supplierCost,
      })));
      await this.audit(tx, req, 'order', order.id, 'create', { quotationId: q.id });
      return order;
    });
  }

  /** Portal views select fields by hand: supplier costs and rate snapshots must never reach a customer. */
  @Perm('portal.customer') @Get('portal/customer')
  async portalCustomer(@Req() req: any) {
    const { tenantId, customerId } = req.user;
    const mine = <T extends { tenantId: any; customerId: any }>(t: T) => and(eq(t.tenantId, tenantId), eq(t.customerId, customerId));
    const [quotations, orders, invoices] = await Promise.all([
      this.db.select({ id: s.quotations.id, number: s.quotations.number, status: s.quotations.status, total: s.quotations.total, validUntil: s.quotations.validUntil }).from(s.quotations)
        .where(and(mine(s.quotations), inArray(s.quotations.status, ['sent', 'accepted', 'rejected']))).orderBy(desc(s.quotations.createdAt)),
      this.db.select({ id: s.orders.id, number: s.orders.number, status: s.orders.status, total: s.orders.total }).from(s.orders).where(mine(s.orders)).orderBy(desc(s.orders.createdAt)),
      this.db.select({ id: s.customerInvoices.id, number: s.customerInvoices.number, dueDate: s.customerInvoices.dueDate, total: s.customerInvoices.total }).from(s.customerInvoices).where(mine(s.customerInvoices)),
    ]);
    const orderIds = orders.map((o) => o.id);
    const placements = orderIds.length ? await this.db.select({ id: s.placements.id, orderId: s.placements.orderId, formatCode: s.placements.formatCode, date: s.placements.date, status: s.placements.status }).from(s.placements).where(inArray(s.placements.orderId, orderIds)) : [];
    const ids = invoices.map((i) => i.id);
    const paid = ids.length ? await this.db.select({ invoiceId: s.customerPaymentAllocations.invoiceId, amount: s.customerPaymentAllocations.amount }).from(s.customerPaymentAllocations).where(inArray(s.customerPaymentAllocations.invoiceId, ids)) : [];
    const credits = ids.length ? await this.db.select({ invoiceId: s.customerCreditNotes.invoiceId, amount: s.customerCreditNotes.amount }).from(s.customerCreditNotes).where(inArray(s.customerCreditNotes.invoiceId, ids)) : [];
    return { quotations, orders, placements, invoices: invoices.map((i) => ({ ...i, balance: sumMoney([i.total, ...[...paid, ...credits].filter((x) => x.invoiceId === i.id).map((x) => `-${x.amount}`)]) })) };
  }

  private async ownQuotation(req: any, id: string) {
    const q = await this.quotation(req.user.tenantId, id);
    if (q.customerId !== req.user.customerId) throw new NotFoundException({ code: 'NOT_FOUND' });
  }
  @Perm('portal.customer') @Post('portal/customer/quotations/:id/accept')
  async portalAccept(@Req() req: any, @Param('id') id: string) { await this.ownQuotation(req, id); const o = await this.accept(req, id); return { id: o.id, number: o.number }; }
  @Perm('portal.customer') @Post('portal/customer/quotations/:id/reject')
  async portalReject(@Req() req: any, @Param('id') id: string) { await this.ownQuotation(req, id); const q = await this.reject(req, id); return { id: q.id, status: q.status }; }

  @Perm('sales.read') @Get('orders')
  orders(@Req() req: any) {
    return this.db.select({ order: s.orders, customerName: s.customers.name }).from(s.orders)
      .innerJoin(s.customers, eq(s.orders.customerId, s.customers.id))
      .where(eq(s.orders.tenantId, req.user.tenantId)).orderBy(desc(s.orders.createdAt)).limit(200);
  }

  @Perm('sales.read') @Get('orders/:id')
  async getOrder(@Req() req: any, @Param('id') id: string) {
    const [order] = await this.db.select().from(s.orders).where(and(eq(s.orders.id, uuid(id)), eq(s.orders.tenantId, req.user.tenantId)));
    if (!order) throw new NotFoundException({ code: 'NOT_FOUND' });
    const rows = await this.db.select({ placement: s.placements, outletName: s.mediaOutlets.name }).from(s.placements)
      .innerJoin(s.mediaOutlets, eq(s.placements.outletId, s.mediaOutlets.id)).where(eq(s.placements.orderId, order.id));
    return { order, placements: rows };
  }

  @Perm('sales.approve') @Post('orders/:id/cancel')
  async cancel(@Req() req: any, @Param('id') id: string) {
    return this.db.transaction(async (tx) => {
      const invoiced = await tx.select({ id: s.customerInvoiceLines.id }).from(s.customerInvoiceLines)
        .innerJoin(s.placements, eq(s.customerInvoiceLines.placementId, s.placements.id)).where(eq(s.placements.orderId, uuid(id)));
      if (invoiced.length) throw new ConflictException({ code: 'ALREADY_INVOICED' });
      const [o] = await tx.update(s.orders).set({ status: 'cancelled' })
        .where(and(eq(s.orders.id, uuid(id)), eq(s.orders.tenantId, req.user.tenantId), eq(s.orders.status, 'confirmed'))).returning();
      if (!o) throw new ConflictException({ code: 'INVALID_STATUS' });
      await tx.update(s.supplierBookings).set({ status: 'cancelled' })
        .where(and(eq(s.supplierBookings.orderId, o.id), inArray(s.supplierBookings.status, ['submitted', 'reschedule_requested', 'confirmed'])));
      await tx.update(s.placements).set({ status: 'cancelled' }).where(eq(s.placements.orderId, o.id));
      await this.audit(tx, req, 'order', o.id, 'cancel');
      return o;
    });
  }
}
