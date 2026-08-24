import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { GuidesModule } from './guides/guides.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), GuidesModule],
  controllers: [HealthController]
})
export class AppModule {}
