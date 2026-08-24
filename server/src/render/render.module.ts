import { Module } from '@nestjs/common';

import { RenderController } from './render.controller';
import { RegistryModule } from '../registry/registry.module';

@Module({
  imports: [RegistryModule],
  controllers: [RenderController]
})
export class RenderModule {}
