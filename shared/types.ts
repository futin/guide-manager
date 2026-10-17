/** The registry file's shape — written by bin/register.js, read by the server. */
export type GuideType = 'study' | 'tutor';

export interface RegistryGuide {
  path: string;
  type: GuideType;
  title: string;
  updated: string;
  /**
   * Optional, unlike the API's: registry files written before this field
   * existed have entries without one, and bin/register.js only heals those on a
   * guide's next re-register. Readers must cope with its absence until then.
   */
  createdAt?: string;
}

export interface RegistryProject {
  name: string;
  path: string;
  guides: RegistryGuide[];
}

export interface Registry {
  projects: RegistryProject[];
}

/**
 * Breadcrumb context for one guide page. A file served merely because it sits
 * next to a registered guide has no registry entry, so `type` and `project`
 * are absent and the crumbs are left off rather than guessed.
 */
export interface GuideMeta {
  title: string;
  type?: GuideType;
  project?: string;
}

/**
 * Where the reader is inside one guide, in the terms that guide actually uses.
 *
 * A single percent cannot express either type honestly. A tutor deck's position
 * is discrete — card 12 of 30, one `.card.active` at a time — and a percent
 * round-trips to the wrong card. A study build is one long page, so a percent
 * *is* its position, but a stored one lands somewhere else the moment the reader
 * changes the text-size setting and the page reflows; a heading id does not move.
 */
export type GuidePosition =
  | {
      kind: 'deck';
      /** Index into the deck's flat, in-document-order card list. */
      cardIndex: number;
      /**
       * The `<section id>` the card sits in, when it sits in one — a deck's
       * opener and its recap card do not. Section ids are permanent by contract
       * (skills/tutor/references/deck.md §6: never reassigned, never reused), so
       * this pair survives an incremental regeneration that shifts every
       * absolute index after the section it rewrote. `cardIndex` is the fallback.
       */
      sectionId?: string;
      /** The card's offset among that section's own cards. */
      cardOffset?: number;
    }
  | {
      kind: 'doc';
      /**
       * Id of the last heading scrolled past. Absent on a build with no id'd
       * headings, where the percent is all there is.
       */
      anchorId?: string;
    };

/** Per-guide reading progress as the API publishes it. Null when never opened. */
export interface GuideProgress {
  /**
   * The guide this row belongs to. Required because `GET /api/progress` returns
   * a flat list, and a list of positions with no paths in it cannot be read.
   */
  guidePath: string;
  /**
   * Where the reader is, 0-100. Named for neither scrolling nor cards, because
   * it is derived from whichever one the guide has: a deck reports
   * `cardIndex / (total - 1)`, a doc its scroll offset. It replaced a
   * `scrollPercent` that no longer told the truth about half the guides.
   */
  percent: number;
  /**
   * The high-water mark, never lowered — see ProgressService.record's `$max`.
   * The board shows this one: glancing back at chapter one must not erase the
   * fact that you had reached chapter nine, and one number cannot say both.
   */
  furthestPercent: number;
  position: GuidePosition | null;
  completed: boolean;
  lastOpenedAt: string;
  openCount: number;
}

export interface GuideEntry {
  path: string;
  title: string;
  type: GuideType;
  updated: string;
  /**
   * First registration, as opposed to `updated`, which is rewritten every time
   * a guide is re-registered. Required here even though the registry's own
   * field is optional — the API fills a legacy entry's gap from `updated`, so a
   * client sorting by it never has to handle a missing one.
   */
  createdAt: string;
  /** Ready-made viewer URL, so the client never has to build the encoding itself. */
  href: string;
  progress: GuideProgress | null;
}

export interface ProjectEntry {
  name: string;
  path: string;
  guides: GuideEntry[];
}

export interface GuidesIndex {
  projects: ProjectEntry[];
}

/**
 * A block picked out of a guide, snapshotted as HTML, with an address, a
 * context trail, a title and a note — see
 * docs/superpowers/specs/2026-09-08-favorites-design.md, "What a favorite is".
 */
export interface Favorite {
  /** Mongo _id, stringified — there is no other stable id for a saved block. */
  id: string;
  /** The key the registry, progress and /guide all use. */
  guidePath: string;
  /**
   * Project *name*, denormalised like reading_progress.project — it is what
   * the capture blob carries and what the bay header prints, so the Favorites
   * view never has to re-derive it from guidePath.
   */
  project: string;
  /** Registry title at capture time; kept even if the guide is later re-titled. */
  guideTitle: string;
  /**
   * Where the block sits, reusing GuidePosition unchanged — open-in-guide is
   * therefore progress restore with a different target, not a second
   * navigation mechanism. Null when nothing addressable was found at capture.
   */
  anchor: GuidePosition | null;
  /** Context headings above the block at capture, outermost first — never one from inside it. */
  crumb: string[];
  /** The snapshot itself: what the reader saw, never re-derived from the guide later. */
  html: string;
  /** textContent, whitespace collapsed — search, and the fallback title source when html carries none. */
  text: string;
  /** Yours. Never empty on the wire: the server defaults it when the client sends none. */
  title: string;
  /** Yours. '' is a valid, saved answer to "why keep this?" */
  note: string;
  /** Manual order within the project bay. Ascending = top: a freshly saved thing is the one being worked on. */
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** POST body. Everything the server fills in — id, order, timestamps — is absent. */
export type FavoriteDraft = Pick<
  Favorite,
  'guidePath' | 'project' | 'guideTitle' | 'anchor' | 'crumb' | 'html' | 'text' | 'title' | 'note'
>;

/** `baseline` is the hand-cut tag versioning starts from — where numbering begins, not a release of anything (README §Releases). */
export type ReleaseType = 'feat' | 'fix' | 'perf' | 'baseline';

/**
 * One annotated `vX.Y.Z` tag of this app's own checkout, as release-kit's `readReleases` returns it. Spelled out here rather than imported so the client
 * bundle never reaches into a server dependency; `test/releases.e2e.test.ts` holds the route to release-kit's own answer, so the two cannot drift.
 */
export interface Release {
  /** No leading `v`: `0.2.0`. */
  version: string;
  /** Tag creation time, ISO. */
  date: string;
  /** The PR title, `type(scope)!: ` prefix included — the drawer strips it, because the badge already says it. */
  title: string;
  type: ReleaseType;
  scope?: string;
  pr?: number;
  breaking: boolean;
  /** The PR body's `## What's new` section, Markdown, `''` when it was empty or missing. */
  notes: string;
  /** The PR's page, only when the origin is on GitHub. */
  url?: string;
}

/** `GET /api/releases`. Always this shape, never an error status: a checkout with no tags, or no checkout at all, is `{ current: null, releases: [] }`. */
export interface ReleasesResponse {
  /** The newest release tag reachable from HEAD, and how many commits HEAD is past it. `null` before the baseline. */
  current: { version: string; ahead: number } | null;
  /** Newest first. */
  releases: Release[];
}
