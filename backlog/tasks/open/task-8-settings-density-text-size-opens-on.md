---
id: task-8
title: Settings: density, text size, opens on
created: 2026-08-24
---

## Goal

Port the dashboard's three settings rows into this app: Density
(comfortable/compact), Text size (font scale), Opens on (landing section).
Source of shape: ../claude-agents-dashboard `client/src/lib/settings.ts`,
`useSettings.tsx`, `SettingsView.tsx`. Shell-only — rendered guide pages and
the bionic contract are untouched. Independent of the board tasks.

## Plan

1. `client/src/lib/settings.ts`: add flat fields (the file's own FLAT warning
   applies) — `density: 'comfortable' | 'compact'` default comfortable;
   `fontScale: number` default 100, LIMITS 80–130, stops `FONT_SCALES = [90,
   100, 110, 120]`; `landing: 'last' | 'guides' | 'settings'` default 'last'.
   Extend `clampSettings` with pickOne/clampInt so each falls back
   independently.
2. `client/src/hooks/useSettings.tsx`: the theme effect also stamps
   `root.dataset.density` and sets `--font-scale` to `fontScale / 100`.
3. `client/index.html` pre-paint script: stamp density and `--font-scale`
   alongside theme — a scaled device flashing 100% is the same flash the theme
   stamp exists to prevent.
4. `client/src/styles.css`:
   - `.shell { zoom: var(--font-scale, 1) }` ported from the dashboard.
   - Restore the viewport divisions the header comment (styles.css:9-14) says
     were deliberately dropped: with `zoom`, `100vh` resolves against the
     unzoomed viewport, so `.rail`'s `height: 100vh` becomes
     `calc(100vh / var(--font-scale, 1))` and the `.wrap.wide` height calc
     likewise. Audit every vh use in the file.
   - One `[data-density="compact"]` block: tighten `--body-pad`, `.guides-card`
     padding, grid gap, bay gaps.
5. `client/src/components/settings/SettingsView.tsx`, Display group: Density
   segmented (Comfortable / Compact), Text size segmented (90/100/110/120%),
   Opens on native select — "Where I left off" / "Guides" / "Settings" — with
   hints adapted from the dashboard's wording.
6. `client/src/App.tsx`: when `settings.landing !== 'last'`, the landing value
   overrides the *initial* section only; the persisted
   `guide-manager.section` keeps recording changes so 'last' keeps working
   when switched back. SettingsProvider already wraps AppShell, so settings
   are readable at first render.

## Test cases

- Unit: `clampSettings` — bad density / fontScale / landing each fall back
  alone without discarding the rest.
- jsdom: density attribute and `--font-scale` land on the root; changing rows
  in SettingsView updates storage.
- jsdom: landing 'guides' overrides a stored section of 'settings' at mount;
  landing 'last' respects the stored section.
- `pnpm test`, `pnpm run typecheck` green.

## Done when

Compact visibly tightens the board; 120% scales without the rail or viewer
overflowing (vh divisions verified at 1280px and phone widths); the landing
choice is honored on reload; tests and typecheck pass.
