import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { GuidesModule } from './guides/guides.module';
import { HealthController } from './health/health.controller';
import { ProgressModule } from './progress/progress.module';
import { RenderModule } from './render/render.module';

export const DEFAULT_MONGO_URL = 'mongodb://localhost:27017/guide-manager';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URL') ?? DEFAULT_MONGO_URL,
        // Nest's default is to retry forever, which would leave the process up
        // with a dead database and nothing saying so. Mongo is a hard
        // requirement here: fail the boot instead, and let main.ts's catch exit
        // non-zero with a readable message.
        retryAttempts: 2,
        retryDelay: 1000
      })
    }),
    GuidesModule,
    ProgressModule,
    RenderModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
