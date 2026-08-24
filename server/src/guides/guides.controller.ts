import { Controller, Get } from '@nestjs/common';

import { ProgressService } from '../progress/progress.service';
import { RegistryService } from '../registry/registry.service';
import type { GuidesIndex } from '../../../shared/types';

/**
 * The guides index the client renders its card list from.
 *
 * Progress is joined in here rather than fetched per card: one registry read and
 * one Mongo query answer the whole page, however many guides it holds.
 */
@Controller('api/guides')
export class GuidesController {
  constructor(
    private readonly registry: RegistryService,
    private readonly progress: ProgressService
  ) {}

  @Get()
  async index(): Promise<GuidesIndex> {
    const projects = this.registry.listProjects();
    const paths = projects.flatMap((p) => p.guides.map((g) => g.path));
    const progress = await this.progress.find(paths);

    return {
      projects: projects.map((project) => ({
        name: project.name,
        path: project.path,
        guides: project.guides.map((g) => ({
          path: g.path,
          title: g.title,
          type: g.type,
          updated: g.updated,
          // Read-time fallback for an entry registered before createdAt
          // existed. Deliberately not a write: bin/register.js is the
          // registry's only writer and heals such entries itself on their next
          // re-register, so backfilling from here would make the server a
          // second writer of a single-writer file.
          createdAt: g.createdAt ?? g.updated,
          href: `/guide?p=${encodeURIComponent(g.path)}`,
          progress: progress.get(g.path) ?? null
        }))
      }))
    };
  }
}
