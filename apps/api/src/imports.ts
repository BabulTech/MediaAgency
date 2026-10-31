import { BadRequestException, Body, Controller, Inject, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Perm } from './auth';
import { customerDto, nextNumber } from './crm';
import { DB, Db } from './db';
import * as s from './schema';

const bodyDto = z.object({ rows: z.array(z.record(z.unknown())).min(1).max(5000), dryRun: z.boolean().default(true) });
const orgDto = z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(200) });
const outletDto = orgDto.extend({ categoryCode: z.string().trim().min(1), organizationCode: z.string().trim().min(1), language: z.string().trim().default('en') });
type RowError = { row: number; message: string };
const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');

/** All-or-nothing: a dry run reports every problem, and a real run saves nothing unless all rows pass. */
@Controller('v1/import')
export class ImportController {
  constructor(@Inject(DB) private db: Db) {}

  private finish(errors: RowError[], count: number, dryRun: boolean) {
    if (errors.length && !dryRun) throw new BadRequestException({ code: 'IMPORT_INVALID', errors });
    return { valid: count - errors.length, errors, imported: 0 };
  }

  @Perm('sales.write') @Post('customers')
  async customers(@Req() req: any, @Body() body: unknown) {
    const parsed = bodyDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION' });
    const { rows, dryRun } = parsed.data;
    const tenantId: string = req.user.tenantId;
    const existing = new Set((await this.db.select({ name: s.customers.name }).from(s.customers).where(eq(s.customers.tenantId, tenantId))).map((c) => c.name.toLowerCase()));
    const errors: RowError[] = [];
    const good: z.infer<typeof customerDto>[] = [];
    rows.forEach((r, i) => {
      const p = customerDto.safeParse(r);
      if (!p.success) { errors.push({ row: i + 1, message: issues(p.error) }); return; }
      const key = p.data.name.toLowerCase();
      if (existing.has(key)) { errors.push({ row: i + 1, message: `Duplicate customer: ${p.data.name}` }); return; }
      existing.add(key); good.push(p.data);
    });
    const result = this.finish(errors, rows.length, dryRun);
    if (dryRun) return result;
    await this.db.transaction(async (tx) => {
      for (const c of good) {
        const n = await nextNumber(tx, tenantId, 'customer');
        await tx.insert(s.customers).values({ ...c, tenantId, number: `CUST-${String(n).padStart(5, '0')}`, salesOwnerId: req.user.id });
      }
      await tx.insert(s.auditLogs).values({ tenantId, entity: 'import', recordId: req.user.id, action: 'customers', changedBy: req.user.id, newValue: { count: good.length } });
    });
    return { ...result, imported: good.length };
  }

  @Perm('media.write') @Post('organizations')
  async organizations(@Req() req: any, @Body() body: unknown) {
    const parsed = bodyDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION' });
    const { rows, dryRun } = parsed.data;
    const tenantId: string = req.user.tenantId;
    const codes = new Set((await this.db.select({ code: s.mediaOrganizations.code }).from(s.mediaOrganizations).where(eq(s.mediaOrganizations.tenantId, tenantId))).map((o) => o.code));
    const errors: RowError[] = [];
    const good: z.infer<typeof orgDto>[] = [];
    rows.forEach((r, i) => {
      const p = orgDto.safeParse(r);
      if (!p.success) errors.push({ row: i + 1, message: issues(p.error) });
      else if (codes.has(p.data.code)) errors.push({ row: i + 1, message: `Duplicate code: ${p.data.code}` });
      else { codes.add(p.data.code); good.push(p.data); }
    });
    const result = this.finish(errors, rows.length, dryRun);
    if (dryRun) return result;
    await this.db.insert(s.mediaOrganizations).values(good.map((o) => ({ ...o, tenantId })));
    return { ...result, imported: good.length };
  }

  @Perm('media.write') @Post('outlets')
  async outlets(@Req() req: any, @Body() body: unknown) {
    const parsed = bodyDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION' });
    const { rows, dryRun } = parsed.data;
    const tenantId: string = req.user.tenantId;
    const [cats, orgs, outlets] = await Promise.all([
      this.db.select().from(s.mediaCategories).where(eq(s.mediaCategories.tenantId, tenantId)),
      this.db.select().from(s.mediaOrganizations).where(eq(s.mediaOrganizations.tenantId, tenantId)),
      this.db.select().from(s.mediaOutlets).where(eq(s.mediaOutlets.tenantId, tenantId)),
    ]);
    const codes = new Set(outlets.map((o) => o.code));
    const errors: RowError[] = [];
    const good: (typeof s.mediaOutlets.$inferInsert)[] = [];
    rows.forEach((r, i) => {
      const p = outletDto.safeParse(r);
      if (!p.success) { errors.push({ row: i + 1, message: issues(p.error) }); return; }
      const cat = cats.find((c) => c.code === p.data.categoryCode);
      const org = orgs.find((o) => o.code === p.data.organizationCode);
      if (!cat) errors.push({ row: i + 1, message: `Unknown category: ${p.data.categoryCode}` });
      else if (!org) errors.push({ row: i + 1, message: `Unknown organization: ${p.data.organizationCode}` });
      else if (codes.has(p.data.code)) errors.push({ row: i + 1, message: `Duplicate code: ${p.data.code}` });
      else { codes.add(p.data.code); good.push({ tenantId, code: p.data.code, name: p.data.name, language: p.data.language, categoryId: cat.id, organizationId: org.id }); }
    });
    const result = this.finish(errors, rows.length, dryRun);
    if (dryRun) return result;
    await this.db.insert(s.mediaOutlets).values(good);
    return { ...result, imported: good.length };
  }
}
