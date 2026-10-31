import { BadRequestException, Body, Controller, DynamicModule, Get, HttpException, Inject, Module, NotFoundException, Param, Post, Req, UnprocessableEntityException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { PricingUnit, PricingError, RateRule, priceLine, selectRule } from '@mamp/pricing';
import { z } from 'zod';
import { APP_GUARD } from '@nestjs/core';
import { AuthController, AuthGuard, IDENTITY, IdentityProvider, Perm, UsersController, supabaseIdentity } from './auth';
import { DB, Db, rulesForOutlet } from './db';
import { RateCardsController } from './rate-cards';
import * as s from './schema';

const parse = <T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ code: 'VALIDATION', issues: r.error.issues });
  return r.data;
};

const outletDto = z.object({
  organizationId: z.string().uuid(), categoryId: z.string().uuid(), code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200), language: z.string().default('en'),
});

const num = z.number().nonnegative().optional();
const calculateDto = z.object({
  outletId: z.string().uuid(), formatCode: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  editionCode: z.string().optional(), timeBandCode: z.string().optional(), customerId: z.string().uuid().optional(),
  quantity: z.object({ widthCm: num, heightCm: num, columns: num, words: num, lines: num, insertions: num, durationSeconds: num, spots: num, periods: num }),
  premiumFixed: num, surchargePercent: num, discountPercent: z.number().min(0).max(100).optional(), taxPercent: num,
});

const toRule = ({ rule, card }: Awaited<ReturnType<typeof rulesForOutlet>>[number]): RateRule => ({
  id: rule.id, cardKind: card.kind as RateRule['cardKind'], effectiveFrom: card.effectiveFrom, effectiveTo: card.effectiveTo,
  outletId: card.outletId, formatCode: rule.formatCode, editionCode: rule.editionCode, timeBandCode: rule.timeBandCode,
  daysOfWeek: rule.daysOfWeek, customerId: rule.customerId, priority: rule.priority, unit: rule.unit as PricingUnit,
  rate: rule.rate, multiplier: rule.multiplier, minimumCharge: rule.minimumCharge,
});

@Controller('v1')
export class MediaController {
  constructor(@Inject(DB) private db: Db) {}

  @Perm('media.read') @Get('categories') categories(@Req() req: any) { return this.db.select().from(s.mediaCategories).where(eq(s.mediaCategories.tenantId, req.user.tenantId)); }
  @Perm('media.read') @Get('organizations') organizations(@Req() req: any) { return this.db.select().from(s.mediaOrganizations).where(eq(s.mediaOrganizations.tenantId, req.user.tenantId)); }
  @Perm('media.read') @Get('outlets') outlets(@Req() req: any) { return this.db.select().from(s.mediaOutlets).where(eq(s.mediaOutlets.tenantId, req.user.tenantId)); }

  @Perm('media.write') @Post('outlets')
  async createOutlet(@Req() req: any, @Body() body: unknown) {
    const dto = parse(outletDto, body);
    const tenantId: string = req.user.tenantId;
    const org = await this.db.select().from(s.mediaOrganizations).where(and(eq(s.mediaOrganizations.id, dto.organizationId), eq(s.mediaOrganizations.tenantId, tenantId)));
    const category = await this.db.select().from(s.mediaCategories).where(and(eq(s.mediaCategories.id, dto.categoryId), eq(s.mediaCategories.tenantId, tenantId)));
    if (!org.length || !category.length) throw new NotFoundException({ code: 'NOT_FOUND' });
    return this.db.transaction(async (tx) => {
      const dup = await tx.select().from(s.mediaOutlets).where(and(eq(s.mediaOutlets.tenantId, tenantId), eq(s.mediaOutlets.code, dto.code)));
      if (dup.length) throw new HttpException({ code: 'DUPLICATE_CODE' }, 409);
      const [row] = await tx.insert(s.mediaOutlets).values({ ...dto, tenantId }).returning();
      await tx.insert(s.auditLogs).values({ tenantId, entity: 'media_outlet', recordId: row.id, action: 'create', changedBy: req.user.id, newValue: row });
      return row;
    });
  }

  @Perm('ratecards.read') @Get('rate-cards') rateCards(@Req() req: any) { return this.db.select().from(s.rateCards).where(eq(s.rateCards.tenantId, req.user.tenantId)); }

  @Perm('ratecards.read') @Get('outlets/:id/rate-rules')
  async rules(@Req() req: any, @Param('id') id: string) {
    return (await rulesForOutlet(this.db, req.user.tenantId, parse(z.string().uuid(), id)))
      .filter((r) => r.card.status === 'published').map(toRule);
  }
}

@Controller('v1/pricing')
export class PricingController {
  constructor(@Inject(DB) private db: Db) {}

  /** Server-side price from published rate cards. Stores a snapshot of the result. */
  @Perm('pricing.calculate') @Post('calculate')
  async calculate(@Req() req: any, @Body() body: unknown) {
    const dto = parse(calculateDto, body);
    const tenantId: string = req.user.tenantId;
    const rows = await rulesForOutlet(this.db, tenantId, dto.outletId);
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
      const result = { sellingRuleId: selling.id, supplierRuleId, currency: 'PKR', breakdown };
      const [snap] = await this.db.insert(s.pricingSnapshots).values({ tenantId, request: dto, result }).returning();
      return { snapshotId: snap.id, ...result };
    } catch (e) {
      if (e instanceof PricingError) throw new UnprocessableEntityException({ code: e.code, message: e.message });
      throw e;
    }
  }
}

@Module({})
export class AppModule {
  static forDb(db: Db, identity: IdentityProvider = supabaseIdentity()): DynamicModule {
    return { module: AppModule, controllers: [AuthController, UsersController, MediaController, RateCardsController, PricingController], providers: [{ provide: DB, useValue: db }, { provide: IDENTITY, useValue: identity }, { provide: APP_GUARD, useValue: new AuthGuard(db, identity) }] };
  }
}
