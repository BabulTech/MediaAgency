import { BadRequestException, Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, HttpException, Inject, Injectable, Param, Patch, Post, Req, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { DB, Db } from './db';
import * as s from './schema';

export interface Principal { id: string; tenantId: string; customerId: string | null; organizationId: string | null; email: string; name: string; roles: string[]; permissions: string[] }

/** Identity operations, kept behind an interface so tests need no live Supabase project. */
export interface IdentityProvider {
  verify(token: string): Promise<string | null>; // returns the Supabase user id
  create(email: string, password: string): Promise<string>;
  setBanned(authId: string, banned: boolean): Promise<void>;
}
export const IDENTITY = Symbol('IDENTITY');

const VERIFY_CACHE_MS = 30_000;

export function supabaseIdentity(): IdentityProvider {
  const verified = new Map<string, { id: string; until: number }>();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = (path: string, method: string, body: unknown) => fetch(`${url}/auth/v1/admin/users${path}`, {
    method, headers: { apikey: service, Authorization: `Bearer ${service}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return {
    async verify(token) {
      const hit = verified.get(token);
      if (hit && hit.until > Date.now()) return hit.id;
      const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` } });
      if (!res.ok) { verified.delete(token); return null; }
      const { id } = (await res.json()) as { id: string };
      if (verified.size > 5000) verified.clear();
      verified.set(token, { id, until: Date.now() + VERIFY_CACHE_MS });
      return id;
    },
    async create(email, password) {
      const res = await admin('', 'POST', { email, password, email_confirm: true });
      if (res.status === 422) throw new HttpException({ code: 'DUPLICATE_EMAIL' }, 409);
      if (!res.ok) throw new HttpException({ code: 'IDENTITY_ERROR' }, 502);
      return ((await res.json()) as { id: string }).id;
    },
    async setBanned(authId, banned) {
      const res = await admin(`/${authId}`, 'PUT', { ban_duration: banned ? '876000h' : 'none' });
      if (!res.ok) throw new HttpException({ code: 'IDENTITY_ERROR' }, 502);
    },
  };
}

export const Perm = (permission: string) => SetMetadata('permission', permission);

async function principalFor(db: Db, user: typeof s.users.$inferSelect): Promise<Principal> {
  const rows = await db.select({ role: s.roles.code, permission: s.rolePermissions.permission }).from(s.userRoles)
    .innerJoin(s.roles, eq(s.userRoles.roleId, s.roles.id))
    .leftJoin(s.rolePermissions, eq(s.rolePermissions.roleId, s.roles.id))
    .where(eq(s.userRoles.userId, user.id));
  return {
    id: user.id, tenantId: user.tenantId, customerId: user.customerId, organizationId: user.organizationId, email: user.email, name: user.name,
    roles: [...new Set(rows.map((r) => r.role))],
    permissions: [...new Set(rows.flatMap((r) => (r.permission ? [r.permission] : [])))],
  };
}

@Injectable()
export class AuthGuard implements CanActivate {
  private reflector = new Reflector();
  constructor(private db: Db, private identity: IdentityProvider) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const authId = header?.startsWith('Bearer ') ? await this.identity.verify(header.slice(7)) : null;
    // A valid Supabase account alone is not enough: an agency must have provisioned it here.
    const [user] = authId ? await this.db.select().from(s.users).where(eq(s.users.authId, authId)) : [];
    if (!user?.active) throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
    req.user = await principalFor(this.db, user);
    const needed = this.reflector.getAllAndOverride<string>('permission', [ctx.getHandler(), ctx.getClass()]);
    if (needed && !req.user.permissions.includes(needed)) throw new ForbiddenException({ code: 'FORBIDDEN', permission: needed });
    return true;
  }
}

const userDto = z.object({ email: z.string().email().toLowerCase(), name: z.string().trim().min(1).max(200), password: z.string().min(10).max(200), roleCodes: z.array(z.string()).min(1), customerId: z.string().uuid().nullish(), organizationId: z.string().uuid().nullish() });
function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ code: 'VALIDATION', issues: r.error.issues });
  return r.data;
}

@Controller('v1/auth')
export class AuthController {
  @Get('me') me(@Req() req: any) { return req.user as Principal; }
}

