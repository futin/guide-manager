/**
 * The one date format the shell prints: `Sep 17`, or `Sep 17, 2025` when the
 * year is not the current one. Replaces the ISO `slice(0, 10)` the cards used
 * to show — a reader scanning a board wants "how long ago, roughly", and a
 * year that is always the current one is noise on every card.
 *
 * Two input shapes reach it. Full ISO stamps (`updated`, `lastOpenedAt`,
 * `createdAt`) are instants, so they format in local time — the day the reader
 * lived through, not the day in Greenwich. A bare `YYYY-MM-DD` is a calendar
 * date with no instant behind it; `new Date('2026-01-03')` would read it as
 * UTC midnight and print Jan 2 anywhere west of Greenwich, so it is built from
 * its parts as local midnight instead.
 *
 * A value that does not parse comes back unchanged rather than as `Invalid
 * Date`: a hand-edited registry is the likely source, and showing the author
 * their own string is more useful than hiding it.
 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function shortDate(value: string, now: Date = new Date()): string {
  const parts = DATE_ONLY.exec(value);
  const d = parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    : new Date(value);
  if (!value || Number.isNaN(d.getTime())) return value;
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.getFullYear() === now.getFullYear() ? day : `${day}, ${d.getFullYear()}`;
}
