import { BadRequestException, Controller, Get, Inject, NotFoundException, Param, Query, Req } from '@nestjs/common';
import { sumMoney } from '@mamp/pricing';
import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { Perm } from './auth';
import { DB, Db } from './db';
import * as s from './schema';

const today = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10); // Pakistan Standard Time
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const validDay = (v: string | undefined, fallback: string) => {
  if (v === undefined || v === '') return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequestException({ code: 'BAD_DATE' });
  return v;
};

function totals<T>(rows: T[], key: (r: T) => string, amount: (r: T) => string) {
  const groups = new Map<string, { name: string; count: number; amounts: string[] }>();
  for (const r of rows) {
    const k = key(r);
    const g = groups.get(k) ?? { name: k, count: 0, amounts: [] };
    g.count += 1; g.amounts.push(amount(r)); groups.set(k, g);
  }
  return [...groups.values()].map((g) => ({ name: g.name, count: g.count, total: sumMoney(g.amounts) })).sort((a, b) => Number(b.total) - Number(a.total));
}

/**
 * Definitions: "sales" is the selling net of placements on non-cancelled orders, dated by the
 * placement. "Receivable" is invoiced and unpaid. Everything is scoped to the caller's tenant.
 */
@Controller('v1')
export class ReportsController {
  constructor(@Inject(DB) private db: Db) {}

  private sales(tenantId: string, from: string, to: string) {
    return this.db.select({ p: s.placements, customerName: s.customers.name, outletName: s.mediaOutlets.name }).from(s.placements)
      .innerJoin(s.orders, eq(s.placements.orderId, s.orders.id))
      .innerJoin(s.customers, eq(s.orders.customerId, s.customers.id))
      .innerJoin(s.mediaOutlets, eq(s.placements.outletId, s.mediaOutlets.id))
      .where(and(eq(s.placements.tenantId, tenantId), ne(s.orders.status, 'cancelled'), gte(s.placements.date, from), lte(s.placements.date, to)));
  }
  private openBookings(tenantId: string) {
    return this.db.select({ b: s.supplierBookings, outletName: s.mediaOutlets.name }).from(s.supplierBookings)
      .innerJoin(s.mediaOutlets, eq(s.supplierBookings.outletId, s.mediaOutlets.id))
      .where(and(eq(s.supplierBookings.tenantId, tenantId), inArray(s.supplierBookings.status, ['submitted', 'reschedule_requested'])));
  }
  private unverified(tenantId: string) {
    return this.db.select({ p: s.placements, outletName: s.mediaOutlets.name }).from(s.placements)
      .innerJoin(s.mediaOutlets, eq(s.placements.outletId, s.mediaOutlets.id))
      .where(and(eq(s.placements.tenantId, tenantId), eq(s.placements.status, 'executed')));
  }

  @Perm('sales.read') @Get('dashboard')
  async dashboard(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    const tenantId: string = req.user.tenantId;
    const start = validDay(from, addDays(today(), -365));
    const end = validDay(to, addDays(today(), 365));
    const [rows, campaigns, pending, bookings, proofs] = await Promise.all([
      this.sales(tenantId, start, end),
      this.db.select({ id: s.campaigns.id }).from(s.campaigns).where(and(eq(s.campaigns.tenantId, tenantId), eq(s.campaigns.status, 'active'))),
      this.db.select({ id: s.quotations.id }).from(s.quotations).where(and(eq(s.quotations.tenantId, tenantId), eq(s.quotations.status, 'pending_approval'))),
      this.openBookings(tenantId), this.unverified(tenantId),
    ]);
    return {
      from: start, to: end,
      sales: sumMoney(rows.map((r) => r.p.net)), placements: rows.length, activeCampaigns: campaigns.length,
      pendingApprovals: pending.length, pendingBookings: bookings.length, proofsPending: proofs.length,
      monthly: totals(rows, (r) => r.p.date.slice(0, 7), (r) => r.p.net).sort((a, b) => a.name.localeCompare(b.name)),
      topCustomers: totals(rows, (r) => r.customerName, (r) => r.p.net).slice(0, 5),
      topOutlets: totals(rows, (r) => r.outletName, (r) => r.p.net).slice(0, 5),
    };
  }

