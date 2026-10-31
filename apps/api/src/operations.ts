import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, ConflictException, Controller, Get, HttpException, Inject, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Perm } from './auth';
import { nextNumber } from './crm';
import { DB, Db } from './db';
import * as s from './schema';

/** File access, behind an interface so tests need no live Supabase project. */
export interface FileStore {
  uploadUrl(path: string): Promise<string>;
  downloadUrl(path: string): Promise<string>;
}
export const FILES = Symbol('FILES');
export const BUCKET = 'media-files';

export function supabaseFiles(): FileStore {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sign = async (route: string, body: unknown) => {
    const res = await fetch(`${url}/storage/v1/object/${route}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new HttpException({ code: 'STORAGE_ERROR' }, 502);
    return res.json() as Promise<{ url?: string; signedURL?: string }>;
  };
  return {
    uploadUrl: async (path) => `${url}/storage/v1${(await sign(`upload/sign/${BUCKET}/${path}`, {})).url}`,
    downloadUrl: async (path) => `${url}/storage/v1${(await sign(`sign/${BUCKET}/${path}`, { expiresIn: 300 })).signedURL}`,
  };
}

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ code: 'VALIDATION', issues: r.error.issues });
  return r.data;
}
const uuid = (id: string) => parse(z.string().uuid(), id);
const NEXT: Record<string, string[]> = {
  submitted: ['confirmed', 'rejected', 'reschedule_requested', 'cancelled'],
  reschedule_requested: ['confirmed', 'cancelled'],
  confirmed: ['executed', 'cancelled'],
};
const PLACEMENT_FOR: Record<string, string> = { confirmed: 'booked', executed: 'executed', rejected: 'pending', cancelled: 'pending' };
const statusDto = z.object({ status: z.string(), supplierReference: z.string().trim().max(100).optional() });
const reviewDto = z.object({ approved: z.boolean(), comment: z.string().trim().max(1000).optional() });
const fileDto = z.object({ path: z.string().min(1), fileName: z.string().trim().min(1).max(200) });
const proofDto = fileDto.extend({ kind: z.enum(['publication', 'telecast_certificate', 'broadcast_log', 'screenshot', 'video', 'supplier_confirmation', 'other']), actualDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), actualPage: z.string().trim().max(40).optional() });

@Controller('v1')
export class OperationsController {
  constructor(@Inject(DB) private db: Db, @Inject(FILES) private files: FileStore) {}

  private audit(tx: Pick<Db, 'insert'>, req: any, entity: string, recordId: string, action: string, newValue?: unknown) {
    return tx.insert(s.auditLogs).values({ tenantId: req.user.tenantId, entity, recordId, action, changedBy: req.user.id, newValue });
  }
  private async placement(tenantId: string, id: string) {
    const [p] = await this.db.select().from(s.placements).where(and(eq(s.placements.id, uuid(id)), eq(s.placements.tenantId, tenantId)));
    if (!p) throw new NotFoundException({ code: 'NOT_FOUND' });
    return p;
  }
  /** A client may only register a file under the path this API issued for that placement. */
  private checkPath(tenantId: string, placementId: string, path: string) {
    if (!path.startsWith(`${tenantId}/${placementId}/`) || path.includes('..')) throw new BadRequestException({ code: 'BAD_PATH' });
  }

  @Perm('ops.read') @Get('bookings')
  bookings(@Req() req: any) {
    return this.db.select({ booking: s.supplierBookings, outletName: s.mediaOutlets.name }).from(s.supplierBookings)
      .innerJoin(s.mediaOutlets, eq(s.supplierBookings.outletId, s.mediaOutlets.id))
      .where(eq(s.supplierBookings.tenantId, req.user.tenantId)).orderBy(desc(s.supplierBookings.createdAt)).limit(200);
  }

  @Perm('ops.read') @Get('placements/:id')
  async getPlacement(@Req() req: any, @Param('id') id: string) {
    const placement = await this.placement(req.user.tenantId, id);
    const [bookings, creatives, proofs] = await Promise.all([
      this.db.select().from(s.supplierBookings).where(eq(s.supplierBookings.placementId, placement.id)).orderBy(desc(s.supplierBookings.createdAt)),
      this.db.select().from(s.creativeAssets).where(eq(s.creativeAssets.placementId, placement.id)).orderBy(desc(s.creativeAssets.version)),
      this.db.select().from(s.executionProofs).where(eq(s.executionProofs.placementId, placement.id)).orderBy(desc(s.executionProofs.createdAt)),
    ]);
    return { placement, bookings, creatives, proofs };
  }

  /** Bookings are never treated as guaranteed: a new one always starts as submitted. */
  @Perm('ops.write') @Post('placements/:id/bookings')
  async book(@Req() req: any, @Param('id') id: string) {
    const p = await this.placement(req.user.tenantId, id);
    const [order] = await this.db.select().from(s.orders).where(eq(s.orders.id, p.orderId));
    if (order.status !== 'confirmed') throw new ConflictException({ code: 'ORDER_NOT_CONFIRMED' });
    return this.db.transaction(async (tx) => {
      const live = await tx.select().from(s.supplierBookings).where(and(eq(s.supplierBookings.placementId, p.id), inArray(s.supplierBookings.status, ['submitted', 'reschedule_requested', 'confirmed', 'executed'])));
      if (live.length) throw new ConflictException({ code: 'ALREADY_BOOKED' });
      const n = await nextNumber(tx, p.tenantId, 'booking');
      const [b] = await tx.insert(s.supplierBookings).values({
        tenantId: p.tenantId, number: `BKG-${new Date().getFullYear()}-${String(n).padStart(5, '0')}`, placementId: p.id, orderId: p.orderId,
        outletId: p.outletId, requestedDate: p.date, purchasePrice: p.supplierCost,
      }).returning();
      await this.audit(tx, req, 'booking', b.id, 'create');
      return b;
    });
  }

  @Perm('ops.write') @Post('bookings/:id/status')
  async setStatus(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = parse(statusDto, body);
    return this.db.transaction(async (tx) => {
      const allowedFrom = Object.keys(NEXT).filter((k) => NEXT[k].includes(dto.status));
      if (!allowedFrom.length) throw new BadRequestException({ code: 'BAD_STATUS' });
      const [b] = await tx.update(s.supplierBookings).set({ status: dto.status, ...(dto.supplierReference ? { supplierReference: dto.supplierReference } : {}) })
        .where(and(eq(s.supplierBookings.id, uuid(id)), eq(s.supplierBookings.tenantId, req.user.tenantId), inArray(s.supplierBookings.status, allowedFrom))).returning();
      if (!b) throw new ConflictException({ code: 'INVALID_STATUS' });
      if (PLACEMENT_FOR[dto.status]) await tx.update(s.placements).set({ status: PLACEMENT_FOR[dto.status] }).where(eq(s.placements.id, b.placementId));
      await this.audit(tx, req, 'booking', b.id, dto.status, dto);
      return b;
    });
  }

  @Perm('ops.write') @Post('placements/:id/upload-url')
  async uploadUrl(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const p = await this.placement(req.user.tenantId, id);
    const { fileName } = parse(z.object({ fileName: z.string().min(1).max(200) }), body);
    const path = `${p.tenantId}/${p.id}/${randomUUID()}-${fileName.replace(/[^\w.-]/g, '_')}`;
    return { path, url: await this.files.uploadUrl(path) };
  }

  @Perm('ops.read') @Get('files/download')
  async download(@Req() req: any, @Query('path') path: string) {
    if (!path?.startsWith(`${req.user.tenantId}/`) || path.includes('..')) throw new NotFoundException({ code: 'NOT_FOUND' });
    return { url: await this.files.downloadUrl(path) };
  }

  @Perm('ops.write') @Post('placements/:id/creatives')
  async addCreative(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const p = await this.placement(req.user.tenantId, id);
    const dto = parse(fileDto, body);
    this.checkPath(p.tenantId, p.id, dto.path);
    return this.db.transaction(async (tx) => {
      const [{ top }] = await tx.select({ top: sql<number>`coalesce(max(${s.creativeAssets.version}), 0)` }).from(s.creativeAssets).where(eq(s.creativeAssets.placementId, p.id));
      const [c] = await tx.insert(s.creativeAssets).values({ tenantId: p.tenantId, placementId: p.id, version: Number(top) + 1, fileName: dto.fileName, storagePath: dto.path, uploadedBy: req.user.id }).returning();
      await this.audit(tx, req, 'creative', c.id, 'upload');
      return c;
    });
  }

  @Perm('ops.verify') @Post('creatives/:id/review')
  async reviewCreative(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const { approved, comment } = parse(reviewDto, body);
    return this.db.transaction(async (tx) => {
      const [c] = await tx.update(s.creativeAssets).set({ status: approved ? 'approved' : 'rejected', comment })
        .where(and(eq(s.creativeAssets.id, uuid(id)), eq(s.creativeAssets.tenantId, req.user.tenantId), eq(s.creativeAssets.status, 'pending'))).returning();
      if (!c) throw new ConflictException({ code: 'INVALID_STATUS' });
      await this.audit(tx, req, 'creative', c.id, c.status, { comment });
      return c;
    });
  }

  @Perm('ops.write') @Post('placements/:id/proofs')
  async addProof(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const p = await this.placement(req.user.tenantId, id);
    const dto = parse(proofDto, body);
    this.checkPath(p.tenantId, p.id, dto.path);
    return this.db.transaction(async (tx) => {
      const [r] = await tx.insert(s.executionProofs).values({ tenantId: p.tenantId, placementId: p.id, kind: dto.kind, fileName: dto.fileName, storagePath: dto.path, actualDate: dto.actualDate, actualPage: dto.actualPage, uploadedBy: req.user.id }).returning();
      await this.audit(tx, req, 'proof', r.id, 'upload');
      return r;
    });
  }

  /** The only route to verified: a person reviewing proof, never the passing of a date. */
  @Perm('ops.verify') @Post('proofs/:id/review')
  async reviewProof(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const { approved, comment } = parse(reviewDto, body);
    return this.db.transaction(async (tx) => {
      const [r] = await tx.update(s.executionProofs).set({ status: approved ? 'verified' : 'rejected', comment, verifiedBy: req.user.id })
        .where(and(eq(s.executionProofs.id, uuid(id)), eq(s.executionProofs.tenantId, req.user.tenantId), eq(s.executionProofs.status, 'uploaded'))).returning();
      if (!r) throw new ConflictException({ code: 'INVALID_STATUS' });
      if (approved) {
        const [p] = await tx.update(s.placements).set({ status: 'verified' }).where(and(eq(s.placements.id, r.placementId), eq(s.placements.status, 'executed'))).returning();
        if (!p) throw new ConflictException({ code: 'NOT_EXECUTED' });
      }
      await this.audit(tx, req, 'proof', r.id, r.status, { comment });
      return r;
    });
  }
}
