import { Module } from '@nestjs/common';

import { AssetsController } from './assets.controller';
import { RenderController } from './render.controller';
import { RegistryModule } from '../registry/registry.module';
import { ProgressModule } from '../progress/progress.module';

@Module({
  // ProgressModule, because /asset now hands a framed guide its stored
  // position: the reporter has to be able to restore on its first frame, and a
  // fetch from inside the iframe would be a round trip in front of that.
  imports: [RegistryModule, ProgressModule],
  controllers: [RenderController, AssetsController]
})
export class RenderModule {}
