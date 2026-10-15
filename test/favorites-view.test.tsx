/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import FavoritesView from '../client/src/components/favorites/FavoritesView';
import { useFavorites } from '../client/src/hooks/useFavorites';
import type { Favorite } from '../shared/types';

/** FavoritesView as AppShell mounts it: the data hook one level up, and the scope the rail resolved. Narrowing by the rail itself is driven through App
 *  in app-projects.test.tsx; here the scope is only ever handed in. */
function Board({ scope = 'all' }: { scope?: string }) {
  return <FavoritesView favorites={useFavorites()} scope={scope} />;
}

/**
 * FAVORITES-API — the shared fixture named in
 * .superpowers/sdd/2026-09-08-favorites/global-constraints.md, reproduced
 * here field-for-field including the anchor objects' own key order (JSON.
 * stringify walks insertion order, and one of the assertions below pins the
 * exact encoded query string a card's crumb link produces). Already in the
 * project-asc/order-asc order GET /api/favorites itself returns.
 */
const FAVORITES: Favorite[] = [
  {
    id: 'f4',
    project: 'claude-agents-dashboard',
    guideTitle: 'Hooks',
    guidePath: '/g/hooks/index.html',
    order: 0,
    title: 'Held socket',
    crumb: ['The held socket'],
    html:
      '<p onclick="x()">hi<script>evil()</script></p>' +
      '<a href="javascript:x()">j</a><a href="https://e.com">e</a>',
    text: 'hi j e',
    note: '',
    anchor: { kind: 'doc', anchorId: 'held-socket--3' },
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z'
  },
  {
    id: 'f1',
    project: 'german-study-partner',
    guideTitle: 'Personalpronomen',
    guidePath: '/g/pp.html',
    order: -1,
    title: 'Die Tabelle',
    crumb: ['§1 · Die Tabelle', 'Die Tabelle'],
    html: '<table><tr><th>Nom</th></tr><tr><td>ich</td></tr></table>',
    text: 'Nom ich',
    note: 'nine persons two cases',
    anchor: { kind: 'deck', cardIndex: 2, sectionId: 's1', cardOffset: 1 },
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z'
  },
  {
    id: 'f2',
    project: 'german-study-partner',
    guideTitle: 'Personalpronomen',
    guidePath: '/g/pp.html',
    order: 0,
    title: 'Quiz',
    crumb: ['§1 · Die Tabelle'],
    html:
      '<div class="card card-quiz"><p class="quiz-prompt">Q?</p>' +
      '<div class="quiz-options"><div class="quiz-option">' +
      '<button class="quiz-option-btn">A</button><p class="quiz-feedback">nein</p>' +
      '</div></div></div>',
    text: 'Q? A nein',
    note: '',
    anchor: { kind: 'deck', cardIndex: 3, sectionId: 's1', cardOffset: 2 },
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z'
  },
  {
    id: 'f3',
    project: 'german-study-partner',
    guideTitle: 'Konnektoren',
    guidePath: '/g/k.html',
    order: 1,
    title: 'Konnektoren',
    crumb: [],
    html: '<p>weil</p>',
    text: 'weil',
    note: '',
    anchor: null,
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z'
  }
];

/** One recorded fetch call — every request this suite's stub answers, GET
 *  included, so Task 8's tests can assert the exact PATCH/PUT/DELETE a
 *  control sends rather than only its visible on-screen effect. */
interface Call {
  url: string;
  method: string;
  body: unknown;
}

/**
 * `favorites` is the GET /api/favorites payload; pass 'reject' to make the
 * fetch itself fail, exercising the hook's error branch. Every GET answers
 * this same payload, mount or refetch alike — there is no need for a second,
 * differently-shaped response the way test/use-favorites.test.ts's own stub
 * offers: a refetch triggered by a mutation's failure is proven by handing
 * it back the *original*, unmodified FAVORITES, which is already different
 * from whatever the optimistic local guess just wrote, so seeing the board
 * return to it is proof enough that the guess was thrown away.
 *
 * `failNext(method)` arms exactly one upcoming call to that method to answer
 * `ok:false` (then disarms itself) — enough to exercise the refetch-on-
 * failure fallback without a second call ever needing a different shape.
 */
