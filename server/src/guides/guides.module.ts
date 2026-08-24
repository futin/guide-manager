import { Module } from '@nestjs/common';

import { GuidesController } from './guides.controller';
import { RegistryModule } from '../registry/registry.module';

@Module({
  imports: [RegistryModule],
  controllers: [GuidesController]
})
export class GuidesModule {}
