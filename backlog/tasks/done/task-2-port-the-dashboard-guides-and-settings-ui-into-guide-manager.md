---
id: task-2
title: Port the dashboard guides and settings UI into guide-manager
created: 2026-08-24
tags: ui, client, react, settings
---

## Goal

Give guide-manager the same front end as `../claude-agents-dashboard`, cut down
to the two sections that mean anything here: **Guides** (the card list and its
iframe viewer) and **Settings** (theme picker + bionic reading configuration).

Depends on **task-1**, which provides `GET /api/guides`, `POST /api/progress`,
`shared/theme.css`, and the `ServeStaticModule` that serves `client/dist` the
moment it exists.

Settled with the user; not open during execution:

- Settings carries **theme and bionic only**. No density, no text scale, none of
  the dashboard's poll/scan/notify/remote rows — they have no meaning here.
- Theme repaints the **shell and the rendered markdown guide body** (task-1 does
  the server half). Generated decks keep their own styling.
- Bionic reach is **everything, panel stays**: Settings is the central control,
  and the in-guide `bx-panel` keeps working as a local override.
- Source of the look is the dashboard's own `client/src`, copied rather than
  reimplemented.

## Plan

### Task 1: Vite + React skeleton serving a themed empty shell

**Files:**
- Create: `client/index.html`, `client/src/main.tsx`, `client/src/App.tsx`, `client/src/styles.css`
- Create: `client/src/components/SideRail.tsx`
- Create: `vite.config.ts`
- Modify: `package.json` (client deps, `dev`/`build` scripts)
- Modify: `tsconfig.json` (add `client` to `include`, `jsx: "react-jsx"`, `lib` gains `DOM`)
- Test: `test/side-rail.test.tsx`

**Interfaces produced:** `Section = 'guides' | 'settings'`; `SideRail({ section, onChange })`; `App()`.

- [ ] **Step 1: Install client deps**

```bash
npm install react@^18.3 react-dom@^18.3 \
  @fontsource/barlow @fontsource/barlow-condensed @fontsource/ibm-plex-mono
npm install -D vite@^5.4 @vitejs/plugin-react@^4.3 \
  @types/react@^18.3 @types/react-dom@^18.3 \
  @testing-library/react@^16 @testing-library/jest-dom@^6 jest-environment-jsdom@^29
```

- [ ] **Step 2: Add `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = Number(process.env.PORT) || 4321;

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT) || 5175,
    host: true,
    // The guide viewer is a same-origin iframe pointed at the Nest render
    // route, so /guide and /asset have to be proxied too — not just /api, or
    // the Guides tab shows an empty frame in dev.
    proxy: {
      '/api': { target: `http://localhost:${API_PORT}` },
      '/guide': { target: `http://localhost:${API_PORT}` },
      '/asset': { target: `http://localhost:${API_PORT}` },
      '/theme.css': { target: `http://localhost:${API_PORT}` },
      '/bionic.css': { target: `http://localhost:${API_PORT}` },
      '/bionic.js': { target: `http://localhost:${API_PORT}` }
    }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
```

- [ ] **Step 3: Add `client/index.html` with the pre-paint theme stamp**

Same script task-1 injects into `wrapPage`, reading the same key — that is what
keeps a hard reload from flashing the default palette:

```html
<script>
try {
  var s = JSON.parse(localStorage.getItem('guide-manager.settings') || '{}');
  if (s.theme) document.documentElement.dataset.theme = s.theme;
} catch (e) {}
</script>
```

- [ ] **Step 4: Port `SideRail.tsx`, trimmed to two tabs**

Copy `../claude-agents-dashboard/client/src/components/SideRail.tsx`; narrow
`Section` to `'guides' | 'settings'`, cut `TABS` to those two, and change the
brand block to `Guide` / `Manager`. The `.rail-link` / `.rail-brand` /
`.rail-kicker` class names stay exactly as they are — the ported CSS keys off
them.

- [ ] **Step 5: Write the failing SideRail test, then make it pass**

`test/side-rail.test.tsx` renders the rail, asserts both labels are present,
asserts `aria-current="page"` sits on the active one, and asserts a click calls
`onChange` with the other section's id. Add a jsdom `testEnvironment` override
for `*.test.tsx` in `jest.config.ts` via `projects`, leaving the node-environment
server suites from task-1 alone.

- [ ] **Step 6: Port `styles.css`, minus four subsystems**

Copy the dashboard's `client/src/styles.css` and delete every rule for the
sections that did not come along: `.row*`, `.sess*`, `.tb-*`/`.toolbar`,
`.mgmt*`/`.mitem`/`.mdetail`/`.mgroup*`/`.msub*`/`.ffile`, `.an-*`, `.chat*`,
`.q-*`/`.plan-*`/`.msg-*`, `.spawn*`, `.mic*`, `.origin*`, `.perm*`. Keep
`.shell`, `.main`, `.wrap`, `.rail*`, `.guides*`, `.guide-viewer*`,
`.guide-locked`, `.set*`, `.mdetail-label` (SettingsGroup uses it), and the
`--row-pad`/`--body-pad` root block.

**Do not copy the five `[data-theme]` palette blocks.** Import
`shared/theme.css` (created by task-1) at the top of `styles.css` instead —
`@import '../../shared/theme.css';`. One palette definition, two consumers; a
theme tweak can never leave the guide body and the shell disagreeing.

Add the three font imports at the top of `main.tsx` exactly as the dashboard
does.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: React/Vite client shell with the dashboard side rail"
```

