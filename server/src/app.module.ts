import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { GuidesModule } from './guides/guides.module';
import { RenderModule } from './render/render.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), GuidesModule, RenderModule],
  controllers: [HealthController]
})
export class AppModule {}
