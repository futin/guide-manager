export interface RecordProgressDto {
  guidePath: string;
  project: string;
  scrollPercent: number;
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

/**
 * Validate and coerce a POST body. A hand-written guard rather than
 * class-validator: one endpoint with four fields does not justify the
 * dependency or the decorator layer.
 *
 * Returns null when the body is unusable, so the controller can 400 it.
 */
export function parseRecordProgress(body: unknown): RecordProgressDto | null {
  const b = (body && typeof body === 'object' ? body : {}) as Partial<RecordProgressDto>;
  if (typeof b.guidePath !== 'string' || b.guidePath.length === 0) return null;
  return {
    guidePath: b.guidePath,
    project: typeof b.project === 'string' ? b.project : '',
    scrollPercent: clamp(b.scrollPercent),
    completed: b.completed === true ? true : undefined
  };
}