---

### Task 2: Settings — theme picker and bionic configuration

Built before Guides on purpose: the theme it writes is what the Guides cards and
the iframed guide body are then verified against.

**Files:**
- Create: `client/src/lib/settings.ts`
- Create: `client/src/hooks/usePersistedState.ts`
- Create: `client/src/hooks/useSettings.tsx`
- Create: `client/src/components/settings/SettingsRow.tsx`
- Create: `client/src/components/settings/SettingsView.tsx`
- Modify: `client/src/App.tsx` (wrap in `SettingsProvider`, render the section)
- Test: `test/settings.test.ts`, `test/settings-bionic.test.ts`

**Interfaces produced:**
- `Settings { theme: ThemeId; bionicOn: boolean; bionicStrength: number; bionicFreq: number }`
- `DEFAULT_SETTINGS`, `THEMES`, `LIMITS`, `clampSettings(raw: unknown): Settings`
- `bionicKeyValue(s: Settings): { on: boolean; strength: number; freq: number }`
- `useSettings(): { settings, update, reset }`

- [ ] **Step 1: Write the failing clamp tests**

`test/settings.test.ts` — one case per field, each falling back independently so
one bad key cannot discard the rest:

```ts
import { clampSettings, DEFAULT_SETTINGS } from '../client/src/lib/settings';

describe('clampSettings', () => {
  it('falls back to the default theme for an unknown id', () => {
    expect(clampSettings({ theme: 'neon' }).theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it('keeps a known theme', () => {
    expect(clampSettings({ theme: 'daylight' }).theme).toBe('daylight');
  });

  it('rejects a stringly-typed boolean', () => {
    expect(clampSettings({ bionicOn: 'true' }).bionicOn).toBe(false);
  });

  it('clamps fixation strength into the aid’s own 0.2–0.8 range', () => {
    expect(clampSettings({ bionicStrength: 0.05 }).bionicStrength).toBe(0.2);
    expect(clampSettings({ bionicStrength: 5 }).bionicStrength).toBe(0.8);
  });

  it('clamps frequency to an integer in 1–5', () => {
    expect(clampSettings({ bionicFreq: 0 }).bionicFreq).toBe(1);
    expect(clampSettings({ bionicFreq: 99 }).bionicFreq).toBe(5);
    expect(clampSettings({ bionicFreq: 2.7 }).bionicFreq).toBe(3);
  });

  it('survives a non-object blob', () => {
    expect(clampSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(clampSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});
```

The 0.2–0.8 and 1–5 bounds are not chosen here — they are copied from
`readState()` in `assets/bionic.js`. If they ever diverge, the aid silently
discards what Settings stored, so a comment in `settings.ts` must name that file
as the source.

- [ ] **Step 2: Run them to verify they fail, then write `lib/settings.ts`**

Port the dashboard's `THEMES` array verbatim (all five ids, labels and hints).
Keep the object **flat** — `usePersistedState` shallow-merges one level deep, so
a nested `bionic: {}` written by an older build would never gain a new inner
field's default. That is why the three bionic fields are `bionicOn`,
`bionicStrength`, `bionicFreq` rather than a sub-object.

- [ ] **Step 3: Write the failing bionic round-trip test**

`test/settings-bionic.test.ts` proves the contract that makes the whole "one
setting, three surfaces" decision work: what Settings writes is exactly what the
vendored aid reads back.

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

