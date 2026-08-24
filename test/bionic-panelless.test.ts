import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ASSETS = join(__dirname, '..', 'assets');
const SRC = readFileSync(join(ASSETS, 'bionic.js'), 'utf8');
const STORAGE_KEY = 'guide-manager:bionic';

interface Listener { (event: { key: string | null }): void }

interface Harness {
  init(): void;
  fire(key: string | null): void;
  setStored(value: unknown): void;
  walks(): number;
}

/**
 * A document with prose but no control panel — what the server splices the aid
 * into when it frames a generated guide.
 *
 * The panel is markup a guide's own build vendors; a build made before the aid
 * existed has none, and there is nowhere to put one in a tutor deck, which has
 * no sidebar at all. So the aid has to run headless, driven only by what the
 * app's Settings page left in localStorage.
 */
function harness(initial: unknown = { on: true, strength: 0.7, freq: 2 }): Harness {
  const listeners: Record<string, Listener[]> = {};
  let walks = 0;
  let stored: unknown = initial;

  const makeEl = (): Record<string, unknown> => ({
    className: '',
    textContent: '',
    querySelectorAll: () => [],
    replaceChild: () => {},
    normalize: () => {}
  });
  const ownerDocument = {
    createTreeWalker: () => {
      walks += 1;
      return { nextNode: () => null };
    },
    createElement: () => makeEl()
  };
  const root = { ...makeEl(), ownerDocument };

  const document = {
    readyState: 'complete',
    body: root,
    // No `.bx-panel`, and none of the control ids the panel would carry.
    querySelector: (sel: string) => (sel === '.bx-panel' ? null : null),
    getElementById: () => null,
    addEventListener: () => {}
  };

  const sandbox: Record<string, unknown> = {
    document,
    localStorage: {
      getItem: () => (stored === null ? null : JSON.stringify(stored)),
      setItem: () => {}
    },
    addEventListener: (type: string, fn: Listener) => {
      (listeners[type] ??= []).push(fn);
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  const api = sandbox.__bionic as { init(): void };

  return {
    init: () => api.init(),
    setStored: (value: unknown) => { stored = value; },
    fire: (key: string | null) => {
      for (const fn of listeners.storage ?? []) fn({ key });
    },
    walks: () => walks
  };
}

describe('bionic without a control panel', () => {
  it('decorates a page that has no panel when the stored state says on', () => {
    const h = harness({ on: true, strength: 0.7, freq: 2 });
    h.init();
    expect(h.walks()).toBeGreaterThan(0);
  });

  it('leaves a panel-less page alone when the stored state says off', () => {
    const h = harness({ on: false, strength: 0.5, freq: 1 });
    h.init();
    expect(h.walks()).toBe(0);
  });

  it('repaints a panel-less page when Settings changes the stored state', () => {
    // The whole point of the panel-less path: the app's Settings page is now the
    // only control such a guide has, and it reaches the framed document through
    // the `storage` event localStorage raises across same-origin documents.
    const h = harness({ on: false, strength: 0.5, freq: 1 });
    h.init();
    expect(h.walks()).toBe(0);

    h.setStored({ on: true, strength: 0.5, freq: 1 });
    h.fire(STORAGE_KEY);
    expect(h.walks()).toBe(1);
  });

  it('ignores an event for another key on a panel-less page', () => {
    const h = harness({ on: false, strength: 0.5, freq: 1 });
    h.init();
    h.fire('some.other.key');
    h.fire(null);
    expect(h.walks()).toBe(0);
  });
});
