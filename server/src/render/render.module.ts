import { Module } from '@nestjs/common';

import { AssetsController } from './assets.controller';
import { RenderController } from './render.controller';
import { RegistryModule } from '../registry/registry.module';

@Module({
  imports: [RegistryModule],
  controllers: [RenderController, AssetsController]
})
export class RenderModule {}
