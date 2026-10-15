import type { ReactNode } from 'react';

/**
 * One labelled setting: name over its hint on the left, the control on the right. The one row component — every setting, the theme swatches included,
 * is drawn by it, so the name/hint type and the hairline between rows are decided in one place.
 *
 * `stacked` drops the control under the label instead of beside it, for the one control too wide to share a line: the five theme swatches.
 */
export function SettingsRow({
  name, hint, stacked, children
}: { name: string; hint?: ReactNode; stacked?: boolean; children: ReactNode }) {
  return (
    <div className={stacked ? 'set-row stacked' : 'set-row'}>
      <div className="set-label">
        <span className="set-name">{name}</span>
        {hint && <span className="set-hint">{hint}</span>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

/**
 * A card of rows under its heading. A real `<h2>` rather than a styled div: the band's `<h1>` names the page, and each card is a section of it, so
 * a screen reader's heading list reads `Settings`, then `Appearance`, `Reading aid`, `Startup`.
 */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card set-card">
      <h2 className="sec-h">{title}</h2>
      {children}
    </section>
  );
}

/**
 * A boolean as a pill switch — one control for one value. It replaces an Off/On segmented pair, which asked two buttons to agree about a single
 * boolean. `role="switch"` with `aria-checked` is what assistive tech hears, and `.switch` draws its checked state off that same attribute, so the
 * picture and the announcement cannot disagree.
 */
export function Switch({
  checked, label, onChange
}: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}

/**
 * Segmented picker. Used instead of a `<select>` wherever there are two or three options and seeing them all at once is worth the width — density,
 * fixation, frequency. Text size has four and went to a select (spec §6); a boolean is a `Switch`.
 */
export function Segmented<T extends string | number>({
  value, options, onChange, disabled
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  /** For a setting the server can't act on — the switch would flip and do nothing. */
  disabled?: boolean;
}) {
  return (
    <div className="seg" role="group">
      {options.map(o => (
        <button
          key={String(o.value)}
          className={o.value === value ? 'on' : undefined}
          aria-pressed={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A bounded integer input. Commits on blur so half-typed numbers never clamp mid-keystroke. */
export function NumberField({
  value, min, max, unit, onCommit
}: { value: number; min: number; max: number; unit?: string; onCommit: (v: number) => void }) {
  return (
    <>
      <input
        type="number"
        className="input"
        defaultValue={value}
        min={min}
        max={max}
        key={value} /* re-seed when the value changes from elsewhere (e.g. Reset) */
        onBlur={e => onCommit(Number(e.currentTarget.value))}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
      {unit && <span className="set-unit">{unit}</span>}
    </>
  );
}
