import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { Inject, Injectable, Optional } from '@nestjs/common';

import { buildAllowlist } from '../render/paths.util';
import type { GuideMeta, Registry, RegistryProject } from '../../../shared/types';

export const REGISTRY_FILE = 'REGISTRY_FILE';

export function defaultRegistryFile(): string {
  return process.env.GM_REGISTRY_FILE || join(homedir(), '.guide-manager', 'registry.json');
}

/**
 * Read-only view of ~/.guide-manager/registry.json — the single source of truth
 * for where guides live. Written only by bin/register.js, which the study and
 * tutor skills invoke; this service never writes it.
 *
 * Read per call rather than cached: a skill can register a guide at any moment,
 * and the file is a few KB. A cache here would show a stale board until restart.
 *
 * The constructor takes the file path so tests can point at a fixture. Nest
 * supplies it through the REGISTRY_FILE token.
 */
@Injectable()
export class RegistryService {
  private readonly file: string;

  constructor(@Optional() @Inject(REGISTRY_FILE) file?: string) {
    this.file = file ?? defaultRegistryFile();
  }

  load(): Registry {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as Registry;
      if (!Array.isArray(data.projects)) throw new Error('bad shape');
      return data;
    } catch {
      return { projects: [] };
    }
  }

  /**
   * The registry as the UI should see it: a guide whose file has been deleted
   * or moved is hidden rather than offered as a broken card, and a project left
   * with nothing is dropped along with it.
   */
  listProjects(): RegistryProject[] {
    return this.load().projects
      .map((project) => ({
        ...project,
        guides: project.guides.filter((g) => {
          if (existsSync(g.path)) return true;
          console.error(`stale guide hidden: ${g.path}`);
          return false;
        })
      }))
      .filter((project) => project.guides.length > 0);
  }

  allowlist(): Set<string> {
    return buildAllowlist(this.load());
  }

  /**
   * Requests carry the resolved realpath (see resolveAllowed) while the registry
   * stores whatever path the skill handed in, so an exact hit is tried first and
   * symlinked entries are resolved only on miss. A file served merely because it
   * sits next to a registered guide has no entry at all — name it by filename
   * and leave the crumbs off rather than guess.
   */
  guideMeta(realPath: string): GuideMeta {
    const entries = this.load().projects.flatMap((p) => p.guides.map((g) => [p, g] as const));
    const hit =
      entries.find(([, g]) => g.path === realPath) ||
      entries.find(([, g]) => this.realOrNull(g.path) === realPath);
    if (!hit) return { title: basename(realPath) };
    const [project, guide] = hit;
    return { title: guide.title, type: guide.type, project: project.name };
  }

  private realOrNull(p: string): string | null {
    try {
      return realpathSync(p);
    } catch {
      return null;
    }
  }
}