  @Perm('sales.read') @Get('reports/:name')
  async report(@Req() req: any, @Param('name') name: string, @Query('from') from?: string, @Query('to') to?: string) {
    const tenantId: string = req.user.tenantId;
    const start = validDay(from, '2000-01-01');
    const end = validDay(to, '2100-01-01');
    if (name === 'sales-by-customer') return totals(await this.sales(tenantId, start, end), (r) => r.customerName, (r) => r.p.net);
    if (name === 'sales-by-outlet') return totals(await this.sales(tenantId, start, end), (r) => r.outletName, (r) => r.p.net);
    if (name === 'pending-bookings') return (await this.openBookings(tenantId)).map((r) => ({ number: r.b.number, outlet: r.outletName, date: r.b.requestedDate, status: r.b.status }));
    if (name === 'proof-pending') return (await this.unverified(tenantId)).map((r) => ({ outlet: r.outletName, format: r.p.formatCode, date: r.p.date }));
    if (name === 'quotation-conversion') {
      const rows = await this.db.select({ status: s.quotations.status }).from(s.quotations).where(eq(s.quotations.tenantId, tenantId));
      const decided = rows.filter((r) => r.status === 'accepted' || r.status === 'rejected').length;
      const accepted = rows.filter((r) => r.status === 'accepted').length;
      return [{ quotations: rows.length, accepted, rejected: decided - accepted, conversionPercent: decided ? ((accepted / decided) * 100).toFixed(1) : null }];
    }
    throw new NotFoundException({ code: 'NOT_FOUND' });
  }

  @Perm('sales.read') @Get('calendar')
  async calendar(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    const tenantId: string = req.user.tenantId;
    const start = validDay(from, today());
    const end = validDay(to, addDays(start, 31));
    const placements = await this.sales(tenantId, start, end);
    const events = placements.map((r) => ({ date: r.p.date, kind: 'placement', title: `${r.outletName} · ${r.p.formatCode}`, status: r.p.status, href: `/placements/${r.p.id}` }));
    if (req.user.permissions.includes('finance.read')) {
      const inv = await this.db.select().from(s.customerInvoices).where(and(eq(s.customerInvoices.tenantId, tenantId), gte(s.customerInvoices.dueDate, start), lte(s.customerInvoices.dueDate, end)));
      const bills = await this.db.select().from(s.supplierBills).where(and(eq(s.supplierBills.tenantId, tenantId), gte(s.supplierBills.dueDate, start), lte(s.supplierBills.dueDate, end)));
      events.push(...inv.map((i) => ({ date: i.dueDate, kind: 'invoice_due', title: i.number, status: '', href: '/finance' })));
      events.push(...bills.map((b) => ({ date: b.dueDate, kind: 'bill_due', title: b.supplierReference, status: '', href: '/finance' })));
    }
    return events.sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Worked out live, so an alert disappears as soon as its cause is resolved. */
  @Perm('sales.read') @Get('alerts')
  async alerts(@Req() req: any) {
    const tenantId: string = req.user.tenantId;
    const now = today();
    const [soon, proofs, approvals] = await Promise.all([
      this.db.select({ p: s.placements, outletName: s.mediaOutlets.name }).from(s.placements)
        .innerJoin(s.orders, eq(s.placements.orderId, s.orders.id)).innerJoin(s.mediaOutlets, eq(s.placements.outletId, s.mediaOutlets.id))
        .where(and(eq(s.placements.tenantId, tenantId), eq(s.placements.status, 'pending'), eq(s.orders.status, 'confirmed'), lte(s.placements.date, addDays(now, 3)))),
      this.unverified(tenantId),
      this.db.select().from(s.quotations).where(and(eq(s.quotations.tenantId, tenantId), eq(s.quotations.status, 'pending_approval'))),
    ]);
    const alerts = [
      ...soon.map((r) => ({ kind: 'unconfirmed_soon', title: `${r.outletName} · ${r.p.date}`, href: `/placements/${r.p.id}` })),
      ...proofs.map((r) => ({ kind: 'proof_pending', title: `${r.outletName} · ${r.p.date}`, href: `/placements/${r.p.id}` })),
      ...approvals.map((q) => ({ kind: 'approval_needed', title: q.number, href: `/quotations/${q.id}` })),
    ];
    if (req.user.permissions.includes('finance.read')) {
      const overdue = await this.db.select().from(s.customerInvoices).where(and(eq(s.customerInvoices.tenantId, tenantId), lte(s.customerInvoices.dueDate, addDays(now, -1))));
      const paid = await this.db.select().from(s.customerPaymentAllocations).where(eq(s.customerPaymentAllocations.tenantId, tenantId));
      const credits = await this.db.select().from(s.customerCreditNotes).where(eq(s.customerCreditNotes.tenantId, tenantId));
      for (const i of overdue) {
        const less = [...paid, ...credits].filter((x) => x.invoiceId === i.id).map((x) => `-${x.amount}`);
        if (Number(sumMoney([i.total, ...less])) > 0) alerts.push({ kind: 'invoice_overdue', title: i.number, href: '/finance' });
      }
    }
    return alerts;
  }
}
