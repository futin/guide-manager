import type { GuidePosition } from '../../../shared/types';

export interface RecordProgressDto {
  guidePath: string;
  project: string;
  percent: number;
  /**
   * Null means "this write carries no position", which is not the same as
   * "clear the stored one" — see ProgressService.record. A reporter write always
   * has both halves, but a malformed position is downgraded to null here rather
   * than failing the whole write.
   */
  position: GuidePosition | null;
  /**
   * Set by the injected reporter's first write per page load, and by nothing
   * else. `openCount` increments on this flag alone: every later write in the
   * same session reports a position, not a visit, and a count that included
   * them would be a count of scroll events wearing a session counter's name.
   */
  opened?: true;
  /**
   * Undefined means "no opinion", not false. A write that omits it must leave a
   * stored `true` alone — finishing a guide is a fact, and a later glance at
   * page one is not evidence you unread it.
   */
  completed?: true;
}

const clamp = (n: unknown): number => {
  const v = typeof n === 'number' ? n : Number.parseFloat(String(n));
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, Math.round(v)));
};

/** A non-negative integer, or null for anything that is not one. Card indexes
 *  and offsets are both counts into a list, so both go through here. */
const index = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/**
 * Validate a position by its own `kind`, returning null for anything that does
 * not describe a place a guide actually has.
 *
 * A null here does not fail the write — see parseRecordProgress. The percent
 * arrives from the same event and is the half the board renders, so discarding
 * the reader's place to reject a field nothing reads yet would be the worse
 * trade. It is also the honest reading of an unknown `kind`: a future guide type
 * reporting a shape this server has never heard of should degrade to a percent,
 * not 400 the reader's session.
 */
function parsePosition(v: unknown): GuidePosition | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>;

  if (p.kind === 'deck') {
    // cardIndex is the one required field: it is the fallback the section pair
    // degrades to, so a deck position without it cannot be restored at all.
    const cardIndex = index(p.cardIndex);
    if (cardIndex === null) return null;
    const out: GuidePosition = { kind: 'deck', cardIndex };
    if (typeof p.sectionId === 'string' && p.sectionId.length > 0) out.sectionId = p.sectionId;
    const offset = index(p.cardOffset);
    if (offset !== null) out.cardOffset = offset;
    return out;
  }

  if (p.kind === 'doc') {
    // A doc position with no anchor is still a position: the percent stored
    // beside it is what a build with no id'd headings has to resume from.
    return typeof p.anchorId === 'string' && p.anchorId.length > 0
      ? { kind: 'doc', anchorId: p.anchorId }
      : { kind: 'doc' };
  }

  return null;
}

/**
 * Validate and coerce a POST body. A hand-written guard rather than
 * class-validator: one endpoint with six fields does not justify the dependency
 * or the decorator layer, and the position's union is the kind of shape a
 * decorator set expresses worst.
 *
 * Returns null when the body is unusable, so the controller can 400 it. Only a
 * missing `guidePath` is unusable — without it there is no row to write.
 */
export function parseRecordProgress(body: unknown): RecordProgressDto | null {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof b.guidePath !== 'string' || b.guidePath.length === 0) return null;
  return {
    guidePath: b.guidePath,
    project: typeof b.project === 'string' ? b.project : '',
    percent: clamp(b.percent),
    position: parsePosition(b.position),
    opened: b.opened === true ? true : undefined,
    completed: b.completed === true ? true : undefined
  };
}
