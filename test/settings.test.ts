import { clampSettings, DEFAULT_SETTINGS, LIMITS, THEMES } from '../client/src/lib/settings';

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
      theme: 'daylight',
      bionicOn: false,
      bionicStrength: DEFAULT_SETTINGS.bionicStrength,
      bionicFreq: 3
    });
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
