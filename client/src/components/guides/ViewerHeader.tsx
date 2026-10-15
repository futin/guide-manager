import { IconChevronLeft, IconReset } from '../icons';

interface Props {
  /** `<project> · <series> · n of m`, `<project>` for a loose guide, or the title itself once the index no longer names the open path. */
  crumb: string;
  title: string;
  /** The high-water mark, already rounded and held to 0–100 (GuideTile's `furthestOf`) — the pill and the board's tile must print the same number. */
  furthest: number;
  completed: boolean;
  onBack(): void;
  onReset(): void;
  armed: boolean;
}

/**
 * The band over a framed guide (spec §4): `‹ Guides`, the crumb over the title, the furthest pill and `Start over`. It only draws. Every value arrives
 * already derived — GuidesView reads the crumb and the pill out of the current index by the open path — and the arm state stays in GuidesView too,
 * because that is where the rule lives that disarms it on every change of guide; a header holding its own arm state would carry it into the next guide.
 *
 * `.guide-viewer-head` keeps its class name deliberately: it is the exact element a later companion panel would mount into, so its shape stays stable.
 */
export function ViewerHeader({ crumb, title, furthest, completed, onBack, onReset, armed }: Props) {
  return (
    <div className="guide-viewer-head">
      <button type="button" className="btn guide-viewer-back" onClick={onBack}>
        <IconChevronLeft size={16} />
        Guides
      </button>
      <div className="guide-viewer-titles">
        <span className="guide-viewer-crumb">{crumb}</span>
        <span className="guide-viewer-title">{title}</span>
      </div>
      {/*
        `Read` replaces the percent rather than sitting beside it, for the same reason a tile does: completion is the guide's own claim, the percent only
        a position. Nothing at 0 — a `0% furthest` pill is a sentence about a guide nobody has read, which the header has no need to say.
      */}
      {completed ? (
        <span className="pill read">Read</span>
      ) : furthest > 0 ? (
        <span className="pill guide-viewer-pct">{furthest}% furthest</span>
      ) : null}
      {/*
        Reset belongs here rather than on the board's tiles. A tile is a whole-tile role="button" in a dense grid, so a nested destructive control there
        is one mis-tap from discarding a session on the device this app exists for. In the viewer there is exactly one guide it could mean — the one on
        screen.

        The label carries the confirmation rather than a dialog: a window.confirm inside an overlay on a phone is a second modal over a modal, and the
        two-state button says the same thing in the space it already occupies.
      */}
      <button type="button" className={`btn guide-viewer-reset${armed ? ' armed' : ''}`} onClick={onReset}>
        <IconReset size={16} />
        {armed ? 'Start over?' : 'Start over'}
      </button>
    </div>
  );
}
