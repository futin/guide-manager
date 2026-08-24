import { Module } from '@nestjs/common';

import { RegistryService, REGISTRY_FILE, defaultRegistryFile } from './registry.service';

@Module({
  providers: [
    { provide: REGISTRY_FILE, useFactory: defaultRegistryFile },
    RegistryService
  ],
  exports: [RegistryService]
})
export class RegistryModule {}
