import { BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { cmpMoney, priceLine, sumMoney } from '@mamp/pricing';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { Perm } from './auth';
import { nextNumber } from './crm';
import { DB, Db } from './db';
import * as s from './schema';

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ code: 'VALIDATION', issues: r.error.issues });
  return r.data;
}
const uuid = (id: string) => parse(z.string().uuid(), id);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const positive = z.string().regex(/^\d+(\.\d{1,2})?$/).refine((v) => Number(v) > 0, 'must be above zero');
const invoiceDto = z.object({ customerId: z.string().uuid(), placementIds: z.array(z.string().uuid()).min(1), invoiceDate: day, dueDate: day, taxPercent: z.number().min(0).max(100).default(0) });
const paymentDto = z.object({
  customerId: z.string().uuid(), amount: positive, date: day, method: z.string().trim().max(40).optional(), reference: z.string().trim().max(100).optional(),
  idempotencyKey: z.string().min(8).max(100), allocations: z.array(z.object({ invoiceId: z.string().uuid(), amount: positive })).default([]),
});
const creditDto = z.object({ amount: positive, reason: z.string().trim().min(1).max(500) });
const billDto = z.object({ supplierReference: z.string().trim().min(1).max(100), bookingIds: z.array(z.string().uuid()).min(1), billDate: day, dueDate: day, amount: positive, tax: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0') });
const billPaymentDto = z.object({ amount: positive, date: day, reference: z.string().trim().max(100).optional(), idempotencyKey: z.string().min(8).max(100) });

const today = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10); // Pakistan Standard Time
const bucket = (due: string) => {
  const days = Math.floor((Date.parse(today()) - Date.parse(due)) / 86400000);
  return days <= 0 ? 'current' : days <= 30 ? 'd1_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90_plus';
};
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

@Controller('v1')
export class FinanceController {
  constructor(@Inject(DB) private db: Db) {}

  private audit(tx: Pick<Db, 'insert'>, req: any, entity: string, recordId: string, action: string, newValue?: unknown) {
    return tx.insert(s.auditLogs).values({ tenantId: req.user.tenantId, entity, recordId, action, changedBy: req.user.id, newValue });
  }

  /** Must run inside a transaction: the lock stops concurrent payments overspending one invoice. */
  private async invoiceBalance(tx: Tx, tenantId: string, id: string) {
    const [inv] = await tx.select().from(s.customerInvoices).where(and(eq(s.customerInvoices.id, id), eq(s.customerInvoices.tenantId, tenantId))).for('update');
    if (!inv) throw new NotFoundException({ code: 'NOT_FOUND' });
    const paid = await tx.select({ amount: s.customerPaymentAllocations.amount }).from(s.customerPaymentAllocations).where(eq(s.customerPaymentAllocations.invoiceId, id));
    const credits = await tx.select({ amount: s.customerCreditNotes.amount }).from(s.customerCreditNotes).where(eq(s.customerCreditNotes.invoiceId, id));
    return { inv, balance: sumMoney([inv.total, ...[...paid, ...credits].map((r) => `-${r.amount}`)]) };
  }

  private async invoicesWithBalance(tenantId: string) {
    const [invoices, paid, credits] = await Promise.all([
      this.db.select({ invoice: s.customerInvoices, customerName: s.customers.name }).from(s.customerInvoices)
        .innerJoin(s.customers, eq(s.customerInvoices.customerId, s.customers.id)).where(eq(s.customerInvoices.tenantId, tenantId)).orderBy(desc(s.customerInvoices.createdAt)),
      this.db.select().from(s.customerPaymentAllocations).where(eq(s.customerPaymentAllocations.tenantId, tenantId)),
      this.db.select().from(s.customerCreditNotes).where(eq(s.customerCreditNotes.tenantId, tenantId)),
    ]);
    return invoices.map((r) => ({
      ...r,
      balance: sumMoney([r.invoice.total, ...paid.filter((p) => p.invoiceId === r.invoice.id).map((p) => `-${p.amount}`), ...credits.filter((c) => c.invoiceId === r.invoice.id).map((c) => `-${c.amount}`)]),
    }));
  }

  private async billsWithBalance(tenantId: string) {
    const [bills, paid] = await Promise.all([
      this.db.select().from(s.supplierBills).where(eq(s.supplierBills.tenantId, tenantId)).orderBy(desc(s.supplierBills.createdAt)),
      this.db.select().from(s.supplierPayments).where(eq(s.supplierPayments.tenantId, tenantId)),
    ]);
    return bills.map((bill) => ({ bill, balance: sumMoney([bill.total, ...paid.filter((p) => p.billId === bill.id).map((p) => `-${p.amount}`)]) }));
  }

  @Perm('portal.customer') @Get('portal/customer/invoices/:id/document')
  myDocument(@Req() req: any, @Param('id') id: string) { return this.invoiceDocument(req.user.tenantId, id, req.user.customerId); }

  private async invoiceDocument(tenantId: string, id: string, customerId?: string) {
    const [r] = await this.db.select({ i: s.customerInvoices, party: s.customers.name, tenant: s.tenants }).from(s.customerInvoices)
      .innerJoin(s.customers, eq(s.customerInvoices.customerId, s.customers.id)).innerJoin(s.tenants, eq(s.customerInvoices.tenantId, s.tenants.id))
      .where(and(eq(s.customerInvoices.id, uuid(id)), eq(s.customerInvoices.tenantId, tenantId), customerId ? eq(s.customerInvoices.customerId, customerId) : undefined));
    if (!r) throw new NotFoundException({ code: 'NOT_FOUND' });
    const lines = await this.db.select().from(s.customerInvoiceLines).where(eq(s.customerInvoiceLines.invoiceId, r.i.id));
    const balance = (await this.invoicesWithBalance(tenantId)).find((x) => x.invoice.id === r.i.id)!.balance;
    return { agency: r.tenant.name, company: { address: r.tenant.address, phone: r.tenant.phone, email: r.tenant.email, ntn: r.tenant.ntn, bankDetails: r.tenant.bankDetails }, number: r.i.number, date: r.i.invoiceDate, dueDate: r.i.dueDate, party: r.party, subtotal: r.i.subtotal, tax: r.i.tax, total: r.i.total,
      paid: sumMoney([r.i.total, `-${balance}`]), balance, lines: lines.map((l) => ({ description: l.description, amount: l.amount })) };
  }
  @Perm('finance.read') @Get('finance/invoices/:id/document') document(@Req() req: any, @Param('id') id: string) { return this.invoiceDocument(req.user.tenantId, id); }

  @Perm('finance.read') @Get('finance/invoices') invoices(@Req() req: any) { return this.invoicesWithBalance(req.user.tenantId); }
  @Perm('finance.read') @Get('finance/bills') bills(@Req() req: any) { return this.billsWithBalance(req.user.tenantId); }

  /** Default: a placement can be invoiced once it has run. Each can only ever sit on one invoice line. */
  @Perm('finance.read') @Get('finance/eligible-placements')
  eligible(@Req() req: any, @Query('customerId') customerId: string) {
    return this.db.select({ placement: s.placements, orderNumber: s.orders.number }).from(s.placements)
      .innerJoin(s.orders, eq(s.placements.orderId, s.orders.id))
      .leftJoin(s.customerInvoiceLines, eq(s.customerInvoiceLines.placementId, s.placements.id))
      .where(and(eq(s.placements.tenantId, req.user.tenantId), eq(s.orders.customerId, uuid(customerId)), eq(s.orders.status, 'confirmed'),
        inArray(s.placements.status, ['executed', 'verified']), isNull(s.customerInvoiceLines.id)));
  }

  @Perm('finance.read') @Get('finance/billable-bookings')
  billable(@Req() req: any) {
    return this.db.select({ booking: s.supplierBookings }).from(s.supplierBookings)
      .leftJoin(s.supplierBillLines, eq(s.supplierBillLines.bookingId, s.supplierBookings.id))
      .where(and(eq(s.supplierBookings.tenantId, req.user.tenantId), inArray(s.supplierBookings.status, ['confirmed', 'executed']), isNull(s.supplierBillLines.id)));
  }

  @Perm('finance.write') @Post('finance/invoices')
  async createInvoice(@Req() req: any, @Body() body: unknown) {
    const dto = parse(invoiceDto, body);
    const tenantId: string = req.user.tenantId;
    if (dto.dueDate < dto.invoiceDate) throw new BadRequestException({ code: 'DUE_BEFORE_INVOICE' });
    const rows = await this.eligible(req, dto.customerId);
    const chosen = rows.filter((r) => dto.placementIds.includes(r.placement.id));
    if (chosen.length !== new Set(dto.placementIds).size) throw new ConflictException({ code: 'NOT_ELIGIBLE' });
    const subtotal = sumMoney(chosen.map((r) => r.placement.net));
    const { tax, total } = priceLine({ unit: 'fixed', rate: subtotal, taxPercent: dto.taxPercent, quantity: {} });
    return this.db.transaction(async (tx) => {
      const n = await nextNumber(tx, tenantId, 'invoice');
      const [inv] = await tx.insert(s.customerInvoices).values({
        tenantId, number: `INV-${dto.invoiceDate.slice(0, 4)}-${String(n).padStart(5, '0')}`, customerId: dto.customerId,
        invoiceDate: dto.invoiceDate, dueDate: dto.dueDate, subtotal, taxPercent: String(dto.taxPercent), tax, total, createdBy: req.user.id,
      }).returning();
      // The unique index on placement_id is the real guard against a concurrent double invoice.
      await tx.insert(s.customerInvoiceLines).values(chosen.map((r) => ({ tenantId, invoiceId: inv.id, placementId: r.placement.id, description: `${r.orderNumber} ${r.placement.formatCode} ${r.placement.date}`, amount: r.placement.net })));
      await this.audit(tx, req, 'invoice', inv.id, 'issue', { total });
      return inv;
    });
  }

  @Perm('finance.approve') @Post('finance/invoices/:id/credit-notes')
  async credit(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = parse(creditDto, body);
    return this.db.transaction(async (tx) => {
      const { inv, balance } = await this.invoiceBalance(tx, req.user.tenantId, uuid(id));
      if (cmpMoney(dto.amount, balance) > 0) throw new ConflictException({ code: 'EXCEEDS_BALANCE', balance });
      const n = await nextNumber(tx, inv.tenantId, 'credit_note');
      const [c] = await tx.insert(s.customerCreditNotes).values({ tenantId: inv.tenantId, number: `CN-${String(n).padStart(5, '0')}`, invoiceId: inv.id, amount: dto.amount, reason: dto.reason, createdBy: req.user.id }).returning();
      await this.audit(tx, req, 'credit_note', c.id, 'issue', dto);
      return c;
    });
  }

  /** Anything not allocated stays on the payment as an advance. A repeated key returns the first result. */
  @Perm('finance.write') @Post('finance/payments')
  async payment(@Req() req: any, @Body() body: unknown) {
    const dto = parse(paymentDto, body);
    const tenantId: string = req.user.tenantId;
    const key = and(eq(s.customerPayments.tenantId, tenantId), eq(s.customerPayments.idempotencyKey, dto.idempotencyKey));
    const [seen] = await this.db.select().from(s.customerPayments).where(key);
    if (seen) return seen;
    if (cmpMoney(sumMoney(dto.allocations.map((a) => a.amount)), dto.amount) > 0) throw new BadRequestException({ code: 'OVER_ALLOCATED' });
    const [customer] = await this.db.select().from(s.customers).where(and(eq(s.customers.id, dto.customerId), eq(s.customers.tenantId, tenantId)));
    if (!customer) throw new NotFoundException({ code: 'NOT_FOUND' });
    return this.db.transaction(async (tx) => {
      const n = await nextNumber(tx, tenantId, 'receipt');
      const { allocations, ...fields } = dto;
      const [p] = await tx.insert(s.customerPayments).values({ ...fields, tenantId, number: `RCT-${String(n).padStart(5, '0')}` }).returning();
      for (const a of allocations) {
        const { inv, balance } = await this.invoiceBalance(tx, tenantId, a.invoiceId);
        if (inv.customerId !== dto.customerId) throw new ConflictException({ code: 'WRONG_CUSTOMER' });
        if (cmpMoney(a.amount, balance) > 0) throw new ConflictException({ code: 'EXCEEDS_BALANCE', balance });
        await tx.insert(s.customerPaymentAllocations).values({ tenantId, paymentId: p.id, invoiceId: inv.id, amount: a.amount });
      }
      await this.audit(tx, req, 'payment', p.id, 'record', dto);
      return p;
    });
  }

  @Perm('finance.write') @Post('finance/bills')
  async createBill(@Req() req: any, @Body() body: unknown) {
    const dto = parse(billDto, body);
    const tenantId: string = req.user.tenantId;
    const open = await this.billable(req);
    const chosen = open.filter((r) => dto.bookingIds.includes(r.booking.id));
    if (chosen.length !== new Set(dto.bookingIds).size) throw new ConflictException({ code: 'NOT_BILLABLE' });
    const total = sumMoney([dto.amount, dto.tax]);
    return this.db.transaction(async (tx) => {
      const [b] = await tx.insert(s.supplierBills).values({ tenantId, supplierReference: dto.supplierReference, billDate: dto.billDate, dueDate: dto.dueDate, amount: dto.amount, tax: dto.tax, total, createdBy: req.user.id }).returning();
      await tx.insert(s.supplierBillLines).values(chosen.map((r) => ({ tenantId, billId: b.id, bookingId: r.booking.id })));
      await this.audit(tx, req, 'supplier_bill', b.id, 'record', dto);
      return b;
    });
  }

  @Perm('finance.write') @Post('finance/bills/:id/payments')
  async payBill(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = parse(billPaymentDto, body);
    const tenantId: string = req.user.tenantId;
    const [seen] = await this.db.select().from(s.supplierPayments).where(and(eq(s.supplierPayments.tenantId, tenantId), eq(s.supplierPayments.idempotencyKey, dto.idempotencyKey)));
    if (seen) return seen;
    return this.db.transaction(async (tx) => {
      const [bill] = await tx.select().from(s.supplierBills).where(and(eq(s.supplierBills.id, uuid(id)), eq(s.supplierBills.tenantId, tenantId))).for('update');
      if (!bill) throw new NotFoundException({ code: 'NOT_FOUND' });
      const paid = await tx.select().from(s.supplierPayments).where(eq(s.supplierPayments.billId, bill.id));
      const balance = sumMoney([bill.total, ...paid.map((p) => `-${p.amount}`)]);
      if (cmpMoney(dto.amount, balance) > 0) throw new ConflictException({ code: 'EXCEEDS_BALANCE', balance });
      const [p] = await tx.insert(s.supplierPayments).values({ ...dto, tenantId, billId: bill.id }).returning();
      await this.audit(tx, req, 'supplier_payment', p.id, 'record', dto);
      return p;
    });
  }

  /** Balances only. Collections are not revenue and supplier payments are not expense recognition. */
  @Perm('finance.read') @Get('finance/summary')
  async summary(@Req() req: any) {
    const tenantId: string = req.user.tenantId;
    const [invoices, bills, payments, allocs] = await Promise.all([
      this.invoicesWithBalance(tenantId), this.billsWithBalance(tenantId),
      this.db.select().from(s.customerPayments).where(eq(s.customerPayments.tenantId, tenantId)),
      this.db.select().from(s.customerPaymentAllocations).where(eq(s.customerPaymentAllocations.tenantId, tenantId)),
    ]);
    const aging: Record<string, string> = { current: '0.00', d1_30: '0.00', d31_60: '0.00', d61_90: '0.00', d90_plus: '0.00' };
    for (const i of invoices) { const b = bucket(i.invoice.dueDate); aging[b] = sumMoney([aging[b], i.balance]); }
    return {
      receivables: sumMoney(invoices.map((i) => i.balance)), payables: sumMoney(bills.map((b) => b.balance)), aging,
      advances: sumMoney([...payments.map((p) => p.amount), ...allocs.map((a) => `-${a.amount}`)]),
    };
  }

  /** Quoted uses the priced supplier cost, committed the booking, actual the supplier bill. */
  @Perm('finance.read') @Get('finance/profitability')
  async profitability(@Req() req: any) {
    const tenantId: string = req.user.tenantId;
    const placements = await this.db.select({ p: s.placements, outletName: s.mediaOutlets.name, orderNumber: s.orders.number }).from(s.placements)
      .innerJoin(s.orders, eq(s.placements.orderId, s.orders.id)).innerJoin(s.mediaOutlets, eq(s.placements.outletId, s.mediaOutlets.id))
      .where(and(eq(s.placements.tenantId, tenantId), eq(s.orders.status, 'confirmed'))).orderBy(desc(s.orders.createdAt)).limit(200);
    const bookings = await this.db.select().from(s.supplierBookings).where(and(eq(s.supplierBookings.tenantId, tenantId), or(eq(s.supplierBookings.status, 'confirmed'), eq(s.supplierBookings.status, 'executed'))));
    const billLines = await this.db.select({ bookingId: s.supplierBillLines.bookingId, billId: s.supplierBillLines.billId, amount: s.supplierBills.amount }).from(s.supplierBillLines)
      .innerJoin(s.supplierBills, eq(s.supplierBillLines.billId, s.supplierBills.id)).where(eq(s.supplierBillLines.tenantId, tenantId));
    return placements.map(({ p, outletName, orderNumber }) => {
      const booking = bookings.find((b) => b.placementId === p.id);
      const bill = booking && billLines.find((l) => l.bookingId === booking.id);
      const sharedBill = bill && billLines.filter((l) => l.billId === bill.billId).length > 1;
      const margin = (cost: string | null | undefined) => (cost ? sumMoney([p.net, `-${cost}`]) : null);
      return {
        id: p.id, orderNumber, outletName, selling: p.net, quotedMargin: margin(p.supplierCost), committedMargin: margin(booking?.purchasePrice),
        // A bill spanning several bookings cannot be split per placement without guessing.
        actualMargin: sharedBill ? null : margin(bill?.amount),
      };
    });
  }
}
