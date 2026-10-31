import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { securityMiddleware } from './http-security';
import { openDb } from './db';

async function main() {
  const app = await NestFactory.create(AppModule.forDb(await openDb()));
  app.use(securityMiddleware());
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });
  // Loopback by default; production sets API_HOST behind a TLS proxy.
  await app.listen(Number(process.env.API_PORT ?? 4000), process.env.API_HOST ?? '127.0.0.1');
}
main();
