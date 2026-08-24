import { Controller, Get } from '@nestjs/common';

import { RegistryService } from '../registry/registry.service';
import type { GuidesIndex } from '../../../shared/types';

/**
 * The guides index the client renders its card list from. Progress is attached
 * here (null until ProgressModule lands) so the client makes one request, not
 * one per card.
 */
@Controller('api/guides')
export class GuidesController {
  constructor(private readonly registry: RegistryService) {}

  @Get()
  index(): GuidesIndex {
    return {
      projects: this.registry.listProjects().map((project) => ({
        name: project.name,
        path: project.path,
        guides: project.guides.map((g) => ({
          path: g.path,
          title: g.title,
          type: g.type,
          updated: g.updated,
          href: `/guide?p=${encodeURIComponent(g.path)}`,
          progress: null
        }))
      }))
    };
  }
}
