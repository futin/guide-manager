import { Controller, Get } from '@nestjs/common';

import type { ReleasesResponse } from '../../../shared/types';
import { ReleasesService } from './releases.service';

/**
 * `GET /api/releases` — this app's own release history, for the rail's version chip and the What's new drawer. Read-only, git only, never an outbound
 * call. Always 200: every failure is the empty shape (`releases.service.ts`), because the chip is a convenience and must never put an error on the page.
 * `/api` is already in `vite.config.ts`'s proxy list, so this route needs no proxy entry of its own.
 */
@Controller('api/releases')
export class ReleasesController {
  constructor(private readonly releases: ReleasesService) {}

  @Get()
  list(): Promise<ReleasesResponse> {
    return this.releases.read();
  }
}
