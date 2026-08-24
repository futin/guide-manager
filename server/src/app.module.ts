import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { GuidesModule } from './guides/guides.module';
import { HealthController } from './health/health.controller';
import { ProgressModule } from './progress/progress.module';
import { RenderModule } from './render/render.module';
import { clientDistModules } from './static';

export const DEFAULT_MONGO_URL = 'mongodb://localhost:27017/guide-manager';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URL') ?? DEFAULT_MONGO_URL,
        // Mongo is a hard requirement: no database, no server. Nest's default is
        // to retry forever, which would leave the process up with a dead
        // database and nothing saying so — so the attempts are bounded, and when
        // they run out Nest's own ExceptionHandler logs the Mongoose error and
        // the process exits non-zero. (main.ts's catch never sees this one; it
        // covers the other ways bootstrap can fail.)
        retryAttempts: 2,
        retryDelay: 1000,
        // Without this the driver spends its full 30s server-selection window
        // per attempt, so an unreachable database takes over a minute to fail.
        // 5s is long enough for a container that is still starting.
        serverSelectionTimeoutMS: 5000
      })
    }),
    GuidesModule,
    ProgressModule,
    RenderModule,
    ...clientDistModules()
  ],
  controllers: [HealthController]
})
export class AppModule {}
