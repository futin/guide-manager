/**
 * The one progress bar the shell draws — a guide tile's furthest-read, the viewer's percent, and (segmented) a series' lessons side by side. One
 * component so the board cannot grow two bars that disagree about what 0 % looks like.
 *
 * Unread is a flat track with no fill element at all, not a zero-width fill: the fill carries the hatch, and an empty box with a background still paints
 * a sliver on some engines once a border radius rounds it. The `empty` modifier is what the stylesheet keys the flat track off.
 *
 * Percent is clamped here rather than trusted: `furthestPercent` comes from a framed guide's own report, and a stray 140 must draw a full bar, not one
 * that overruns its track.
 */
function clamp(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.min(100, Math.round(percent));
}

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const value = clamp(percent);
  return (
    <div
      className={value === 0 ? 'bar empty' : 'bar'}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label ?? `${value}% read`}
    >
      {value > 0 && <span className="bar-fill" style={{ width: `${value}%` }} />}
    </div>
  );
}

/**
 * A series' progress: one bar per lesson, in lesson order, each filled to that lesson's own furthest. The segments are presentation only — the series
 * sheet states the counts in text beside it — so the group is hidden from assistive tech rather than announcing a dozen progressbars in a row.
 */
export function SegmentedBar({ percents }: { percents: number[] }) {
  return (
    <div className="segbar" aria-hidden="true">
      {percents.map((p, i) => {
        const value = clamp(p);
        return (
          <div key={i} className={value === 0 ? 'bar empty' : 'bar'}>
            {value > 0 && <span className="bar-fill" style={{ width: `${value}%` }} />}
          </div>
        );
      })}
    </div>
  );
}
