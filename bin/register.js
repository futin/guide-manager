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

/**
 * The only way to un-register a guide, so that re-pointing one at a different
 * file stays a single-writer operation. `upsertGuide` keys on the guide path,
 * so swapping a directory guide's `README.md` hub for its generated
 * `index.html` would otherwise leave the old entry behind as a second card for
 * the same guide — hand-editing registry.json to clean that up is exactly the
 * thing the single-writer rule exists to prevent.
 *
 * A project with no guides left is dropped with it: a project entry is only a
 * container, and an empty one is noise on the board.
 *
 * Returns false when the path was not registered, so the caller can warn
 * instead of silently rewriting the file to itself.
 */
export function removeGuide(registry, guidePath) {
  const project = registry.projects.find((p) => p.guides.some((g) => g.path === guidePath));
  if (!project) return false;
  project.guides = project.guides.filter((g) => g.path !== guidePath);
  if (project.guides.length === 0) {
    registry.projects = registry.projects.filter((p) => p !== project);
  }
  return true;
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
      remove: { type: 'boolean' },
    },
  });
  const { project, guide, type, title, remove } = values;

  // Removal is keyed on the guide path alone: paths are absolute and a guide
  // lives in exactly one project, so requiring --project would only add a way
  // to get the call wrong.
  if (remove) {
    if (!guide) throw new Error('usage: register.js --remove --guide <abs>');
    const registry = loadRegistry(REGISTRY_FILE);
    // Thrown, not saved-and-warned: a miss means the caller named the wrong
    // path, and rewriting the file to itself would move nothing but the mtime.
    if (!removeGuide(registry, guide)) throw new Error(`not registered: ${guide}`);
    saveRegistry(REGISTRY_FILE, registry);
    console.log(`removed: ${guide}`);
    return;
  }

  if (!project || !guide || !type || !title) {
    throw new Error('usage: register.js --project <abs> --guide <abs> --type study|tutor --title <text>');
  }
  if (type !== 'study' && type !== 'tutor') throw new Error(`unknown type: ${type}`);
  // The viewer frames generated HTML and nothing else: a study guide's
  // index.html build, or a tutor deck. Registering a markdown hub used to render
  // as that hub alone — no chapters, no contents rail, mermaid fences as raw
  // text — and now renders as nothing at all. Refusing it here is the only place
  // the mistake is still cheap; caught later it is a card on the board that
  // cannot open.
  if (!/\.html?$/i.test(guide)) {
    throw new Error(`not an HTML guide: ${guide} — register the generated build, not its markdown source`);
  }
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
