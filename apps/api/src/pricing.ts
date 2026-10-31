import { UnprocessableEntityException } from '@nestjs/common';
import { PricingError, PricingUnit, Quantity, RateRule, priceLine, selectRule } from './pricing-engine';
import { Db, rulesForOutlet } from './db';

export const toRule = ({ rule, card }: Awaited<ReturnType<typeof rulesForOutlet>>[number]): RateRule => ({
  id: rule.id, cardKind: card.kind as RateRule['cardKind'], effectiveFrom: card.effectiveFrom, effectiveTo: card.effectiveTo,
  outletId: card.outletId, formatCode: rule.formatCode, editionCode: rule.editionCode, timeBandCode: rule.timeBandCode,
  daysOfWeek: rule.daysOfWeek, customerId: rule.customerId, priority: rule.priority, unit: rule.unit as PricingUnit,
  rate: rule.rate, multiplier: rule.multiplier, minimumCharge: rule.minimumCharge,
});

/** Removes purchase costs and margin for anyone without cost.read. */
export function redactCost<T extends { supplierCost?: unknown; snapshot?: any }>(user: { permissions: string[] }, row: T): T {
  if (user.permissions.includes('cost.read')) return row;
  const { supplierCost: _c, snapshot: _s, ...rest } = row;
  return rest as T;
}

export interface PriceRequest {
  outletId: string; formatCode: string; date: string; editionCode?: string; timeBandCode?: string; customerId?: string;
  quantity: Quantity; premiumFixed?: number; surchargePercent?: number; discountPercent?: number; taxPercent?: number;
}

/** Prices one placement from published rate cards. The result is the snapshot stored on lines. */
export async function priceRequest(db: Db, tenantId: string, dto: PriceRequest) {
  const rows = await rulesForOutlet(db, tenantId, dto.outletId);
  const rules = rows.filter((r) => r.card.status === 'published').map(toRule);
  try {
    const request = { outletId: dto.outletId, date: dto.date, formatCode: dto.formatCode, editionCode: dto.editionCode, timeBandCode: dto.timeBandCode, customerId: dto.customerId };
    const selling = selectRule(rules, { ...request, cardKind: 'selling' });
    const line = (r: RateRule) => ({ unit: r.unit, rate: r.rate, multiplier: r.multiplier ?? 1, minimumCharge: r.minimumCharge ?? 0, quantity: dto.quantity });
    let supplierCost: string | undefined;
    let supplierRuleId: string | null = null;
    try {
      const supplier = selectRule(rules, { ...request, cardKind: 'supplier' });
      supplierCost = priceLine(line(supplier)).net; supplierRuleId = supplier.id;
    } catch (e) { if (!(e instanceof PricingError) || e.code !== 'NO_RATE') throw e; }
    const breakdown = priceLine({ ...line(selling), premiumFixed: dto.premiumFixed, surchargePercent: dto.surchargePercent, discountPercent: dto.discountPercent, taxPercent: dto.taxPercent, supplierCost });
    return { sellingRuleId: selling.id, supplierRuleId, currency: 'PKR', rate: selling.rate, unit: selling.unit, breakdown };
  } catch (e) {
    if (e instanceof PricingError) throw new UnprocessableEntityException({ code: e.code, message: e.message });
    throw e;
  }
}
