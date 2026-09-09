import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { APP_OPTIONS, configureApp } from './app.setup';

const PORT = Number(process.env.PORT) || 4321;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, APP_OPTIONS);
  configureApp(app);
  await app.listen(PORT);
  console.log(`guide-manager listening on http://localhost:${PORT}`);
}

// A failed boot must exit non-zero rather than leave a half-started process:
// the Mongo connection is a hard requirement, and an unhandled rejection here
// would otherwise print a stack trace and keep the process alive with nothing
// listening.
bootstrap().catch((err: unknown) => {
  console.error('guide-manager failed to start:', err);
  process.exit(1);
});
