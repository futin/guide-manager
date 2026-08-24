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
  /** Change what localStorage reports, so a fired event carries new state. */
  setStored(value: unknown): void;
  /** How many times the aid walked the document — i.e. how many times apply() ran. */
  walks(): number;
  /** The panel controls, so the values the listener syncs into them are observable. */
  el(id: string): Record<string, unknown>;
}

/**
 * A DOM stub just rich enough for init() to bind.
 *
 * The listener under test calls the module-local `apply`, not the one exported on
 * `__bionic` — so wrapping the export would observe nothing. The observable
 * effects are instead: `createTreeWalker` (apply walks the document exactly once
 * per run) and the panel control values the listener writes back.
 */
function harness(initial: unknown = { on: true, strength: 0.7, freq: 2 }): Harness {
  const listeners: Record<string, Listener[]> = {};
  let walks = 0;
  let stored: unknown = initial;

  const elements = new Map<string, Record<string, unknown>>();
  const makeEl = (): Record<string, unknown> => ({
    checked: false,
    value: '50',
    disabled: false,
    hidden: false,
    textContent: '',
    className: '',
    addEventListener: () => {},
    setAttribute: () => {},
    getAttribute: () => 'false',
    querySelectorAll: () => [],
    replaceChild: () => {},
    normalize: () => {}
  });
  const byId = (id: string): Record<string, unknown> => {
    if (!elements.has(id)) elements.set(id, makeEl());
    return elements.get(id) as Record<string, unknown>;
  };

  const ownerDocument = {
    createTreeWalker: () => {
      walks += 1;
      return { nextNode: () => null };
    },
    createElement: () => makeEl()
  };
  const root = { ...makeEl(), ownerDocument, querySelectorAll: () => [] };
  const panel = { ...makeEl(), querySelector: () => makeEl() };

  const document = {
    readyState: 'complete',
    body: root,
    querySelector: (sel: string) => (sel === '.bx-panel' ? panel : root),
    getElementById: byId,
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
    walks: () => walks,
    el: byId
  };
}

describe('bionic storage propagation', () => {
  it('registers a storage listener when it initialises', () => {
    // Without this the other cases would pass vacuously: fire() on an empty
    // listener list is a silent no-op.
    const h = harness();
    h.init();
    const before = h.walks();
    h.fire(STORAGE_KEY);
    expect(h.walks()).toBeGreaterThan(before);
  });

  it('re-applies the decoration when the aid key changes', () => {
    const h = harness();
    h.init();
    const afterInit = h.walks();
    h.fire(STORAGE_KEY);
    h.fire(STORAGE_KEY);
    expect(h.walks()).toBe(afterInit + 2);
  });

  it('syncs the panel controls to settings stored AFTER it initialised', () => {
    // Started at 30%/1st, then Settings (another document) wrote 70%/2nd. The
    // panel has to catch up, or the in-guide override would show a stale value
    // and writing from it would silently undo the change.
    const h = harness({ on: true, strength: 0.3, freq: 1 });
    h.init();
    expect(h.el('bx-strength').value).toBe('30');

    h.setStored({ on: true, strength: 0.7, freq: 2 });
    h.fire(STORAGE_KEY);
    expect(h.el('bx-on').checked).toBe(true);
    expect(h.el('bx-strength').value).toBe('70');
    expect(h.el('bx-freq').value).toBe('2');
  });

  it('strips the decoration when the stored state turns bionic off', () => {
    const h = harness({ on: true, strength: 0.5, freq: 1 });
    h.init();
    const afterInit = h.walks();
    expect(afterInit).toBeGreaterThan(0); // it was decorating to begin with

    h.setStored({ on: false, strength: 0.5, freq: 1 });
    h.fire(STORAGE_KEY);
    // restore() alone, no fresh walk — the page goes back to plain text nodes.
    expect(h.walks()).toBe(afterInit);
    expect(h.el('bx-on').checked).toBe(false);
  });

  it('ignores an event for any other key', () => {
    const h = harness();
    h.init();
    const before = h.walks();
    h.fire('some.other.key');
    h.fire(null);
    expect(h.walks()).toBe(before);
  });

  it('is still the vendored file, only version-bumped', () => {
    for (const name of ['bionic.js', 'bionic.css', 'bionic.html']) {
      expect(readFileSync(join(ASSETS, name), 'utf8'))
        .toMatch(/bionic v2 — vendored from guide-manager assets\/; do not edit here/);
    }
  });
});
