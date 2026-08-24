import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

const PORT = Number(process.env.PORT) || 4321;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
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
