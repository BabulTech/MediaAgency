import { describe, expect, it } from 'vitest';
import { billableUnits, priceLine, PricingError, RateRule, selectRule } from './index';

describe('priceLine', () => {
  it('matches the TV calculator reference', () => {
    const r = priceLine({ unit: 'per_second', rate: 1500, multiplier: 3, quantity: { durationSeconds: 30, spots: 5 } });
    expect(r.total).toBe('675000.00');
  });
  it('matches the newspaper calculator reference', () => {
    const r = priceLine({ unit: 'per_sq_cm', rate: 250, discountPercent: 30, quantity: { widthCm: 9, heightCm: 15, insertions: 2 } });
    expect([r.base, r.premium, r.discount, r.total]).toEqual(['67500.00', '0.00', '20250.00', '47250.00']);
  });
  it('discounts the premium too', () => {
    expect(priceLine({ unit: 'fixed', rate: 1000, premiumFixed: 1000, discountPercent: 10, quantity: {} }).total).toBe('1800.00');
  });
  it('applies a minimum charge', () => {
    const r = priceLine({ unit: 'per_word', rate: 10, minimumCharge: 500, quantity: { words: 5 } });
    expect(r.base).toBe('500.00'); expect(r.minimumApplied).toBe(true);
  });
  it('avoids float drift and rounds half up', () => {
    expect(priceLine({ unit: 'per_word', rate: '0.1', quantity: { words: 3 } }).total).toBe('0.30');
    expect(priceLine({ unit: 'fixed', rate: '1.005', quantity: {} }).total).toBe('1.01');
  });
  it('applies tax after discount and reports margin', () => {
    const r = priceLine({ unit: 'fixed', rate: 1000, discountPercent: 10, taxPercent: 10, supplierCost: 600, quantity: {} });
    expect([r.tax, r.total, r.margin, r.marginPercent]).toEqual(['90.00', '990.00', '300.00', '33.33']);
  });
  it('rejects bad input', () => {
    expect(() => priceLine({ unit: 'fixed', rate: -1, quantity: {} })).toThrow(PricingError);
    expect(() => priceLine({ unit: 'fixed', rate: 1, discountPercent: 101, quantity: {} })).toThrow(PricingError);
    expect(() => priceLine({ unit: 'fixed', rate: 'abc', quantity: {} })).toThrow(PricingError);
  });
});

describe('billableUnits', () => {
  it.each([
    ['per_column_cm', { columns: 3, heightCm: 10, insertions: 2 }, '60'],
    ['per_line', { lines: 4, insertions: 3 }, '12'],
    ['per_minute', { durationSeconds: 90, spots: 2 }, '3'],
    ['per_ticker', { durationSeconds: 90, spots: 7 }, '7'],
    ['per_week', { periods: 4 }, '4'],
  ] as const)('%s', (unit, q, expected) => expect(billableUnits(unit, q).toString()).toBe(expected));
  it('converts square inches', () => {
    expect(billableUnits('per_sq_inch', { widthCm: 2.54, heightCm: 5.08 }).toString()).toBe('2');
  });
});

describe('selectRule', () => {
  const rule = (o: Partial<RateRule>): RateRule => ({
    id: 'r', cardKind: 'selling', effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', outletId: 'o',
    formatCode: null, priority: 0, unit: 'fixed', rate: '1', ...o,
  });
  const req = { cardKind: 'selling', outletId: 'o', date: '2026-11-07', formatCode: 'display' } as const;

  it('prefers the more specific rule', () => {
    expect(selectRule([rule({ id: 'any' }), rule({ id: 'fmt', formatCode: 'display' })], req).id).toBe('fmt');
  });
  it('lets a customer contract override', () => {
    const rules = [rule({ id: 'std', formatCode: 'display' }), rule({ id: 'contract', customerId: 'c' })];
    expect(selectRule(rules, { ...req, customerId: 'c' }).id).toBe('contract');
  });
  it('honours priority and weekend rules', () => {
    expect(selectRule([rule({ id: 'a', formatCode: 'display' }), rule({ id: 'b', priority: 5 })], req).id).toBe('b');
    expect(selectRule([rule({ id: 'wk', daysOfWeek: [6] }), rule({ id: 'any' })], req).id).toBe('wk'); // Saturday
  });
  it('ignores expired cards and refuses missing rates', () => {
    expect(() => selectRule([rule({ effectiveTo: '2026-06-01' })], req)).toThrow(/No selling rate/);
  });
  it('rejects ambiguous rules', () => {
    expect(() => selectRule([rule({ id: 'a' }), rule({ id: 'b' })], req)).toThrow(/conflict/);
  });
});
