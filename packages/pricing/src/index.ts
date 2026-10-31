import Decimal from 'decimal.js';

export type PricingUnit =
  | 'per_sq_cm' | 'per_sq_inch' | 'per_column_cm' | 'per_word' | 'per_line' | 'fixed'
  | 'per_second' | 'per_minute' | 'per_spot' | 'per_ticker' | 'per_ticker_second'
  | 'per_day' | 'per_week' | 'per_month' | 'per_cpm' | 'per_cpc' | 'per_cpv';

export interface Quantity {
  widthCm?: number; heightCm?: number; columns?: number; words?: number; lines?: number;
  insertions?: number; durationSeconds?: number; spots?: number; periods?: number;
  impressions?: number; clicks?: number; views?: number;
}

export interface PriceInput {
  unit: PricingUnit;
  rate: Decimal.Value;
  quantity: Quantity;
  multiplier?: Decimal.Value;
  minimumCharge?: Decimal.Value;
  surchargePercent?: Decimal.Value;
  premiumFixed?: Decimal.Value;
  discountPercent?: Decimal.Value;
  taxPercent?: Decimal.Value;
  supplierCost?: Decimal.Value;
}

export interface PriceBreakdown {
  billableUnits: string; base: string; surcharge: string; premium: string; gross: string;
  discount: string; net: string; tax: string; total: string;
  minimumApplied: boolean; supplierCost: string | null; margin: string | null; marginPercent: string | null;
}

export class PricingError extends Error {
  constructor(public code: 'INVALID_INPUT' | 'NO_RATE' | 'AMBIGUOUS_RULES', message: string) { super(message); }
}

const CM_PER_INCH = new Decimal('2.54');
const money = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

function nonNegative(name: string, value: Decimal.Value | undefined, fallback: Decimal.Value = 0): Decimal {
  let d: Decimal;
  try { d = new Decimal(value ?? fallback); } catch { throw new PricingError('INVALID_INPUT', `${name} is not a number`); }
  if (!d.isFinite() || d.isNegative()) throw new PricingError('INVALID_INPUT', `${name} must be zero or more`);
  return d;
}

/** Quantity billed before the rate is applied. Insertions repeat every print unit. */
export function billableUnits(unit: PricingUnit, q: Quantity): Decimal {
  const n = (name: keyof Quantity, fallback = 0) => nonNegative(name, q[name], fallback);
  const insertions = n('insertions', 1);
  const spots = n('spots', 1);
  const duration = n('durationSeconds');
  switch (unit) {
    case 'per_sq_cm': return n('widthCm').times(n('heightCm')).times(insertions);
    case 'per_sq_inch': return n('widthCm').div(CM_PER_INCH).times(n('heightCm').div(CM_PER_INCH)).times(insertions);
    case 'per_column_cm': return n('columns', 1).times(n('heightCm')).times(insertions);
    case 'per_word': return n('words').times(insertions);
    case 'per_line': return n('lines').times(insertions);
    case 'fixed': return insertions.times(spots);
    case 'per_second':
    case 'per_ticker_second': return duration.times(spots);
    case 'per_minute': return duration.div(60).times(spots);
    case 'per_spot':
    case 'per_ticker': return spots;
    case 'per_day':
    case 'per_week':
    case 'per_month': return n('periods', 1);
    case 'per_cpm': return n('impressions').div(1000);
    case 'per_cpc': return n('clicks');
    case 'per_cpv': return n('views');
  }
}

