#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { homedir } from 'node:os';

export const REGISTRY_FILE =
  process.env.GM_REGISTRY_FILE ||
  join(homedir(), '.guide-manager', 'registry.json');

export function loadRegistry(file) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(data.projects)) throw new Error('bad shape');
    return data;
  } catch {
    return { projects: [] };
  }
}

export function upsertGuide(registry, { projectPath, guidePath, type, title, now }) {
  let project = registry.projects.find((p) => p.path === projectPath);
  if (!project) {
    project = { name: basename(projectPath), path: projectPath, guides: [] };
    registry.projects.push(project);
  }
  let guide = project.guides.find((g) => g.path === guidePath);
  if (!guide) {
    guide = { path: guidePath };
    project.guides.push(guide);
  }
  guide.type = type;
  guide.title = title;
  guide.updated = now;
  return registry;
}

export function saveRegistry(file, registry) {
  mkdirSync(dirname(file), { recursive: true });
  const tmpFile = `${file}.tmp`;
  writeFileSync(tmpFile, JSON.stringify(registry, null, 2) + '\n');
  renameSync(tmpFile, file);
}

function main() {
  const { values } = parseArgs({
    options: {
      project: { type: 'string' },
      guide: { type: 'string' },
      type: { type: 'string' },
      title: { type: 'string' },
    },
  });
  const { project, guide, type, title } = values;
  if (!project || !guide || !type || !title) {
    throw new Error('usage: register.js --project <abs> --guide <abs> --type study|tutor --title <text>');
  }
  if (type !== 'study' && type !== 'tutor') throw new Error(`unknown type: ${type}`);
  const registry = loadRegistry(REGISTRY_FILE);
  upsertGuide(registry, {
    projectPath: project,
    guidePath: guide,
    type,
    title,
    now: new Date().toISOString(),
  });
  saveRegistry(REGISTRY_FILE, registry);
  console.log(`registered: ${title} (${type}) -> ${guide}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    // A failed registration must never break the calling skill's wrap-up.
    console.error(`guide-manager registration warning: ${err.message}`);
    process.exitCode = 0;
  }
}
