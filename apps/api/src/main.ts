import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { openDb } from './db';

async function main() {
  const app = await NestFactory.create(AppModule.forDb(await openDb()));
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });
  // Loopback only until RLS, rate limiting and TLS are in place (see docs/plan.md).
  await app.listen(Number(process.env.API_PORT ?? 4000), '127.0.0.1');
}
main();