import { bionicKeyValue, BIONIC_STORAGE_KEY, clampSettings } from '../client/src/lib/settings';

const SRC = readFileSync(join(__dirname, '..', 'assets', 'bionic.js'), 'utf8');

/** Load the vendored aid against a fake localStorage seeded by Settings. */
function readStateWith(stored: string): { on: boolean; strength: number; freq: number } {
  const store = new Map([[BIONIC_STORAGE_KEY, stored]]);
  const sandbox: Record<string, unknown> = {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: () => {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return (sandbox.__bionic as { readState: () => { on: boolean; strength: number; freq: number } }).readState();
}

it('writes a value the vendored aid reads back unchanged', () => {
  const settings = clampSettings({ theme: 'amber', bionicOn: true, bionicStrength: 0.65, bionicFreq: 3 });
  const state = readStateWith(JSON.stringify(bionicKeyValue(settings)));
  expect(state).toEqual({ on: true, strength: 0.65, freq: 3 });
});

it('never writes a value the aid would reject and silently default', () => {
  const settings = clampSettings({ bionicOn: true, bionicStrength: 9, bionicFreq: 42 });
  const state = readStateWith(JSON.stringify(bionicKeyValue(settings)));
  expect(state.strength).toBe(settings.bionicStrength);
  expect(state.freq).toBe(settings.bionicFreq);
});
```

- [ ] **Step 4: Implement `bionicKeyValue` and the dual write**

`BIONIC_STORAGE_KEY = 'guide-manager:bionic'`. `bionicKeyValue(s)` returns
`{ on: s.bionicOn, strength: s.bionicStrength, freq: s.bionicFreq }` — the aid's
own shape, nothing more.

In `useSettings.tsx`, one effect mirrors the app settings into the aid's key on
every change, alongside the effect that stamps `data-theme`:

```tsx
// Two keys, one truth. `guide-manager.settings` is this app's state;
// `guide-manager:bionic` is the contract assets/bionic.js already reads — in
// this document, in the SSR guide pages, and inside every already-generated
// study build framed by the viewer. Writing it here is what makes the Settings
// page the central control without the aid needing to know this app exists.
useEffect(() => {
  try {
    localStorage.setItem(BIONIC_STORAGE_KEY, JSON.stringify(bionicKeyValue(settings)));
  } catch { /* private mode — the aid falls back to its defaults */ }
}, [settings.bionicOn, settings.bionicStrength, settings.bionicFreq]);
```

- [ ] **Step 5: Port `SettingsRow.tsx` verbatim**

`SettingsRow`, `SettingsGroup`, `Segmented`, `NumberField` — copied unchanged.
`NumberField` may end up unused; keep it, it costs nothing and the next setting
will want it.

- [ ] **Step 6: Write `SettingsView.tsx` — two groups, nothing else**

Group **Display · this device**: the theme block copied verbatim from the
dashboard, including the `SWATCHES` record (a deliberate mirror of the
`[data-theme]` blocks — the swatch has to paint a palette that is *not* applied,
so it cannot read live custom properties).

Group **Reading**: three rows.

```tsx
<SettingsRow name="Bionic reading" hint="Bolds the first few letters of a word to give the eye a fixation point.">
  <Segmented
    value={settings.bionicOn ? 'on' : 'off'}
    options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]}
    onChange={v => update({ bionicOn: v === 'on' })}
  />
</SettingsRow>

<SettingsRow name="Fixation" hint="How much of each word is bolded. Never the whole word — a fully bold word carries no fixation point.">
  <Segmented
    value={settings.bionicStrength}
    options={[
      { value: 0.3, label: '30%' },
      { value: 0.5, label: '50%' },
      { value: 0.7, label: '70%' }
    ]}
    onChange={bionicStrength => update({ bionicStrength })}
    disabled={!settings.bionicOn}
  />
</SettingsRow>

<SettingsRow name="Every" hint="Bold every Nth word. Higher values thin the effect out.">
  <Segmented
    value={settings.bionicFreq}
    options={[
      { value: 1, label: '1st' },
      { value: 2, label: '2nd' },
      { value: 3, label: '3rd' }
    ]}
    onChange={bionicFreq => update({ bionicFreq })}
    disabled={!settings.bionicOn}
  />
