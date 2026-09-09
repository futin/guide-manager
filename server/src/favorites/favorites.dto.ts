import { parsePosition } from '../progress/progress.dto';
import type { FavoriteDraft } from '../../../shared/types';

// Truncation limits, verbatim from the design doc's "Validation" section and
// the plan's Global Constraints. `html` alone is rejected outright over its
// limit (413) — everything below it is clipped rather than refused, because a
// too-long note or crumb must not cost the reader the clip they came to save.
export const HTML_LIMIT = 512 * 1024;
export const TEXT_LIMIT = 64 * 1024;
export const TITLE_LIMIT = 200;
export const NOTE_LIMIT = 4000;
export const CRUMB_MAX = 6;
export const CRUMB_ENTRY_LIMIT = 200;

export type DraftParse = { draft: FavoriteDraft } | { error: 'missing' } | { error: 'too-large' };

const asString = (v: unknown, limit: number): string =>
  typeof v === 'string' ? v.slice(0, limit) : '';

/** `project`/`guideTitle` carry no length limit of their own — they are short,
 *  registry-sourced strings the client already bounds — so this is just the
 *  "string, or '' when absent or not one" half of asString without a cut. */
const asPlainString = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Context headings above the block, outermost first — at most CRUMB_MAX
 * entries, each cut to CRUMB_ENTRY_LIMIT. A non-array `crumb` (missing,
 * wrong type, whatever a future client bug sends) degrades to an empty
 * trail rather than failing the write: the crumb is metadata about the
 * capture, not the capture itself.
 */
const asCrumb = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  return v
    .filter((entry): entry is string => typeof entry === 'string')
    .slice(0, CRUMB_MAX)
    .map((entry) => entry.slice(0, CRUMB_ENTRY_LIMIT));
};

/**
 * Validate and coerce a POST body into a draft the service can save.
 *
 * Hand-written, like progress.dto.ts's parseRecordProgress: one module with a
 * handful of fields does not justify class-validator, and the anchor's union
 * is the kind of shape a decorator set expresses worst.
 *
 * `title` is cut to its limit but deliberately *not* defaulted here when it
 * trims empty — that backstop needs `crumb` and `text` together and belongs
 * to FavoritesService.create, which has both. This function only ever
 * produces the client's own values, truncated; it never invents a title.
 */
export function parseFavoriteDraft(body: unknown): DraftParse {
  if (!body || typeof body !== 'object') return { error: 'missing' };
  const b = body as Record<string, unknown>;

  if (typeof b.guidePath !== 'string' || b.guidePath.length === 0) return { error: 'missing' };
  if (typeof b.html !== 'string' || b.html.length === 0) return { error: 'missing' };
  if (b.html.length > HTML_LIMIT) return { error: 'too-large' };

  return {
    draft: {
      guidePath: b.guidePath,
      project: asPlainString(b.project),
      guideTitle: asPlainString(b.guideTitle),
      anchor: parsePosition(b.anchor),
      crumb: asCrumb(b.crumb),
      html: b.html,
      text: asString(b.text, TEXT_LIMIT),
      // Cut first, trim after: a title of exactly TITLE_LIMIT characters of
      // trailing whitespace should still end up trimmed, not truncated mid-word
      // by a trim that ran before the cut.
      title: asString(b.title, TITLE_LIMIT).trim(),
      note: asString(b.note, NOTE_LIMIT)
    }
  };
}

export interface FavoritePatch {
  title?: string;
  note?: string;
}

/**
 * Validate a PATCH body. Only `title` and `note` are ever editable after
 * capture — `order` has its own route (PUT /order) and everything else is
 * immutable capture data — so anything else present is silently ignored
 * rather than rejected: a client sending `{ order: 5 }` here is a bug in that
 * client, not a request this route can act on either way.
 *
 * A `title` that trims to '' is treated as absent and the whole patch as
 * unusable, returning null: an empty title would break the wire contract that
 * `Favorite.title` is never empty, and there is no crumb/text to fall back on
 * here the way there is at creation.
 */
export function parseFavoritePatch(body: unknown): FavoritePatch | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  const patch: FavoritePatch = {};
  if (typeof b.title === 'string') {
    const title = b.title.slice(0, TITLE_LIMIT).trim();
    if (title.length === 0) return null;
    patch.title = title;
  }
  if (typeof b.note === 'string') {
    patch.note = b.note.slice(0, NOTE_LIMIT);
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Validate a PUT /order body: `ids` must be 1-1000 non-empty, distinct
 * strings. Anything else is null, and the controller 400s rather than
 * silently reordering a subset — a partial or malformed list almost
 * certainly means the client's own bay list was out of date.
 */
export function parseOrder(body: unknown): string[] | null {
  if (!body || typeof body !== 'object') return null;
  const ids = (body as Record<string, unknown>).ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 1000) return null;
  if (!ids.every((id): id is string => typeof id === 'string' && id.length > 0)) return null;
  if (new Set(ids).size !== ids.length) return null;
  return ids;
}
