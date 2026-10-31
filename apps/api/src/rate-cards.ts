import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Perm } from './auth';
import { DB, Db } from './db';
import * as s from './schema';

const UNITS = ['per_sq_cm', 'per_sq_inch', 'per_column_cm', 'per_word', 'per_line', 'fixed', 'per_second', 'per_minute', 'per_spot', 'per_ticker', 'per_ticker_second', 'per_day', 'per_week', 'per_month', 'per_cpm', 'per_cpc', 'per_cpv'] as const;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amount = z.string().regex(/^\d+(\.\d{1,4})?$/);
// Forms and CSV files send blank cells as empty strings.
const optional = <T extends z.ZodTypeAny>(t: T) => z.preprocess((v) => (v === '' ? null : v), t.nullish()).transform((v) => v ?? null);

const cardDto = z.object({
  outletId: z.string().uuid(), name: z.string().trim().min(1).max(200), kind: z.enum(['selling', 'supplier']),
  effectiveFrom: day, effectiveTo: optional(day), isSample: z.boolean().default(false),
});
const ruleDto = z.object({
  formatCode: optional(z.string().max(60)), editionCode: optional(z.string().max(60)), timeBandCode: optional(z.string().max(60)),
  priority: z.coerce.number().int().default(0), unit: z.enum(UNITS), rate: amount,
  multiplier: optional(amount), minimumCharge: optional(amount),
});
const bulkDto = z.object({ rules: z.array(z.unknown()).min(1).max(5000) });
const cloneDto = z.object({ effectiveFrom: day });

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ code: 'VALIDATION', issues: r.error.issues });
  return r.data;
}
const uuid = (id: string) => parse(z.string().uuid(), id);
const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

@Controller('v1/rate-cards')
export class RateCardsController {
  constructor(@Inject(DB) private db: Db) {}

  private async card(tenantId: string, id: string) {
    const [c] = await this.db.select().from(s.rateCards).where(and(eq(s.rateCards.id, uuid(id)), eq(s.rateCards.tenantId, tenantId)));
    if (!c) throw new NotFoundException({ code: 'NOT_FOUND' });
    return c;
  }
  private async draft(tenantId: string, id: string) {
    const c = await this.card(tenantId, id);
    // Published prices are immutable; a change needs a new version.
    if (c.status !== 'draft') throw new ConflictException({ code: 'NOT_DRAFT' });
    return c;
  }
  private audit(tx: Pick<Db, 'insert'>, req: any, recordId: string, action: string, newValue?: unknown) {
    return tx.insert(s.auditLogs).values({ tenantId: req.user.tenantId, entity: 'rate_card', recordId, action, changedBy: req.user.id, newValue });
  }

  @Perm('ratecards.read') @Get(':id')
  async get(@Req() req: any, @Param('id') id: string) {
    const card = await this.card(req.user.tenantId, id);
    const rules = await this.db.select().from(s.rateRules).where(eq(s.rateRules.rateCardId, card.id));
    const history = await this.db.select().from(s.auditLogs)
      .where(and(eq(s.auditLogs.tenantId, req.user.tenantId), eq(s.auditLogs.entity, 'rate_card'), eq(s.auditLogs.recordId, card.id)));
    return { card, rules, history };
  }

  @Perm('ratecards.write') @Post()
  async create(@Req() req: any, @Body() body: unknown) {
    const dto = parse(cardDto, body);
    const tenantId: string = req.user.tenantId;
    const [outlet] = await this.db.select().from(s.mediaOutlets).where(and(eq(s.mediaOutlets.id, dto.outletId), eq(s.mediaOutlets.tenantId, tenantId)));
    if (!outlet) throw new NotFoundException({ code: 'NOT_FOUND' });
    return this.db.transaction(async (tx) => {
      const [c] = await tx.insert(s.rateCards).values({ ...dto, tenantId }).returning();
      await this.audit(tx, req, c.id, 'create', dto);
      return c;
    });
  }

  @Perm('ratecards.write') @Post(':id/rules')
  async addRule(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const c = await this.draft(req.user.tenantId, id);
    const dto = parse(ruleDto, body);
    return this.db.transaction(async (tx) => {
      const [r] = await tx.insert(s.rateRules).values({ ...dto, tenantId: c.tenantId, rateCardId: c.id }).returning();
      await this.audit(tx, req, c.id, 'add_rule', dto);
      return r;
    });
  }