</SettingsRow>
```

Segmented rather than the in-guide panel's sliders: three named stops read
better on a phone than a range input, and `Segmented` already carries the
`disabled` affordance for "the switch would flip and do nothing". The stored
range stays the full 0.2–0.8 / 1–5 so a value set from the in-guide panel's
slider is preserved, not snapped, when Settings next renders.

- [ ] **Step 7: Run the suite and commit**

```bash
npx jest
git add -A
git commit -m "feat: settings page with theme picker and bionic reading controls"
```

---

### Task 3: Guides — card list and iframe viewer

**Files:**
- Create: `client/src/hooks/useGuides.ts`
- Create: `client/src/components/guides/GuidesView.tsx`
- Modify: `client/src/App.tsx` (lazy-load both sections)
- Test: `test/guides-view.test.tsx`

**Interfaces consumed:** `GuidesIndex`, `ProjectEntry`, `GuideEntry`, `GuideProgress` from `shared/types` (task-1).

- [ ] **Step 1: Port `useGuides.ts`**

Copy the dashboard's hook, retyped to task-1's `GuidesIndex`. Keep its no-poll
comment and behaviour: one fetch per mount. Guides change when a skill
publishes one, not by the second.

- [ ] **Step 2: Write the failing GuidesView tests**

```tsx
const index: GuidesIndex = {
  projects: [{
    name: 'guide-manager',
    path: '/p',
    guides: [
      { path: '/p/g/a.md', title: 'Alpha Guide', type: 'study', updated: '2026-08-24T00:00:00Z',
        href: '/guide?p=%2Fp%2Fg%2Fa.md', progress: null },
      { path: '/p/g/deck.html', title: 'Deck', type: 'tutor', updated: '2026-08-20T00:00:00Z',
        href: '/guide?p=%2Fp%2Fg%2Fdeck.html',
        progress: { scrollPercent: 100, completed: true, lastOpenedAt: '2026-08-23T00:00:00Z', openCount: 4 } }
    ]
  }]
};
```

Cases: renders one group per project titled by project name; each card shows
title, type badge and the date part of `updated`; a card with
`progress.completed` shows the read marker and one with `progress: null` shows
none; a card with a partial `scrollPercent` shows that percentage; clicking a
card renders an iframe whose `src` is the entry's own `href` (never
reconstructed); the Back button returns to the list; the `guide-locked` class
lands on `documentElement` while the viewer is open and is removed on the way
out.

- [ ] **Step 3: Implement `GuidesView.tsx`**

Port the dashboard file and change exactly two things. First, the grouping:
`index.projects.map(...)` with `<div className="guides-group-h">{project.name}</div>`
replaces the fixed Decks / Study guides pair. Second, the viewer state carries
the entry's `href` instead of a `relPath`:

```tsx
interface ViewerState { href: string; title: string }
```

Everything else is copied as-is, comments included — in particular the
`guide-locked` effect (an iframe's scroller cannot be given
`overscroll-behavior` from this document, so the chain is refused at the root)
and the deliberate absence of a `sandbox` attribute on the iframe. That absence
now matters more, not less: a generated deck's inline script is what makes its
pager, its quiz and the in-guide bionic panel work at all, and it is our own
server serving our own generated HTML.

Card meta line: `${type} · ${updated.slice(0, 10)}`, plus a progress fragment —
`read` when `completed`, `${scrollPercent}%` when partial, nothing when `null`.

- [ ] **Step 4: Lazy-load both sections in `App.tsx`**

Mirror the dashboard's `lazy(() => import(...))` + `Suspense` structure, with
`guides` remembered as the last section through `usePersistedState`.

- [ ] **Step 5: Run the suite and commit**

```bash
npx jest
git add -A
git commit -m "feat: guides card list and iframe viewer"
```

---

### Task 4: Live bionic propagation into open guides

The one edit to the vendored aid, and the last piece of "everything, panel
stays".

**Files:**
- Modify: `assets/bionic.js` (add a `storage` listener)
- Modify: `../../../.claude/skills/study/references/visuals.md` (note the vendored version bumped)
- Test: `test/bionic-storage.test.ts`

- [ ] **Step 1: Write the failing test**

Load the aid in a `vm` sandbox with a stub `window`/`document` and a captured
`addEventListener`, fire a synthetic `storage` event for
`guide-manager:bionic`, and assert `apply`/`restore` ran against the root — and
that an event for an unrelated key does nothing.

- [ ] **Step 2: Add the listener**

Inside `init()`, after the existing bindings, guarded by the same `bound` flag:

```js
// Settings lives in another document (the app shell), and this guide may be
// framed inside it. localStorage is per-origin, so a change there raises a
// `storage` event here — that is what makes the central Settings page repaint an
// already-open guide instead of waiting for a reload. The in-guide panel keeps
// working: it writes the same key, so both routes converge on one state.
globalThis.addEventListener('storage', function (e) {
  if (e.key !== STORAGE_KEY) return;
  state = readState();
  onBox.checked = state.on;
  strengthEl.value = String(Math.round(state.strength * 100));
  freqEl.value = String(state.freq);
  render();
  if (state.on) apply(root, state.strength, state.freq);
  else restore(root);
});
```

Bump the `bionic v1` header comment to `v2` in all three `assets/bionic.*` files
and in the study skill's reference table, so a guide built against v1 is
identifiable.

- [ ] **Step 3: Verify by hand**

With Mongo and the server up: open a guide in the viewer, switch to Settings,
turn bionic on. The framed guide must repaint without a reload. Then open the
in-guide panel and move its fixation slider — the guide repaints, and Settings
shows the new value on next render.

- [ ] **Step 4: Run the suite and commit**

```bash
npx jest
git add -A
git commit -m "feat: propagate bionic settings into already-open guides"
```

---

### Task 5: Build, serve, verify

- [ ] **Step 1: `npm run build`** — confirm `client/dist/index.html` and the
  hashed assets appear, and that the font `woff2` files are emitted.
- [ ] **Step 2: `npm start`** — task-1's `clientDistModules()` now finds the
  bundle; confirm the log no longer says "no client bundle".
- [ ] **Step 3: Walk the app** — `http://localhost:4321/`: the rail shows Guides
  and Settings; a card per registered guide grouped by project; tapping one
  frames the guide; Settings switches all five themes and the framed guide body
  repaints with the shell; bionic on/off/fixation/frequency all take effect
  live.
