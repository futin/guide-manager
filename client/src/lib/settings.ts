/**
 * settings.ts — the per-device settings behind the Settings section.
 *
 * Everything here lives in `localStorage['guide-manager.settings']` and never
 * reaches the server. That is the design, not laziness: a phone propped on the
 * desk wants the light theme and a stronger fixation; the laptop wants the dark
 * one. Sharing them would make one device wrong.
 *
 * ⚠️ Keep this object FLAT. `usePersistedState` shallow-merges a stored value
 * over the defaults (`{ ...fallback, ...parsed }`), which is one level deep — a
 * nested object written by an older release would never gain a newly-added inner
 * field's default. That is why the three bionic knobs are three top-level fields
 * rather than one `bionic` sub-object.
 */

import type { Section } from '../components/SideRail';

export const THEMES = [
  { id: 'midnight', label: 'Midnight Radar', hint: 'the original — deep navy scope room' },
  { id: 'graphite', label: 'Graphite', hint: 'neutral dark, no blue cast' },
  { id: 'amber', label: 'Amber CRT', hint: 'black glass and amber phosphor' },
  { id: 'nightshift', label: 'Nightshift', hint: 'deep green radar scope' },
  { id: 'daylight', label: 'Daylight Strip', hint: 'light manila paper, dark ink' }
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
export type Density = 'comfortable' | 'compact';
/**
 * Which section opens on load. `last` restores whatever you were on, which is
 * the default because a reading tool you come back to should still be showing
 * the guide list you left. Built on `Section` rather than a parallel string
 * union so a section added to the rail cannot be silently missing here.
 */
export type Landing = Section | 'last';

export interface Settings {
  theme: ThemeId;
  /** Spacing only — never a colour, never a font size, so it composes with every theme. */
  density: Density;
  /** Percent. Applied as a `zoom` factor on `.shell`. */
  fontScale: number;
  landing: Landing;
  /** Bionic reading: bold a word's opening letters to give the eye a fixation point. */
  bionicOn: boolean;
  /** Fraction of each word bolded. */
  bionicStrength: number;
  /** Bold every Nth word. */
  bionicFreq: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'midnight',
  density: 'comfortable',
  fontScale: 100,
  landing: 'last',
  bionicOn: false,
  bionicStrength: 0.5,
  bionicFreq: 1
};

/**
 * Allowed ranges.
 *
 * ⚠️ The two bionic bounds are NOT chosen here. They are copied from
 * `readState()` in `assets/bionic.js`, which is vendored and must not be edited.
 * If the two ever diverge, the aid silently discards whatever Settings stored
 * and falls back to its own defaults — the switch would move and nothing would
 * change.
 *
 * `fontScale` is ours alone: nothing outside this app reads it, so the bounds
 * only have to keep `.shell{zoom}` in a range the layout survives. Wider than
 * the stops below on purpose — a value typed into localStorage by hand is worth
 * honouring rather than snapping, the same courtesy `bionicStrength` gets.
 */
export const LIMITS = {
  fontScale: { min: 80, max: 130 },
  bionicStrength: { min: 0.2, max: 0.8 },
  bionicFreq: { min: 1, max: 5 }
} as const;

/** The stops the Text size row offers. A subset of LIMITS, not its definition. */
export const FONT_SCALES = [90, 100, 110, 120];

/** The key the vendored aid reads. Its shape is the aid's, not ours. */
export const BIONIC_STORAGE_KEY = 'guide-manager:bionic';
/** The key this app's own settings live under. */
export const SETTINGS_STORAGE_KEY = 'guide-manager.settings';

function pickOne<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Strict: a stored `"true"` from a hand-edit is not a boolean, so it falls back. */
function pickBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clampFloat(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

const THEME_IDS = THEMES.map((t) => t.id);
const DENSITIES = ['comfortable', 'compact'] as const;
/**
 * Every value `landing` may hold. Listed rather than derived because `Section`
 * is a type and has no runtime members to iterate — so a section added to the
 * rail has to be added here too, or it stays unpickable.
 */
const LANDINGS = ['last', 'guides', 'settings'] as const;

/**
 * Coerce anything — a stored blob from an older release, a hand-edited
 * localStorage value, a value written by the in-guide panel's sliders — into
 * usable settings. Pure, and every field falls back independently so one bad key
 * cannot discard the rest.
 *
 * Strength is clamped but never rounded to a UI stop: the in-guide panel writes
 * arbitrary 5% steps, and snapping them here would silently move a setting the
 * reader chose over there.
 */
export function clampSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  return {
    theme: pickOne(s.theme, THEME_IDS, DEFAULT_SETTINGS.theme),
    density: pickOne(s.density, DENSITIES, DEFAULT_SETTINGS.density),
    fontScale: clampInt(
      s.fontScale, DEFAULT_SETTINGS.fontScale,
      LIMITS.fontScale.min, LIMITS.fontScale.max
    ),
    landing: pickOne(s.landing, LANDINGS, DEFAULT_SETTINGS.landing),
    bionicOn: pickBool(s.bionicOn, DEFAULT_SETTINGS.bionicOn),
    bionicStrength: clampFloat(
      s.bionicStrength, DEFAULT_SETTINGS.bionicStrength,
      LIMITS.bionicStrength.min, LIMITS.bionicStrength.max
    ),
    bionicFreq: clampInt(
      s.bionicFreq, DEFAULT_SETTINGS.bionicFreq,
      LIMITS.bionicFreq.min, LIMITS.bionicFreq.max
    )
  };
}

/**
 * The settings translated into the shape `assets/bionic.js` reads.
 *
 * This is the whole reason Settings can act as the central control without the
 * vendored aid needing to know this app exists: the aid keeps its own contract,
 * and we write it.
 */
export function bionicKeyValue(s: Settings): { on: boolean; strength: number; freq: number } {
  return { on: s.bionicOn, strength: s.bionicStrength, freq: s.bionicFreq };
}
