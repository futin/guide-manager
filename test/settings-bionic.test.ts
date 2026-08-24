import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

import { BIONIC_STORAGE_KEY, bionicKeyValue, clampSettings, LIMITS } from '../client/src/lib/settings';

const SRC = readFileSync(join(__dirname, '..', 'assets', 'bionic.js'), 'utf8');

interface BionicState { on: boolean; strength: number; freq: number }

/**
 * Load the vendored aid against a fake localStorage seeded by Settings, and ask
 * it what it read back. This is the actual contract between the two: Settings
 * writes the aid's key, the aid validates it independently, and anything the aid
 * rejects it silently replaces with its own defaults — so a value Settings
 * considers valid but the aid does not would make the switch move and nothing
 * change.
 */
function readStateWith(stored: string): BionicState {
  const store = new Map([[BIONIC_STORAGE_KEY, stored]]);
  const sandbox: Record<string, unknown> = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v)
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  const api = sandbox.__bionic as { readState: () => BionicState };
  return { ...api.readState() };
}

describe('Settings <-> vendored reading aid', () => {
  it('writes a value the aid reads back unchanged', () => {
    const settings = clampSettings({ theme: 'amber', bionicOn: true, bionicStrength: 0.65, bionicFreq: 3 });
    expect(readStateWith(JSON.stringify(bionicKeyValue(settings)))).toEqual({
      on: true, strength: 0.65, freq: 3
    });
  });

  it('round-trips the off state too', () => {
    const settings = clampSettings({ bionicOn: false, bionicStrength: 0.3, bionicFreq: 2 });
    expect(readStateWith(JSON.stringify(bionicKeyValue(settings)))).toEqual({
      on: false, strength: 0.3, freq: 2
    });
  });

  it('never writes a value the aid would reject and silently default', () => {
    const settings = clampSettings({ bionicOn: true, bionicStrength: 9, bionicFreq: 42 });
    const state = readStateWith(JSON.stringify(bionicKeyValue(settings)));
    expect(state.strength).toBe(settings.bionicStrength);
    expect(state.freq).toBe(settings.bionicFreq);
  });

  it('agrees with the aid at both ends of every range', () => {
    for (const strength of [LIMITS.bionicStrength.min, LIMITS.bionicStrength.max]) {
      for (const freq of [LIMITS.bionicFreq.min, LIMITS.bionicFreq.max]) {
        const settings = clampSettings({ bionicOn: true, bionicStrength: strength, bionicFreq: freq });
        expect(readStateWith(JSON.stringify(bionicKeyValue(settings)))).toEqual({
          on: true, strength, freq
        });
      }
    }
  });

  it('reads the same key the aid writes from its own in-guide panel', () => {
    // The panel is a local override, not a separate store: both routes converge
    // on one key, so whichever moved last is what both surfaces show.
    expect(BIONIC_STORAGE_KEY).toBe('guide-manager:bionic');
    expect(SRC).toContain("'guide-manager:bionic'");
  });
});