function mockFetch(favorites: Favorite[] | 'reject'): { calls: Call[]; failNext: (method: string) => void } {
  const calls: Call[] = [];
  const failing = new Set<string>();
  (globalThis as { fetch?: unknown }).fetch = jest.fn((url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET') as string;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    if (method === 'GET') {
      if (favorites === 'reject') return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(favorites) });
    }
    const shouldFail = failing.has(method);
    failing.delete(method);
    return Promise.resolve({ ok: !shouldFail, json: () => Promise.resolve({}) });
  });
  return { calls, failNext: (method: string) => failing.add(method) };
}

function renderView(favorites: Favorite[] | 'reject' = FAVORITES, scope = 'all') {
  const fetchStub = mockFetch(favorites);
  render(<Board scope={scope} />);
  return fetchStub;
}

/** The german section's cards, title-only, in on-screen order — used by the
 *  reorder tests to prove the board repaints in the new order at once,
 *  before any request has had a chance to resolve. */
function germanTitles(): (string | null)[] {
  const section = document.querySelectorAll('.fav-project')[1] as HTMLElement;
  return [...section.querySelectorAll('.fav-title')].map((el) => el.textContent);
}

/** A project section's own heading, found by project name — `.fav-project-name` rather than the bare text, because the band names the scoped project
 *  too and a plain text query would find both. */
function bayName(project: string): HTMLElement | null {
  return screen.queryByText(project, { selector: '.fav-project-name' });
}

/** The band's title and its one line, as rendered text. */
const bandTitle = () => document.querySelector('.fav-band h1')?.textContent;
const bandLine = () => document.querySelector('.fav-band p')?.textContent;
const emptyLine = () => document.querySelector('.empty-line')?.textContent;

/** A favorite's card, found by its own title — every FAVORITES-API title is
 *  unique, so this is unambiguous. */
function cardFor(title: string): HTMLElement {
  const el = [...document.querySelectorAll('.fav-card')].find(
    (card) => card.querySelector('.fav-title')?.textContent === title
  );
  if (!el) throw new Error(`no .fav-card titled ${title}`);
  return el as HTMLElement;
}

