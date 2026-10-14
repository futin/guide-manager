import { shortDate } from '../client/src/lib/dates';

/*
  Every timestamp here sits at noon UTC (or is a bare calendar date), because
  jest runs in the host's own timezone — jest.config.ts sets none — and a value
  within 12 h of midnight would read as a different day on some machine.
*/
const now = new Date('2026-10-14T12:00:00Z');

describe('shortDate', () => {
  it('prints month and day for a date in the current year', () => {
    expect(shortDate('2026-09-17T12:00:00Z', now)).toBe('Sep 17');
  });

  it('adds the year when it is not the current one', () => {
    expect(shortDate('2025-09-17T12:00:00Z', now)).toBe('Sep 17, 2025');
  });

  /* `new Date('2026-01-03')` is UTC midnight, which is Jan 2 anywhere west of
     Greenwich. A bare date is a calendar date, so it must not shift. */
  it('reads a date-only value as a calendar date, with no timezone shift', () => {
    expect(shortDate('2026-01-03', now)).toBe('Jan 3');
  });

  it('formats the full ISO stamp bin/register.js writes into `updated`', () => {
    expect(shortDate('2026-08-24T12:00:00.844Z', now)).toBe('Aug 24');
  });

  it('returns a value it cannot parse unchanged', () => {
    expect(shortDate('not-a-date')).toBe('not-a-date');
    expect(shortDate('')).toBe('');
  });
});