@Controller('v1')
export class UsersController {
  constructor(@Inject(DB) private db: Db, @Inject(IDENTITY) private identity: IdentityProvider) {}

  @Perm('users.read') @Get('roles')
  roles(@Req() req: any) {
    return this.db.select().from(s.roles).where(eq(s.roles.tenantId, req.user.tenantId));
  }

  @Perm('users.read') @Get('users')
  async users(@Req() req: any) {
    const rows = await this.db.select().from(s.users).where(eq(s.users.tenantId, req.user.tenantId));
    return Promise.all(rows.map(async (u) => {
      const { roles } = await principalFor(this.db, u);
      return { id: u.id, email: u.email, name: u.name, active: u.active, roles };
    }));
  }

  @Perm('users.write') @Post('users')
  async createUser(@Req() req: any, @Body() body: unknown) {
    const dto = parse(userDto, body);
    const tenantId: string = req.user.tenantId;
    const roles = await this.db.select().from(s.roles).where(and(eq(s.roles.tenantId, tenantId), inArray(s.roles.code, dto.roleCodes)));
    if (roles.length !== new Set(dto.roleCodes).size) throw new BadRequestException({ code: 'UNKNOWN_ROLE' });
    // Without this, a user administrator could mint an account stronger than their own.
    if (roles.some((r) => r.code === 'super_admin') && !req.user.roles.includes('super_admin')) throw new ForbiddenException({ code: 'FORBIDDEN' });
    // Portal accounts must be tied to exactly the record they may see.
    const portalCustomer = dto.roleCodes.includes('customer_portal');
    const portalSupplier = dto.roleCodes.includes('supplier_portal');
    if (portalCustomer !== !!dto.customerId || portalSupplier !== !!dto.organizationId) throw new BadRequestException({ code: 'PORTAL_LINK_REQUIRED' });
    if (dto.customerId && !(await this.db.select().from(s.customers).where(and(eq(s.customers.id, dto.customerId), eq(s.customers.tenantId, tenantId)))).length) throw new BadRequestException({ code: 'UNKNOWN_CUSTOMER' });
    if (dto.organizationId && !(await this.db.select().from(s.mediaOrganizations).where(and(eq(s.mediaOrganizations.id, dto.organizationId), eq(s.mediaOrganizations.tenantId, tenantId)))).length) throw new BadRequestException({ code: 'UNKNOWN_ORGANIZATION' });
    if ((await this.db.select().from(s.users).where(eq(s.users.email, dto.email))).length) throw new HttpException({ code: 'DUPLICATE_EMAIL' }, 409);
    const authId = await this.identity.create(dto.email, dto.password);
    return this.db.transaction(async (tx) => {
      const [u] = await tx.insert(s.users).values({ tenantId, authId, email: dto.email, name: dto.name, customerId: dto.customerId, organizationId: dto.organizationId }).returning();
      await tx.insert(s.userRoles).values(roles.map((r) => ({ userId: u.id, roleId: r.id })));
      await tx.insert(s.auditLogs).values({ tenantId, entity: 'user', recordId: u.id, action: 'create', changedBy: req.user.id, newValue: { email: u.email, roles: dto.roleCodes } });
      return { id: u.id, email: u.email, name: u.name, active: u.active, roles: dto.roleCodes };
    });
  }

  @Perm('users.write') @Patch('users/:id/active')
  async setActive(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const { active } = parse(z.object({ active: z.boolean() }), body);
    const userId = parse(z.string().uuid(), id);
    if (userId === req.user.id) throw new BadRequestException({ code: 'CANNOT_CHANGE_SELF' });
    return this.db.transaction(async (tx) => {
      const [u] = await tx.update(s.users).set({ active }).where(and(eq(s.users.id, userId), eq(s.users.tenantId, req.user.tenantId))).returning();
      if (!u) throw new HttpException({ code: 'NOT_FOUND' }, 404);
      await tx.insert(s.auditLogs).values({ tenantId: req.user.tenantId, entity: 'user', recordId: userId, action: active ? 'activate' : 'deactivate', changedBy: req.user.id });
      if (u.authId) await this.identity.setBanned(u.authId, !active);
      return { id: u.id, active: u.active };
    });
  }
}
