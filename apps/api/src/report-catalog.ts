import { sumMoney } from './pricing-engine';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { Db } from './db';
import * as s from './schema';

type Rec = Record<string, unknown>;
export const REPORTS: { name: string; group: string; permission: string }[] = [
  ...['sales-by-customer', 'sales-by-outlet', 'sales-by-newspaper', 'sales-by-tv', 'sales-by-category', 'sales-by-city', 'sales-by-salesperson', 'discount-report', 'cancellation-report', 'quotation-conversion', 'customer-order-history', 'campaign-performance']
    .map((name) => ({ name, group: 'sales', permission: 'sales.read' })),
  ...['daily-booking', 'monthly-booking', 'newspaper-schedule', 'tv-schedule', 'supplier-booking-history', 'pending-bookings', 'execution-report', 'proof-pending']
    .map((name) => ({ name, group: 'operations', permission: 'ops.read' })),
  ...['revenue', 'supplier-cost', 'gross-profit', 'customer-outstanding', 'supplier-outstanding', 'invoice-aging', 'payment-collection', 'customer-profitability', 'outlet-profitability']
    .map((name) => ({ name, group: 'finance', permission: 'finance.read' })),
  { name: 'rate-card-comparison', group: 'admin', permission: 'ratecards.read' },
  { name: 'user-activity', group: 'admin', permission: 'audit.read' },
];

export function totals<T>(rows: T[], key: (r: T) => string, amount: (r: T) => string) {
  const groups = new Map<string, { name: string; count: number; amounts: string[] }>();
  for (const r of rows) {
    const k = key(r) || '—';
    const g = groups.get(k) ?? { name: k, count: 0, amounts: [] };
    g.count += 1; g.amounts.push(amount(r)); groups.set(k, g);
  }
  return [...groups.values()].map((g) => ({ name: g.name, count: g.count, total: sumMoney(g.amounts) })).sort((a, b) => Number(b.total) - Number(a.total));
}
const margin = (rows: { net: string; cost: string | null }[]) => sumMoney(rows.flatMap((r) => [r.net, `-${r.cost ?? 0}`]));
const percent = (part: string, whole: string) => (Number(whole) ? ((Number(part) / Number(whole)) * 100).toFixed(1) : null);
const today = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);

function profitBy<T extends { p: { net: string; supplierCost: string | null } }>(rows: T[], key: (r: T) => string) {
  const groups = new Map<string, T[]>();
  for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  return [...groups].map(([name, g]) => {
    const list = g.map((r) => ({ net: r.p.net, cost: r.p.supplierCost }));
    const total = sumMoney(list.map((l) => l.net));
    const gross = margin(list);
    return { name, total, supplierCost: sumMoney(list.map((l) => l.cost ?? 0)), grossMargin: gross, marginPercent: percent(gross, total) };
  }).sort((a, b) => Number(b.total) - Number(a.total));
}