describe('FavoritesView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /* The bay's `N favorite(s)` count went with its redraw: the band's line counts the scope once, and a section is only its name over its sheets. */
  it('groups favorites into one section per project in server order, each under its name and with no count of its own', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    const names = [...document.querySelectorAll('.fav-project-name')].map((el) => el.textContent);
    expect(names).toEqual(['claude-agents-dashboard', 'german-study-partner']);
    expect(screen.queryByText(/^\d+ favorites?$/)).toBeNull();
    /* No collapse: a section heading is not a disclosure. */
    expect(document.querySelector('.fav-project [aria-expanded]')).toBeNull();
  });

  it('names the scope in the band and counts blocks and distinct guides under it, unscoped', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    expect(bandTitle()).toBe('Favorites · All projects');
    expect(bandLine()).toBe('4 saved blocks from 3 guides · newest on top');
  });

  /* M counts distinct guidePaths in scope: german's three favorites come from two guides (pp.html twice, k.html once). */
  it('names the scoped project in the band and counts its blocks from its distinct guides', async () => {
    renderView(FAVORITES, 'german-study-partner');
    await waitFor(() => expect(screen.getByText('Die Tabelle')).toBeTruthy());

    expect(bandTitle()).toBe('Favorites · german-study-partner');
    expect(bandLine()).toBe('3 saved blocks from 2 guides · newest on top');
  });

  it('says block and guide in the singular for one of each', async () => {
    renderView(FAVORITES, 'claude-agents-dashboard');
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    expect(bandTitle()).toBe('Favorites · claude-agents-dashboard');
    expect(bandLine()).toBe('1 saved block from 1 guide · newest on top');
  });

  it('offers search as the only toolbar control, placeholder and label both `Search favorites`', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    const search = screen.getByLabelText('Search favorites') as HTMLInputElement;
    expect(search.placeholder).toBe('Search favorites');
    expect(document.querySelectorAll('.fav-toolbar select, .fav-toolbar button')).toHaveLength(0);
  });

  it("orders the german bay's cards ascending by the favorite's own order field", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    expect(germanTitles()).toEqual(['Die Tabelle', 'Quiz', 'Konnektoren']);
  });

  it('shows the exact empty-state copy when nothing is saved at all', async () => {
    renderView([]);
    // Both loading and the empty result render .empty-line, so waiting for
    // the class alone can catch the "Loading…" render still on screen — wait
    // for the actual final copy instead.
    await waitFor(() =>
      expect(emptyLine()).toBe(
        'Nothing saved yet — open a guide and tap ☆ in its header to keep a table, a diagram or a paragraph here.'
      )
    );
  });

  it("shows the exact error copy when the fetch rejects", async () => {
    renderView('reject');
    await waitFor(() => expect(emptyLine()).toBe("Couldn't load favorites"));
  });

  it('shows `Loading…` until the first answer lands', async () => {
    renderView();
    expect(emptyLine()).toBe('Loading…');
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());
  });

  it('shows `No matches` when a search hits nothing', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Search favorites'), { target: { value: 'zzz-nothing' } });
    expect(emptyLine()).toBe('No matches');
  });

  /*
    The crumb points at the *app* (`/?open=`), not at `GET /guide`. Linking
    straight at the render route navigated out of the SPA onto the server's
    inner page shell, which is built to be framed and therefore opens full-bleed
    with none of the viewer's chrome. Pinned as the exact encoded string because
    the other end of this link is a different file (lib/deeplink.ts, read by
    App and GuidesView) and a silent disagreement between them just looks like a
    board that opened on the board.
  */
  it("builds f1's crumb link with the exact encoded anchor and joined text", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    const link = cardFor('Die Tabelle').querySelector('a.fav-crumb') as HTMLAnchorElement;
    expect(link.textContent).toBe('Personalpronomen › §1 · Die Tabelle › Die Tabelle ↗');
    expect(link.getAttribute('href')).toBe(
      '/?open=%2Fg%2Fpp.html&at=%7B%22kind%22%3A%22deck%22%2C%22cardIndex%22%3A2%2C%22sectionId%22%3A%22s1%22%2C%22cardOffset%22%3A1%7D'
    );
    expect(link.target).toBe('_top');
  });

  it("builds f3's crumb link with no anchor query when it has none", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    const link = cardFor('Konnektoren').querySelector('a.fav-crumb') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/?open=%2Fg%2Fk.html');
  });

  it("gives each card the pill its anchor's kind implies, or none", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    expect(cardFor('Die Tabelle').querySelector('.pill')?.classList.contains('tutor')).toBe(true);
    expect(cardFor('Held socket').querySelector('.pill')?.classList.contains('study')).toBe(true);
    expect(cardFor('Konnektoren').querySelector('.pill')).toBeNull();
  });

  /* The capture date, in the shell's one date format. `now` is pinned so the year is the current one and the date prints without it; only Date is
     faked, so the fetch promises and waitFor's own timers run as usual. */
  it('signs each sheet off with `Saved <short date>`', async () => {
    jest.useFakeTimers({
      now: new Date('2026-10-14T12:00:00Z'),
      doNotFake: [
        'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
        'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'
      ]
    });
    try {
      renderView([{ ...FAVORITES[3], createdAt: '2026-10-11T12:00:00Z' }]);
      await waitFor(() => expect(screen.getByText('Konnektoren')).toBeTruthy());
      expect(cardFor('Konnektoren').querySelector('.fav-foot')?.textContent).toBe('Saved Oct 11');
    } finally {
      jest.useRealTimers();
    }
  });

  it('narrows to matching cards on search, dropping an emptied bay whole', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Search favorites'), { target: { value: 'weil' } });

    expect(bayName('claude-agents-dashboard')).toBeNull();
    expect(bayName('german-study-partner')).toBeTruthy();
    expect(document.querySelectorAll('.fav-card')).toHaveLength(1);
    expect(screen.getByText('Konnektoren')).toBeTruthy();
    expect(screen.queryByText('Die Tabelle')).toBeNull();
    expect(screen.queryByText('Quiz')).toBeNull();
  });

  it("matches on the note field alone ('persons' hits only Die Tabelle)", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Search favorites'), { target: { value: 'persons' } });

    expect(screen.getByText('Die Tabelle')).toBeTruthy();
    expect(screen.queryByText('Quiz')).toBeNull();
    expect(screen.queryByText('Konnektoren')).toBeNull();
    expect(screen.queryByText('Held socket')).toBeNull();
  });

  it("matches on the snapshot text field, case-insensitively ('Nom' hits only Die Tabelle)", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Search favorites'), { target: { value: 'Nom' } });

    expect(screen.getByText('Die Tabelle')).toBeTruthy();
    expect(screen.queryByText('Quiz')).toBeNull();
    expect(screen.queryByText('Konnektoren')).toBeNull();
    expect(screen.queryByText('Held socket')).toBeNull();
  });

  it("matches on title, dropping the other bay whole ('held' keeps only the dashboard bay)", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Search favorites'), { target: { value: 'held' } });

    expect(bayName('claude-agents-dashboard')).toBeTruthy();
    expect(bayName('german-study-partner')).toBeNull();
  });

  /* Picking the scope is the rail's, and is driven through App in app-projects.test.tsx; the board only narrows to what it is handed. */
  /* Scoped, the band names the project, so no section heading repeats it under the band — the Guides board's rule. */
  it('narrows to the scoped project, with the band naming it rather than a section heading', async () => {
    renderView(FAVORITES, 'german-study-partner');
    await waitFor(() => expect(screen.getByText('Die Tabelle')).toBeTruthy());

    expect(screen.queryByText('Held socket')).toBeNull();
    expect(document.querySelectorAll('.fav-project-name')).toHaveLength(0);
    expect([...document.querySelectorAll('.fav-title')].map((el) => el.textContent)).toEqual(['Die Tabelle', 'Quiz', 'Konnektoren']);
    expect(screen.queryByLabelText('Project')).toBeNull();
  });

  /* AppShell resolves a stale name to ALL before it gets here, but the board does not lean on that. */
  it('shows every bay for a scope no favorite carries, rather than blanking the board', async () => {
    renderView(FAVORITES, 'nope');
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    expect(bayName('claude-agents-dashboard')).toBeTruthy();
    expect(bayName('german-study-partner')).toBeTruthy();
  });

  /* The hook lives in AppShell now, so leaving and re-entering Favorites no longer remounts it; the view asks again itself, or a favorite saved
     inside a guide would stay off the board until a reload. */
  it('asks for the favorites again each time it mounts', async () => {
    const { calls } = renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());
    expect(calls.filter((c) => c.method === 'GET' && c.url === '/api/favorites')).toHaveLength(2);
  });

  it("renders f4's snapshot body sanitised — no script, no onclick, the unwrapped 'j' text, and the https anchor kept with target=_blank", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    const body = cardFor('Held socket').querySelector('.fav-body') as HTMLElement;
    expect(body.querySelector('script')).toBeNull();
    expect(body.querySelector('p')?.hasAttribute('onclick')).toBe(false);
    expect(body.textContent).toContain('j');
    // 'j' came from the unwrapped javascript: anchor, so there must be no <a>
    // wrapping it left behind.
    expect([...body.querySelectorAll('a')].some((a) => a.textContent === 'j')).toBe(false);
    const eAnchor = [...body.querySelectorAll('a')].find((a) => a.textContent === 'e');
    expect(eAnchor?.getAttribute('target')).toBe('_blank');
  });

  it("renders f1's snapshot body as a real table with the 'ich' cell intact", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    const body = cardFor('Die Tabelle').querySelector('.fav-body') as HTMLElement;
    const table = body.querySelector('table');
    expect(table).toBeTruthy();
    expect(table?.textContent).toContain('ich');
  });

  it("toggles f2's quiz option revealed on click, and back off on a second click", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    const body = cardFor('Quiz').querySelector('.fav-body') as HTMLElement;
    const option = body.querySelector('.quiz-option') as HTMLElement;
    const btn = body.querySelector('.quiz-option-btn') as HTMLElement;
    expect(option.className).not.toContain('revealed');

    fireEvent.click(btn);
    expect(option.className).toContain('revealed');

    fireEvent.click(btn);
    expect(option.className).not.toContain('revealed');
  });
});

