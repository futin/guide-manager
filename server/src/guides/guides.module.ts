import { Module } from '@nestjs/common';

import { GuidesController } from './guides.controller';
import { ProgressModule } from '../progress/progress.module';
import { RegistryModule } from '../registry/registry.module';

@Module({
  imports: [RegistryModule, ProgressModule],
  controllers: [GuidesController]
})
export class GuidesModule {}