- [ ] **Step 4: Phone check at 375px** — the rail becomes the horizontal strip,
  the viewer is a full overlay, and scrolling the framed guide does not drag the
  page behind it.
- [ ] **Step 5: Commit the built-bundle gitignore entry** — `client/dist` is
  build output; add it to `.gitignore` rather than committing it.

## Test cases

- `settings.test.ts` — theme fallback and pass-through; `bionicOn` rejects a
  stringly boolean; strength clamps to 0.2–0.8; frequency clamps to an integer
  1–5; a non-object blob yields the defaults.
- `settings-bionic.test.ts` — what Settings writes, `readState()` in the
  vendored `assets/bionic.js` reads back identically; nothing Settings can
  produce is a value the aid would silently reject.
- `side-rail.test.tsx` — both labels render, `aria-current` marks the active
  tab, a click reports the other section.
- `guides-view.test.tsx` — one group per project; card shows title, badge and
  date; completed / partial / unread progress markers; the iframe uses the
  entry's own `href`; Back returns to the list; `guide-locked` is added and
  removed with the viewer.
- `bionic-storage.test.ts` — a `storage` event for the aid's key re-applies;
  an event for any other key is ignored.

## Done when

- `npx jest` passes, including every suite task-1 left in place.
- `npm run typecheck` passes with `client/` included.
- `npm run build` produces `client/dist`, and `npm start` serves the app at
  `http://localhost:4321/` with no "no client bundle" warning.
- The rail has exactly two sections, and Settings has exactly two groups —
  Display (5 themes) and Reading (3 bionic rows).
- Switching theme in Settings repaints the shell **and** the framed markdown
  guide; switching bionic repaints an already-open framed guide without a
  reload.
- An already-generated study build still shows its own `bx-panel`, and using it
  still works.
- `assets/bionic.js` differs from its pre-task state by the `storage` listener
  and the version header only.
- At 375px the rail is a horizontal strip and the viewer overlays full-screen.

## Notes

Not ported, deliberately: Sessions, Management, Analytics, the chat drawer, spawn
panel, dictation, remote-answer and push-notification UI. None has a counterpart
in guide-manager.

## Outcome

**2026-08-24 — done.** Executed on branch `task-1-nest-backend-split`, on top of
task-1:

```
3b5659f fix: inject the reading aid panel into rendered guide pages
78196ea feat: propagate bionic settings into already-open guides
1425059 feat: guides card list and iframe viewer
8e2e073 feat: settings page with theme picker and bionic reading controls
e52ab00 feat: React/Vite client shell with the dashboard side rail
```

### Verification