/**
 * Task 8 — card controls. `cardFor(title)` returns a stable reference to the
 * `<article class="fav-card">` itself (FavoriteCard's own root element),
 * which React updates in place rather than recreating, so a card captured
 * before an edit starts stays valid to query against after the field it
 * contains has swapped from a span/div to an input/textarea or back.
 */
describe('FavoritesView — card controls (Task 8)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows f1's title as a prefilled input on click, and commits a changed value on Enter", async () => {
    const { calls } = renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    const card = cardFor('Die Tabelle');
    fireEvent.click(card.querySelector('.fav-title') as HTMLElement);
    const input = card.querySelector('.fav-title-input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('Die Tabelle');

    fireEvent.change(input, { target: { value: 'Pronomen' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(card.querySelector('.fav-title')?.textContent).toBe('Pronomen'));
    const patches = calls.filter((c) => c.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ url: '/api/favorites/f1', body: { title: 'Pronomen' } });
  });

  it("reverts f1's title on Escape mid-edit, sending no request", async () => {
    const { calls } = renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    const card = cardFor('Die Tabelle');
    fireEvent.click(card.querySelector('.fav-title') as HTMLElement);
    const input = card.querySelector('.fav-title-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Something else' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(card.querySelector('.fav-title')?.textContent).toBe('Die Tabelle');
    expect(card.querySelector('.fav-title-input')).toBeNull();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it("leaves f1's title unchanged when the edit blurs empty, sending no request", async () => {
    const { calls } = renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    const card = cardFor('Die Tabelle');
    fireEvent.click(card.querySelector('.fav-title') as HTMLElement);
    const input = card.querySelector('.fav-title-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(card.querySelector('.fav-title')?.textContent).toBe('Die Tabelle');
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it("edits f2's empty note: clicking 'Add a note' shows a textarea, blur with a value patches and repaints", async () => {
    const { calls } = renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    const card = cardFor('Quiz');
    expect(card.querySelector('.fav-note')?.textContent).toBe('Add a note');
    expect(card.querySelector('.fav-note')?.className).toContain('empty');

    fireEvent.click(card.querySelector('.fav-note') as HTMLElement);
    const textarea = card.querySelector('.fav-note-input') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    fireEvent.change(textarea, { target: { value: 'x' } });
    fireEvent.blur(textarea);

    await waitFor(() => expect(card.querySelector('.fav-note')?.textContent).toBe('x'));
    const patches = calls.filter((c) => c.method === 'PATCH' && c.url === '/api/favorites/f2');
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ note: 'x' });
  });

  it("disables f1's Move up / Move to top and f3's Move down at the bay's edges", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    const f1 = cardFor('Die Tabelle');
    expect((within(f1).getByLabelText('Move up') as HTMLButtonElement).disabled).toBe(true);
    expect((within(f1).getByLabelText('Move to top') as HTMLButtonElement).disabled).toBe(true);

    const f3 = cardFor('Konnektoren');
    expect((within(f3).getByLabelText('Move down') as HTMLButtonElement).disabled).toBe(true);
  });

  it("moves f1 down: PUTs the swapped order and repaints before the response resolves", async () => {
    const { calls } = renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    fireEvent.click(within(cardFor('Die Tabelle')).getByLabelText('Move down'));

    // Read synchronously, before any promise the click just kicked off has
    // had a microtask to resolve in — proves the reorder is applied to
    // local state first, exactly like updateFavorite/removeFavorite's own
    // optimistic-update contract in useFavorites.ts.
    expect(germanTitles()).toEqual(['Quiz', 'Die Tabelle', 'Konnektoren']);

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toBe('/api/favorites/order');
    expect(put?.body).toEqual({ ids: ['f2', 'f1', 'f3'] });
  });

  it("moves f3 to the top: PUTs the front-inserted order", async () => {
    const { calls } = renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    fireEvent.click(within(cardFor('Konnektoren')).getByLabelText('Move to top'));

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.body).toEqual({ ids: ['f3', 'f1', 'f2'] });
  });

  it("reverts to the server's order when the PUT answers ok:false, after a second GET", async () => {
    const { calls, failNext } = renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());
    failNext('PUT');

    fireEvent.click(within(cardFor('Die Tabelle')).getByLabelText('Move down'));
    expect(germanTitles()).toEqual(['Quiz', 'Die Tabelle', 'Konnektoren']);

    await waitFor(() => expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2));
    await waitFor(() => expect(germanTitles()).toEqual(['Die Tabelle', 'Quiz', 'Konnektoren']));
  });

  it('hides every reorder control — buttons and handle — while a search narrows the board', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Search favorites'), { target: { value: 'Tabelle' } });

    const card = cardFor('Die Tabelle');
    expect(card.querySelector('.fav-up')).toBeNull();
    expect(card.querySelector('.fav-down')).toBeNull();
    expect(card.querySelector('.fav-top')).toBeNull();
    expect(card.querySelector('.fav-handle')).toBeNull();
  });

  /* The four keys, in the order the sheet draws them: ⤒ first, because the top is where a new favorite lands and where a kept one is sent back to. */
  it('draws the keys as 30×30 .key buttons in the order Move to top, Move up, Move down, Remove', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    const keys = [...cardFor('Quiz').querySelectorAll('.fav-ctls button')];
    expect(keys.map((k) => k.getAttribute('aria-label'))).toEqual(['Move to top', 'Move up', 'Move down', 'Remove']);
    expect(keys.every((k) => k.classList.contains('key'))).toBe(true);
  });

  it("arms f3's remove on the first click to a visible `Remove?`, sending no request yet", async () => {
    const { calls } = renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    const remove = within(cardFor('Konnektoren')).getByLabelText('Remove');
    expect(remove.textContent).toBe('');
    fireEvent.click(remove);

    expect(remove.textContent).toBe('Remove?');
    expect(remove.getAttribute('aria-label')).toBe('Confirm remove');
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it("deletes f3 on the second tap: DELETEs, drops the card, and the band recounts", async () => {
    const { calls } = renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    const remove = within(cardFor('Konnektoren')).getByLabelText('Remove');
    fireEvent.click(remove);
    fireEvent.click(screen.getByLabelText('Confirm remove'));

    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    const del = calls.find((c) => c.method === 'DELETE');
    expect(del?.url).toBe('/api/favorites/f3');
    expect(screen.queryByText('Konnektoren')).toBeNull();

    expect(germanTitles()).toEqual(['Die Tabelle', 'Quiz']);
    expect(bandLine()).toBe('3 saved blocks from 2 guides · newest on top');
  });

  it("disarms f3's remove back to idle on blur, without deleting", async () => {
    const { calls } = renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    const remove = within(cardFor('Konnektoren')).getByLabelText('Remove');
    fireEvent.click(remove);
    fireEvent.blur(screen.getByLabelText('Confirm remove'));

    expect(within(cardFor('Konnektoren')).getByLabelText('Remove').textContent).toBe('');
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it(
    "commits a second title edit by blur, after an earlier edit on the same " +
      'mounted card exited via Enter (Fix round 1 — skipTitleBlurRef must not ' +
      'stay latched across edit sessions)',
    async () => {
      const { calls } = renderView();
      await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

      const card = cardFor('Die Tabelle');

      // First edit session: exits via Enter. This arms the skip-blur latch
      // (see FavoriteCard's docblock) — jsdom never fires the compensating
      // blur that would otherwise consume it, so the latch is left `true`
      // once this session ends.
      fireEvent.click(card.querySelector('.fav-title') as HTMLElement);
      let input = card.querySelector('.fav-title-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Pronomen' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => expect(card.querySelector('.fav-title')?.textContent).toBe('Pronomen'));

      // Second edit session on the very same mounted card: exits via a
      // genuine blur — no Enter, no Escape. If the latch from the first
      // session was never reset, this blur reads it as `true`, silently
      // drops the edit, and `editingTitle` never flips back to false —
      // the input stays rendered instead of closing.
      fireEvent.click(card.querySelector('.fav-title') as HTMLElement);
      input = card.querySelector('.fav-title-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Nomen' } });
      fireEvent.blur(input);

      await waitFor(() => expect(card.querySelector('.fav-title')?.textContent).toBe('Nomen'));
      expect(card.querySelector('.fav-title-input')).toBeNull();
      const patches = calls.filter((c) => c.method === 'PATCH' && c.url === '/api/favorites/f1');
      expect(patches).toHaveLength(2);
      expect(patches[1].body).toEqual({ title: 'Nomen' });
    }
  );

  it(
    "commits a second note edit by blur, after an earlier edit on the same " +
      'mounted card exited via Escape (Fix round 1 — skipNoteBlurRef must not ' +
      'stay latched across edit sessions)',
    async () => {
      const { calls } = renderView();
      await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

      const card = cardFor('Quiz'); // f2 — starts with an empty note.

      // First edit session: exits via Escape, discarding the draft. This
      // arms the skip-blur latch the same way Enter does for the title.
      fireEvent.click(card.querySelector('.fav-note') as HTMLElement);
      let textarea = card.querySelector('.fav-note-input') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'discarded' } });
      fireEvent.keyDown(textarea, { key: 'Escape' });
      expect(card.querySelector('.fav-note')?.textContent).toBe('Add a note');

      // Second edit session: exits via a genuine blur. A stale latch would
      // drop this commit and leave the textarea open.
      fireEvent.click(card.querySelector('.fav-note') as HTMLElement);
      textarea = card.querySelector('.fav-note-input') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'kept' } });
      fireEvent.blur(textarea);

      await waitFor(() => expect(card.querySelector('.fav-note')?.textContent).toBe('kept'));
      expect(card.querySelector('.fav-note-input')).toBeNull();
      const patches = calls.filter((c) => c.method === 'PATCH' && c.url === '/api/favorites/f2');
      expect(patches).toHaveLength(1);
      expect(patches[0].body).toEqual({ note: 'kept' });
    }
  );

  it("drops f3 onto f1: PUTs f3 moved into f1's position", async () => {
    const { calls } = renderView();
    await waitFor(() => expect(screen.getByText('Held socket')).toBeTruthy());

    // A minimal DataTransfer stand-in — jsdom's own does not implement
    // set/getData round-tripping — shared between the two dispatched events
    // exactly as a real drag's one DataTransfer object would be.
    const data: Record<string, string> = {};
    const dataTransfer = {
      setData: (k: string, v: string) => {
        data[k] = v;
      },
      getData: (k: string) => data[k] ?? ''
    };

    const sourceHandle = cardFor('Konnektoren').querySelector('.fav-handle') as HTMLElement;
    fireEvent.dragStart(sourceHandle, { dataTransfer });
    fireEvent.drop(cardFor('Die Tabelle'), { dataTransfer });

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.body).toEqual({ ids: ['f3', 'f1', 'f2'] });
  });
});