/** Order: units × rate × multiplier, minimum charge, surcharges and premium, discount, tax, margin. */
export function priceLine(input: PriceInput): PriceBreakdown {
  const discountPct = nonNegative('discountPercent', input.discountPercent);
  if (discountPct.gt(100)) throw new PricingError('INVALID_INPUT', 'discountPercent cannot exceed 100');
  const units = billableUnits(input.unit, input.quantity);
  const raw = units.times(nonNegative('rate', input.rate)).times(nonNegative('multiplier', input.multiplier, 1));
  const minimum = nonNegative('minimumCharge', input.minimumCharge);
  const minimumApplied = raw.lt(minimum);
  const base = money(minimumApplied ? minimum : raw);
  const surcharge = money(base.times(nonNegative('surchargePercent', input.surchargePercent)).div(100));
  const premium = money(nonNegative('premiumFixed', input.premiumFixed));
  const gross = base.plus(surcharge).plus(premium);
  const discount = money(gross.times(discountPct).div(100));
  const net = gross.minus(discount);
  const tax = money(net.times(nonNegative('taxPercent', input.taxPercent)).div(100));
  const cost = input.supplierCost === undefined ? null : money(nonNegative('supplierCost', input.supplierCost));
  const margin = cost && net.minus(cost);
  return {
    billableUnits: units.toString(), base: base.toFixed(2), surcharge: surcharge.toFixed(2), premium: premium.toFixed(2),
    gross: gross.toFixed(2), discount: discount.toFixed(2), net: net.toFixed(2), tax: tax.toFixed(2),
    total: net.plus(tax).toFixed(2), minimumApplied, supplierCost: cost?.toFixed(2) ?? null,
    margin: margin?.toFixed(2) ?? null,
    marginPercent: margin && !net.isZero() ? margin.div(net).times(100).toDecimalPlaces(2).toFixed(2) : null,
  };
}

export interface RateRule {
  id: string;
  cardKind: 'supplier' | 'selling';
  effectiveFrom: string;            // YYYY-MM-DD
  effectiveTo: string | null;
  outletId: string;
  formatCode: string | null;        // null means "any"
  editionCode?: string | null;
  timeBandCode?: string | null;
  daysOfWeek?: number[] | null;     // 0 = Sunday
  customerId?: string | null;
  priority: number;
  unit: PricingUnit;
  rate: string;
  multiplier?: string | null;
  minimumCharge?: string | null;
}

export interface RateRequest {
  cardKind: 'supplier' | 'selling'; outletId: string; date: string; formatCode: string;
  editionCode?: string; timeBandCode?: string; customerId?: string;
}

const specificity = (r: RateRule) =>
  (r.customerId ? 16 : 0) + (r.formatCode ? 8 : 0) + (r.editionCode ? 4 : 0) + (r.timeBandCode ? 2 : 0) + (r.daysOfWeek?.length ? 1 : 0);

/**
 * Picks the one applicable rule: highest priority, then highest specificity
 * (customer contract > format > edition > time band > weekday).
 * An exact tie is refused rather than resolved arbitrarily.
 */
export function selectRule(rules: RateRule[], req: RateRequest): RateRule {
  const day = new Date(`${req.date}T00:00:00Z`).getUTCDay();
  const eligible = rules.filter((r) =>
    r.cardKind === req.cardKind && r.outletId === req.outletId &&
    r.effectiveFrom <= req.date && (!r.effectiveTo || r.effectiveTo >= req.date) &&
    (!r.formatCode || r.formatCode === req.formatCode) &&
    (!r.editionCode || r.editionCode === req.editionCode) &&
    (!r.timeBandCode || r.timeBandCode === req.timeBandCode) &&
    (!r.customerId || r.customerId === req.customerId) &&
    (!r.daysOfWeek?.length || r.daysOfWeek.includes(day)));
  if (!eligible.length) throw new PricingError('NO_RATE', `No ${req.cardKind} rate applies`);
  const ranked = [...eligible].sort((a, b) => b.priority - a.priority || specificity(b) - specificity(a));
  const [top, next] = ranked;
  if (next && top.priority === next.priority && specificity(top) === specificity(next)) {
    throw new PricingError('AMBIGUOUS_RULES', `Rules ${top.id} and ${next.id} conflict`);
  }
  return top;
}

export const sumMoney = (values: Decimal.Value[]) => money(values.reduce<Decimal>((a, v) => a.plus(v), new Decimal(0))).toFixed(2);
export const cmpMoney = (a: Decimal.Value, b: Decimal.Value) => new Decimal(a).cmp(b);