```
$ npx jest
Test Suites: 17 passed, 17 total
Tests:       148 passed, 148 total

$ npx tsc --noEmit
tsc exit 0

$ npm run build
✓ built in 696ms        (client/dist/index.html present)

$ node dist/server/src/main.js     # "no client bundle" warnings: 0
/                  200      /api/health        200
/deep/spa/route    200      /api/guides        200
/style.css         200      /theme.css         200
/bionic.css        200      /bionic.js         200
/asset?p=/etc/passwd 404

rendered guide page contains: dataset.theme · /theme.css · /bionic.css ·
/bionic.js · class="bx-panel" · id="bx-on" · /api/progress
```

In a real browser against the running server and the real registry (8 guides,
2 projects):

- Rail shows exactly **Guides** and **Settings**; guides are grouped by project,
  each card showing type · date, and the Dictation card showed **42%** from a
  progress write made earlier.
- Settings has exactly two groups: Display (five swatches) and Reading (three
  rows). Fixation and Every are greyed out while bionic is off.
- Picking **Daylight Strip** repainted the shell *and* the framed markdown guide
  — one palette across both, which is what sharing `shared/theme.css` buys.
- **Bionic live propagation, verified natively.** Settings in one tab, a guide
  open in another: prefixes grew from `Th/gui/teac` to `Thi/guid/teach` and the
  in-guide slider synced to 70, with no reload and no synthetic events. Turning
  it off left `boldCount: 0`, `span.bx: 0` and the prose intact — the restore is
  lossless.
- **Two frames deep, also native.** A stand-in generated build (the vendored
  panel, CSS and JS inlined the way `skills/study/references/visuals.md`
  prescribes) framed in the viewer: it kept **its own panel**, applied bionic
  from the shared key, left `pre code` and `h1` untouched, and when the real
  Settings UI in a second tab wrote `on/0.3/2nd`, the browser delivered the event
  and the guide repainted to 30% / every 2nd word with its own panel synced.
- At 375px: `.rail` computed `flex-direction: row` with `overflow-x: auto` and the
  wordmark hidden; opening a guide gave a `position: fixed` overlay at 375×812
  with `guide-locked` on `<html>` and `overflow: hidden`.

`bin/register.js` still byte-identical to main. `assets/` differs only by the
three version headers and the 23-line listener.

### One real defect found, and it was not found by a test

`wrapPage` linked `bionic.css` and `bionic.js` but never injected the panel
markup. `init()` in the vendored aid resolves the panel's controls before doing
anything and returns early if any are missing — so **bionic reading was inert on
every server-rendered guide**, and the storage listener never bound there either.
Caught by opening a real guide in a browser and seeing unbolded prose while the
key said `on: true`. Fixed with a `panelHtml` option (markdown pages only; a
framed deck's own build embeds one inside the frame), covered by two new
`render.e2e` cases.

### Deviations from the plan

- **jsdom via a `@jest-environment` docblock**, not `projects`. One preset and one
  transform config for the whole repo instead of duplicating them per project.
- **`--font-scale` divisions dropped** from the ported viewport-unit rules. They
  exist for the dashboard's `.shell{zoom}` text-scale setting, which is not
  ported, so they would be no-ops. A comment in `styles.css` says they must come
  back if a text scale is ever added.
- **`build` split into `build:server` + `build:client`**, since the plan's
  `npm run build` had to produce both.
- **The static-bundle test was rewritten.** Its bundle-present branch asserted an
  HTTP fallback a Nest testing module cannot produce: `ServeStaticModule`
  installs Express middleware that `Test.createTestingModule` does not wire up,
  so it 404s whether or not a bundle exists (probed and confirmed).
  `clientDistModules` now takes the dist path, so the registration decision is
  tested directly and the fallback is verified against the running server.
- **A settings change does not repaint a guide within one tab**, because the
  viewer unmounts when you navigate to Settings. The listener earns its place
  across tabs and windows, which is how it was verified. The task's wording
  implied same-tab; the mechanism is per-document.
- **`skills/` was restored.** The directory left the working tree during task-1
  for reasons unrelated to this work, and a blanket `git add -A` committed the
  deletion unnoticed. Restored byte-identical to main in 78196ea; only
  `visuals.md` differs now, by the v2 documentation this task added.

### Not verified, because no artifact exists

No guide on this machine was generated with the reading aid in it — every build
predates today's bionic work — so "an already-generated study build still shows
its own panel" was verified against a faithful stand-in, not a real published
guide. The first real regeneration will be the true test.
