import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { BadRequestException, Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, HttpCode, HttpException, Inject, Injectable, Param, Patch, Post, Req, Res, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { DB, Db } from './db';
import * as s from './schema';

const scrypt = promisify(scryptCb) as (p: string, salt: Buffer, len: number) => Promise<Buffer>;
export const SESSION_COOKIE = 'mamp_session';
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

export interface Principal { id: string; tenantId: string; email: string; name: string; roles: string[]; permissions: string[] }

export const Public = () => SetMetadata('public', true);
export const Perm = (permission: string) => SetMetadata('permission', permission);

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(await scrypt(password, Buffer.from(salt, 'hex'), 64), Buffer.from(hash, 'hex'));
}
const DUMMY_HASH = `${'0'.repeat(32)}:${'0'.repeat(128)}`; // keeps unknown-email logins as slow as real ones
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const cookieValue = (header: string | undefined) =>
  header?.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);

async function principalFor(db: Db, user: typeof s.users.$inferSelect): Promise<Principal> {
  const rows = await db.select({ role: s.roles.code, permission: s.rolePermissions.permission }).from(s.userRoles)
    .innerJoin(s.roles, eq(s.userRoles.roleId, s.roles.id))
    .leftJoin(s.rolePermissions, eq(s.rolePermissions.roleId, s.roles.id))
    .where(eq(s.userRoles.userId, user.id));
  return {
    id: user.id, tenantId: user.tenantId, email: user.email, name: user.name,
    roles: [...new Set(rows.map((r) => r.role))],
    permissions: [...new Set(rows.flatMap((r) => (r.permission ? [r.permission] : [])))],
  };
}

@Injectable()
export class AuthGuard implements CanActivate {
  private reflector = new Reflector();
  constructor(private db: Db) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('public', targets)) return true;
    const req = ctx.switchToHttp().getRequest();
    const token = cookieValue(req.headers.cookie);
    if (!token) throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
    const [row] = await this.db.select({ user: s.users }).from(s.userSessions)
      .innerJoin(s.users, eq(s.userSessions.userId, s.users.id))
      .where(and(eq(s.userSessions.tokenHash, tokenHash(token)), isNull(s.userSessions.revokedAt), gt(s.userSessions.expiresAt, new Date())));
    if (!row?.user.active) throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
    req.user = await principalFor(this.db, row.user);
    const needed = this.reflector.getAllAndOverride<string>('permission', targets);
    if (needed && !req.user.permissions.includes(needed)) throw new ForbiddenException({ code: 'FORBIDDEN', permission: needed });
    return true;
  }
}

const loginDto = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1).max(200) });
const userDto = z.object({ email: z.string().email().toLowerCase(), name: z.string().trim().min(1).max(200), password: z.string().min(10).max(200), roleCodes: z.array(z.string()).min(1) });
function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ code: 'VALIDATION', issues: r.error.issues });
  return r.data;
}

@Controller('v1/auth')
export class AuthController {
  constructor(@Inject(DB) private db: Db) {}

  @Public() @Post('login') @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: any) {
    const { email, password } = parse(loginDto, body);
    const [user] = await this.db.select().from(s.users).where(eq(s.users.email, email));
    const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    const denied = new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    if (!user || !user.active) throw denied;
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new HttpException({ code: 'ACCOUNT_LOCKED' }, 423);
    if (!valid) {
      const failed = user.failedLogins + 1;
      const lock = failed >= MAX_FAILURES;
      await this.db.update(s.users).set({ failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MS) : null }).where(eq(s.users.id, user.id));
      throw denied;
    }
    await this.db.update(s.users).set({ failedLogins: 0, lockedUntil: null }).where(eq(s.users.id, user.id));
    const token = randomBytes(32).toString('base64url');
    await this.db.insert(s.userSessions).values({ userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + SESSION_MS) });
    await this.db.insert(s.auditLogs).values({ tenantId: user.tenantId, entity: 'user', recordId: user.id, action: 'login', changedBy: user.id });
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: SESSION_MS, path: '/' });
    return principalFor(this.db, user);
  }

  @Post('logout') @HttpCode(204)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: any) {
    await this.db.update(s.userSessions).set({ revokedAt: new Date() }).where(eq(s.userSessions.tokenHash, tokenHash(cookieValue(req.headers.cookie)!)));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me') me(@Req() req: any) { return req.user as Principal; }
}

@Controller('v1')
export class UsersController {
  constructor(@Inject(DB) private db: Db) {}

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
    const passwordHash = await hashPassword(dto.password);
    return this.db.transaction(async (tx) => {
      if ((await tx.select().from(s.users).where(eq(s.users.email, dto.email))).length) throw new HttpException({ code: 'DUPLICATE_EMAIL' }, 409);
      const [u] = await tx.insert(s.users).values({ tenantId, email: dto.email, name: dto.name, passwordHash }).returning();
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
      if (!active) await tx.update(s.userSessions).set({ revokedAt: new Date() }).where(and(eq(s.userSessions.userId, userId), isNull(s.userSessions.revokedAt)));
      await tx.insert(s.auditLogs).values({ tenantId: req.user.tenantId, entity: 'user', recordId: userId, action: active ? 'activate' : 'deactivate', changedBy: req.user.id });
      return { id: u.id, active: u.active };
    });
  }
}
