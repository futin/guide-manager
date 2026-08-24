import {
  clampSettings, DEFAULT_SETTINGS, FONT_SCALES, LIMITS, THEMES
} from '../client/src/lib/settings';

describe('clampSettings', () => {
  it('falls back to the default theme for an unknown id', () => {
    expect(clampSettings({ theme: 'neon' }).theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it('keeps a known theme', () => {
    expect(clampSettings({ theme: 'daylight' }).theme).toBe('daylight');
  });

  it('offers exactly the five palettes shared/theme.css defines', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['midnight', 'graphite', 'amber', 'nightshift', 'daylight']);
  });

  it('rejects a stringly-typed boolean', () => {
    expect(clampSettings({ bionicOn: 'true' }).bionicOn).toBe(false);
  });

  it('keeps a real boolean', () => {
    expect(clampSettings({ bionicOn: true }).bionicOn).toBe(true);
  });

  it("clamps fixation strength into the aid's own 0.2-0.8 range", () => {
    expect(clampSettings({ bionicStrength: 0.05 }).bionicStrength).toBe(LIMITS.bionicStrength.min);
    expect(clampSettings({ bionicStrength: 5 }).bionicStrength).toBe(LIMITS.bionicStrength.max);
    expect(LIMITS.bionicStrength).toEqual({ min: 0.2, max: 0.8 });
  });

  it('keeps a strength the aid would accept, without rounding it to a UI stop', () => {
    // A value set from the in-guide panel's slider must survive a Settings
    // render rather than being snapped to the nearest segmented option.
    expect(clampSettings({ bionicStrength: 0.45 }).bionicStrength).toBe(0.45);
  });

  it('clamps frequency to an integer in 1-5', () => {
    expect(clampSettings({ bionicFreq: 0 }).bionicFreq).toBe(1);
    expect(clampSettings({ bionicFreq: 99 }).bionicFreq).toBe(5);
    expect(clampSettings({ bionicFreq: 2.7 }).bionicFreq).toBe(3);
  });

  it('survives a non-object blob', () => {
    expect(clampSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(clampSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(clampSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back per field, so one bad key cannot discard the rest', () => {
    expect(clampSettings({ theme: 'daylight', bionicStrength: 'nope', bionicFreq: 3 })).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'daylight',
      bionicStrength: DEFAULT_SETTINGS.bionicStrength,
      bionicFreq: 3
    });
  });

  it('falls back per field across the display knobs too', () => {
    // One bad display value must not take the other two — or the reading knobs —
    // down with it. Three separate pickers, three independent fallbacks.
    expect(clampSettings({
      density: 'roomy', fontScale: 'huge', landing: 'analytics', theme: 'amber'
    })).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'amber'
    });
  });

  it('keeps each display knob when it is valid', () => {
    const s = clampSettings({ density: 'compact', fontScale: 120, landing: 'settings' });
    expect(s.density).toBe('compact');
    expect(s.fontScale).toBe(120);
    expect(s.landing).toBe('settings');
  });

  it('clamps the text scale to 80-130 and rounds it to an integer', () => {
    expect(clampSettings({ fontScale: 10 }).fontScale).toBe(LIMITS.fontScale.min);
    expect(clampSettings({ fontScale: 400 }).fontScale).toBe(LIMITS.fontScale.max);
    expect(clampSettings({ fontScale: 104.6 }).fontScale).toBe(105);
    expect(LIMITS.fontScale).toEqual({ min: 80, max: 130 });
  });

  it('offers stops that all sit inside the stored range', () => {
    // A stop the clamp would move is a button that flips and shows a different
    // number than the one printed on it.
    for (const stop of FONT_SCALES) {
      expect(clampSettings({ fontScale: stop }).fontScale).toBe(stop);
    }
  });

  it("offers a landing for every section the rail has, plus 'last'", () => {
    // A section the rail can reach but `landing` cannot name is a section you
    // can never choose to open on.
    for (const landing of ['last', 'guides', 'settings']) {
      expect(clampSettings({ landing }).landing).toBe(landing);
    }
  });

  it('stays flat — a nested object could never gain a new field default', () => {
    // usePersistedState shallow-merges the stored blob over the defaults, one
    // level deep. A `bionic: {}` sub-object written by an older build would
    // never pick up a later field's default.
    for (const value of Object.values(DEFAULT_SETTINGS)) {
      expect(typeof value === 'object').toBe(false);
    }
  });
});
