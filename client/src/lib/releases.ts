/**
 * releases.ts — what the rail's version chip and the What's new drawer decide, with no React in it (`test/releases-lib.test.ts`). The data is
 * `GET /api/releases` (server/src/releases/), this checkout's own release tags; the design is docs/superpowers/specs/2026-10-17-release-versioning-design.md,
 * which ports backlog-manager's `client/src/lib/releases.ts` one function for one.
 *
 * The unseen dot is a per-viewer convenience over `localStorage`, never a record — which is why it lives in the browser and not in Mongo: a first visit
 * seeds the newest version so a fresh browser never shows every release as new, a stored value that is not a version counts as missing and is reseeded,
 * and storage that throws (a private window, blocked site data) means no dot rather than a crash.
 */
import type { ReleaseType } from '../../../shared/types';
import { sanitizeSnapshot } from './sanitize';

export const LAST_SEEN_KEY = 'guide-manager.releases-last-seen';

const VERSION = /^\d+\.\d+\.\d+$/;

/** A bare `X.Y.Z` — not `v0.2.0`, not a prerelease, not whatever an older build or a hand edit left in storage. */
export function isVersion(s: unknown): s is string {
  return typeof s === 'string' && VERSION.test(s);
}

/** Numeric order per part, so `0.10.0` is above `0.9.0` — a string compare would put it below. Both must be versions. */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/** `v0.2.0` on the tag, `v0.2.0+3` three commits past it — the shape `git describe` would give, minus the sha. */
export function chipLabel(current: { version: string; ahead: number }): string {
  return current.ahead > 0 ? `v${current.version}+${current.ahead}` : `v${current.version}`;
}

const CC_PREFIX = /^[a-z]+(?:\([a-z0-9-]+\))?!?: ?/;

/** The title without its `type(scope)!: ` prefix, which the badge already says. A title with none — the baseline's — is returned as it is. */
export function displayTitle(title: string): string {
  return title.replace(CC_PREFIX, '');
}

/** The type badge's words. Breaking is not a fourth type — it is a badge of its own beside this one — and the baseline has none. */
export const TYPE_LABEL: Record<Exclude<ReleaseType, 'baseline'>, string> = { feat: 'Feature', fix: 'Fix', perf: 'Performance' };

/**
 * Should the chip carry the dot, and what must storage be set to (`seed`, `null` for nothing)? A dot only when the newest release is above the stored one;
 * a missing or junk stored value is not "everything is new" but a first visit, so it answers no dot and asks the caller to store the newest. With the
 * drawer `open` there is never a dot, and the newest is marked seen — but only when it is above what is stored: a checkout behind the one last opened must
 * not write the lower version back, or the releases between the two would be flagged again once the newer checkout returns. Pure: the caller writes.
 */
export function dotState(newest: string | null, stored: string | null, open: boolean): { dot: boolean; seed: string | null } {
  if (!isVersion(newest)) return { dot: false, seed: null };
  if (!isVersion(stored)) return { dot: false, seed: newest };
  const above = compareVersions(newest, stored) > 0;
  if (open) return { dot: false, seed: above ? newest : null };
  return { dot: above, seed: null };
}

/** The last version the viewer opened the drawer on, or `null` — a storage that throws reads as never having seen one. */
export function readLastSeen(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

/** Stores it; a storage that throws is swallowed, and the shell's in-memory mirror settles the dot instead. */
export function writeLastSeen(v: string): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, v);
  } catch {
    /* a private window or blocked site data */
  }
}

/** `16 Oct 2026`, in the viewer's own timezone; a date that does not parse is shown as it came rather than as `Invalid Date`. */
export function formatReleaseDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BOLD = /\*\*([^*\n]+)\*\*/g;
const BULLET = /^\s*[-*] +/;

/** One line's inline markup, over text that is ALREADY escaped: `code` spans first and left alone, then links and bold in the rest. */
function inline(escaped: string): string {
  return escaped
    .split(/(`[^`\n]+`)/)
    .map((part, i) =>
      i % 2 === 1
        ? `<code>${part.slice(1, -1)}</code>`
        : part.replace(LINK, (_m, text: string, href: string) => `<a href="${href}">${text}</a>`).replace(BOLD, '<strong>$1</strong>')
    )
    .join('');
}

/**
 * A release's notes — the PR body's `## What's new` section, written by whoever opened the PR — as HTML safe to set (spec D5). The subset a notes section
 * actually uses: paragraphs (a blank line between), `- ` / `* ` bullet lists, `code`, **bold** and `[text](https://…)`. Everything is HTML-escaped BEFORE
 * any markup is added, so a `<script>` or an `<img onerror>` in the notes arrives as its own text, and a link that is not http(s) never matches `LINK`.
 * The result then goes through `sanitizeSnapshot` anyway — the same boundary a favorite's snapshot crosses — which is also what puts
 * `target="_blank" rel="noopener"` on every link (sanitize.ts `handleAnchor`). Anything else in the Markdown shows as the literal text it is.
 */
export function renderNotes(md: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length) out.push(`<ul>${list.map((li) => `<li>${li}</li>`).join('')}</ul>`);
    list = [];
  };
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    if (raw.trim() === '') {
      flushPara();
      flushList();
    } else if (BULLET.test(raw)) {
      flushPara();
      list.push(inline(escapeHtml(raw.replace(BULLET, '').trim())));
    } else {
      flushList();
      para.push(inline(escapeHtml(raw.trim())));
    }
  }
  flushPara();
  flushList();
  return sanitizeSnapshot(out.join(''));
}