  /** All rows are checked first, so one bad row imports nothing. */
  @Perm('ratecards.write') @Post(':id/rules/bulk')
  async bulk(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const c = await this.draft(req.user.tenantId, id);
    const rows = parse(bulkDto, body).rules.map((r) => ruleDto.safeParse(r));
    const errors = rows.flatMap((r, i) => (r.success ? [] : [{ row: i + 1, issues: r.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`) }]));
    if (errors.length) throw new BadRequestException({ code: 'IMPORT_INVALID', errors });
    return this.db.transaction(async (tx) => {
      await tx.insert(s.rateRules).values(rows.map((r) => ({ ...r.data!, tenantId: c.tenantId, rateCardId: c.id })));
      await this.audit(tx, req, c.id, 'import_rules', { count: rows.length });
      return { imported: rows.length };
    });
  }

  @Perm('ratecards.write') @Delete(':id/rules/:ruleId')
  async removeRule(@Req() req: any, @Param('id') id: string, @Param('ruleId') ruleId: string) {
    const c = await this.draft(req.user.tenantId, id);
    return this.db.transaction(async (tx) => {
      const gone = await tx.delete(s.rateRules).where(and(eq(s.rateRules.id, uuid(ruleId)), eq(s.rateRules.rateCardId, c.id))).returning();
      if (!gone.length) throw new NotFoundException({ code: 'NOT_FOUND' });
      await this.audit(tx, req, c.id, 'remove_rule', gone[0]);
      return { removed: true };
    });
  }

  /** Publishing a newer version closes the previous one the day before, so the two never overlap. */
  @Perm('ratecards.approve') @Post(':id/publish')
  async publish(@Req() req: any, @Param('id') id: string) {
    const c = await this.draft(req.user.tenantId, id);
    const rules = await this.db.select({ n: sql<number>`count(*)` }).from(s.rateRules).where(eq(s.rateRules.rateCardId, c.id));
    if (!Number(rules[0].n)) throw new ConflictException({ code: 'NO_RULES' });
    return this.db.transaction(async (tx) => {
      if (c.previousVersionId) {
        await tx.update(s.rateCards).set({ effectiveTo: dayBefore(c.effectiveFrom) }).where(eq(s.rateCards.id, c.previousVersionId));
      }
      const [p] = await tx.update(s.rateCards).set({ status: 'published' }).where(eq(s.rateCards.id, c.id)).returning();
      await this.audit(tx, req, c.id, 'publish');
      return p;
    });
  }

  @Perm('ratecards.approve') @Post(':id/expire')
  async expire(@Req() req: any, @Param('id') id: string) {
    const c = await this.card(req.user.tenantId, id);
    if (c.status !== 'published') throw new ConflictException({ code: 'NOT_PUBLISHED' });
    return this.db.transaction(async (tx) => {
      const [e] = await tx.update(s.rateCards).set({ status: 'expired' }).where(eq(s.rateCards.id, c.id)).returning();
      await this.audit(tx, req, c.id, 'expire');
      return e;
    });
  }

  /** Copies a card and its rules into a new draft version. */
  @Perm('ratecards.write') @Post(':id/new-version')
  async newVersion(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const c = await this.card(req.user.tenantId, id);
    const { effectiveFrom } = parse(cloneDto, body);
    if (effectiveFrom <= c.effectiveFrom) throw new BadRequestException({ code: 'DATE_NOT_LATER' });
    const rules = await this.db.select().from(s.rateRules).where(eq(s.rateRules.rateCardId, c.id));
    return this.db.transaction(async (tx) => {
      const [n] = await tx.insert(s.rateCards).values({
        tenantId: c.tenantId, outletId: c.outletId, name: c.name, kind: c.kind, currency: c.currency, isSample: c.isSample,
        effectiveFrom, version: c.version + 1, previousVersionId: c.id,
      }).returning();
      if (rules.length) await tx.insert(s.rateRules).values(rules.map(({ id: _id, ...r }) => ({ ...r, rateCardId: n.id })));
      await this.audit(tx, req, n.id, 'new_version', { from: c.id });
      return n;
    });
  }
}
