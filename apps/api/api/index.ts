import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { openDb } from '../src/db';
import { securityMiddleware } from '../src/http-security';

let server: Promise<(req: unknown, res: unknown) => void> | undefined;

async function boot() {
  const app = await NestFactory.create(AppModule.forDb(await openDb()), { logger: ['error', 'warn'] });
  app.use(securityMiddleware());
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
  await app.init();
  return app.getHttpAdapter().getInstance();
}

/** Vercel function entry. The app is reused between requests while the function stays warm. */
export default async function handler(req: unknown, res: unknown) {
  server ??= boot();
  (await server)(req, res);
}
