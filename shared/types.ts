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