/** Every report is scoped to the tenant; the caller has already checked the report's permission. */
export async function runReport(db: Db, tenantId: string, name: string, from: string, to: string): Promise<Rec[]> {
  const placements = (cancelled = false) => db.select({
    p: s.placements, orderNumber: s.orders.number, orderStatus: s.orders.status, campaignId: s.orders.campaignId, customer: s.customers.name, city: s.customers.city,
    outlet: s.mediaOutlets.name, category: s.mediaCategories.code, categoryName: s.mediaCategories.name, seller: s.users.name, discountPercent: s.quotationLines.discountPercent,
  }).from(s.placements).innerJoin(s.orders, eq(s.placements.orderId, s.orders.id)).innerJoin(s.customers, eq(s.orders.customerId, s.customers.id))
    .innerJoin(s.mediaOutlets, eq(s.placements.outletId, s.mediaOutlets.id)).innerJoin(s.mediaCategories, eq(s.mediaOutlets.categoryId, s.mediaCategories.id))
    .leftJoin(s.users, eq(s.orders.createdBy, s.users.id)).leftJoin(s.quotationLines, eq(s.placements.quotationLineId, s.quotationLines.id))
    .where(and(eq(s.placements.tenantId, tenantId), gte(s.placements.date, from), lte(s.placements.date, to), eq(s.orders.status, cancelled ? 'cancelled' : 'confirmed')));
  const bookings = () => db.select({ b: s.supplierBookings, outlet: s.mediaOutlets.name }).from(s.supplierBookings)
    .innerJoin(s.mediaOutlets, eq(s.supplierBookings.outletId, s.mediaOutlets.id))
    .where(and(eq(s.supplierBookings.tenantId, tenantId), gte(s.supplierBookings.requestedDate, from), lte(s.supplierBookings.requestedDate, to)));
  const invoices = async () => {
    const [list, paid, credits] = await Promise.all([
      db.select({ i: s.customerInvoices, customer: s.customers.name }).from(s.customerInvoices).innerJoin(s.customers, eq(s.customerInvoices.customerId, s.customers.id))
        .where(and(eq(s.customerInvoices.tenantId, tenantId), gte(s.customerInvoices.invoiceDate, from), lte(s.customerInvoices.invoiceDate, to))),
      db.select().from(s.customerPaymentAllocations).where(eq(s.customerPaymentAllocations.tenantId, tenantId)),
      db.select().from(s.customerCreditNotes).where(eq(s.customerCreditNotes.tenantId, tenantId)),
    ]);
    return list.map((r) => ({ ...r, balance: sumMoney([r.i.total, ...[...paid, ...credits].filter((x) => x.invoiceId === r.i.id).map((x) => `-${x.amount}`)]) }));
  };
  const schedule = async (category: string) => (await placements()).filter((r) => r.category === category).sort((a, b) => a.p.date.localeCompare(b.p.date))
    .map((r) => ({ date: r.p.date, outlet: r.outlet, customer: r.customer, format: r.p.formatCode, status: r.p.status, order: r.orderNumber }));
  const sum = (key: (r: Awaited<ReturnType<typeof placements>>[number]) => string, filter = (_: string) => true) => placements().then((rows) => totals(rows.filter((r) => filter(r.category)), key, (r) => r.p.net));

  switch (name) {
    case 'sales-by-customer': return sum((r) => r.customer);
    case 'sales-by-outlet': return sum((r) => r.outlet);
    case 'sales-by-newspaper': return sum((r) => r.outlet, (c) => c === 'newspaper');
    case 'sales-by-tv': return sum((r) => r.outlet, (c) => c === 'tv');
    case 'sales-by-category': return sum((r) => r.categoryName);
    case 'sales-by-city': return sum((r) => r.city ?? '—');
    case 'sales-by-salesperson': return sum((r) => r.seller ?? '—');
    case 'customer-order-history': return (await placements()).map((r) => ({ customer: r.customer, order: r.orderNumber, outlet: r.outlet, date: r.p.date, status: r.p.status, total: r.p.net }));
    case 'discount-report': return (await placements()).filter((r) => Number(r.discountPercent) > 0).map((r) => ({ customer: r.customer, order: r.orderNumber, outlet: r.outlet, discountPercent: r.discountPercent, total: r.p.net }));
    case 'cancellation-report': return (await placements(true)).map((r) => ({ customer: r.customer, order: r.orderNumber, outlet: r.outlet, date: r.p.date, total: r.p.net }));
    case 'newspaper-schedule': return schedule('newspaper');
    case 'tv-schedule': return schedule('tv');
    case 'execution-report': return (await placements()).map((r) => ({ date: r.p.date, outlet: r.outlet, customer: r.customer, status: r.p.status }));
    case 'proof-pending': return (await placements()).filter((r) => r.p.status === 'executed').map((r) => ({ date: r.p.date, outlet: r.outlet, customer: r.customer, format: r.p.formatCode }));
    case 'daily-booking': case 'monthly-booking': {
      const len = name === 'daily-booking' ? 10 : 7;
      return totals(await bookings(), (r) => r.b.requestedDate.slice(0, len), (r) => r.b.purchasePrice ?? '0').sort((a, b) => a.name.localeCompare(b.name));
    }
    case 'supplier-booking-history': return (await bookings()).map((r) => ({ number: r.b.number, outlet: r.outlet, date: r.b.requestedDate, status: r.b.status, reference: r.b.supplierReference, total: r.b.purchasePrice }));
    case 'pending-bookings': return (await bookings()).filter((r) => ['submitted', 'reschedule_requested'].includes(r.b.status)).map((r) => ({ number: r.b.number, outlet: r.outlet, date: r.b.requestedDate, status: r.b.status }));
    case 'quotation-conversion': {
      const rows = await db.select({ status: s.quotations.status }).from(s.quotations).where(eq(s.quotations.tenantId, tenantId));
      const accepted = rows.filter((r) => r.status === 'accepted').length;
      const rejected = rows.filter((r) => r.status === 'rejected').length;
      return [{ quotations: rows.length, accepted, rejected, conversionPercent: accepted + rejected ? ((accepted / (accepted + rejected)) * 100).toFixed(1) : null }];
    }
    case 'campaign-performance': {
      const [campaigns, rows] = await Promise.all([
        db.select({ c: s.campaigns, customer: s.customers.name }).from(s.campaigns).innerJoin(s.customers, eq(s.campaigns.customerId, s.customers.id)).where(eq(s.campaigns.tenantId, tenantId)),
        placements(),
      ]);
      return campaigns.map(({ c, customer }) => {
        const committed = sumMoney(rows.filter((r) => r.campaignId === c.id).map((r) => r.p.net));
        return { name: c.name, customer, budget: c.budget, committed, usedPercent: c.budget ? percent(committed, c.budget) : null };
      });
    }
    case 'revenue': return totals(await invoices(), (r) => r.i.invoiceDate.slice(0, 7), (r) => r.i.subtotal).sort((a, b) => a.name.localeCompare(b.name));
    case 'supplier-cost': {
      const rows = await db.select().from(s.supplierBills).where(and(eq(s.supplierBills.tenantId, tenantId), gte(s.supplierBills.billDate, from), lte(s.supplierBills.billDate, to)));
      return totals(rows, (r) => r.billDate.slice(0, 7), (r) => r.amount).sort((a, b) => a.name.localeCompare(b.name));
    }
    case 'gross-profit': return profitBy(await placements(), (r) => r.p.date.slice(0, 7)).sort((a, b) => a.name.localeCompare(b.name));
    case 'customer-profitability': return profitBy(await placements(), (r) => r.customer);
    case 'outlet-profitability': return profitBy(await placements(), (r) => r.outlet);
    case 'customer-outstanding': return totals((await invoices()).filter((r) => Number(r.balance) > 0), (r) => r.customer, (r) => r.balance);
    case 'invoice-aging': return (await invoices()).filter((r) => Number(r.balance) > 0).map((r) => ({
      number: r.i.number, customer: r.customer, dueDate: r.i.dueDate, daysOverdue: Math.max(0, Math.floor((Date.parse(today()) - Date.parse(r.i.dueDate)) / 86400000)), total: r.balance,
    }));
    case 'supplier-outstanding': {
      const [bills, paid] = await Promise.all([db.select().from(s.supplierBills).where(eq(s.supplierBills.tenantId, tenantId)), db.select().from(s.supplierPayments).where(eq(s.supplierPayments.tenantId, tenantId))]);
      return bills.map((b) => ({ reference: b.supplierReference, dueDate: b.dueDate, total: sumMoney([b.total, ...paid.filter((p) => p.billId === b.id).map((p) => `-${p.amount}`)]) })).filter((b) => Number(b.total) > 0);
    }
    case 'payment-collection': {
      const rows = await db.select({ p: s.customerPayments, customer: s.customers.name }).from(s.customerPayments).innerJoin(s.customers, eq(s.customerPayments.customerId, s.customers.id))
        .where(and(eq(s.customerPayments.tenantId, tenantId), gte(s.customerPayments.date, from), lte(s.customerPayments.date, to)));
      return rows.map((r) => ({ number: r.p.number, customer: r.customer, date: r.p.date, method: r.p.method, total: r.p.amount }));
    }
    case 'rate-card-comparison': return (await db.select({ c: s.rateCards, r: s.rateRules, outlet: s.mediaOutlets.name }).from(s.rateRules).innerJoin(s.rateCards, eq(s.rateRules.rateCardId, s.rateCards.id)).innerJoin(s.mediaOutlets, eq(s.rateCards.outletId, s.mediaOutlets.id))
      .where(and(eq(s.rateRules.tenantId, tenantId), eq(s.rateCards.status, 'published')))).map(({ c, r, outlet }) => ({ outlet, kind: c.kind, format: r.formatCode, band: r.timeBandCode, unit: r.unit, rate: r.rate, multiplier: r.multiplier, version: c.version }));
    case 'user-activity': return (await db.select({ a: s.auditLogs, user: s.users.name }).from(s.auditLogs).leftJoin(s.users, eq(s.auditLogs.changedBy, s.users.id)).where(eq(s.auditLogs.tenantId, tenantId)).orderBy(desc(s.auditLogs.createdAt)).limit(1000))
      .map((r) => ({ date: r.a.createdAt.toISOString().slice(0, 16).replace('T', ' '), user: r.user, entity: r.a.entity, action: r.a.action }));
    default: return [];
  }
}
