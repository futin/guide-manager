import type { ReactNode } from 'react';

interface IconProps {
  /** Rendered width and height in px. The viewBox stays 20×20, so a size other than 20 scales the stroke with it. */
  size?: number;
}

/**
 * The shell's whole icon set, drawn in one hand: outline only, a 1.5 px stroke on a 20×20 grid, round caps and joins, `currentColor` so an icon takes the
 * colour of the text beside it (a rail row's ink, a muted key's ink3) rather than carrying its own. Inline SVG rather than an icon font or a package: a
 * dozen glyphs is not worth a dependency, and an icon font is a second face the "one face in the shell" rule would have to make an exception for.
 *
 * Every icon is `aria-hidden` — each one sits beside a text label or inside a button that carries its own `aria-label`, so announcing the glyph too
 * would read the same name twice.
 */
function Icon({ size = 20, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** An open book — the same picture the favicon draws. */
export function IconGuides(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 5.2c2.4-1 4.6-.9 7 .6v10c-2.4-1.5-4.6-1.6-7-.6z" />
      <path d="M17 5.2c-2.4-1-4.6-.9-7 .6v10c2.4-1.5 4.6-1.6 7-.6z" />
    </Icon>
  );
}

/** A bookmark: a favorite is a block kept to come back to. */
export function IconFavorites(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 3.5h9v13l-4.5-3.2-4.5 3.2z" />
    </Icon>
  );
}

/** Three sliders rather than a cog: every setting here is a value you move, none is machinery. */
export function IconSettings(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
      <circle cx="7" cy="6" r="1.6" fill="currentColor" />
      <circle cx="12.5" cy="10" r="1.6" fill="currentColor" />
      <circle cx="9" cy="14" r="1.6" fill="currentColor" />
    </Icon>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5l-5 5 5 5" />
    </Icon>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 8l5 5 5-5" />
    </Icon>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8.75" cy="8.75" r="5" />
      <path d="M12.5 12.5l4 4" />
    </Icon>
  );
}

/** Move up one place. */
export function IconUp(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 16V4M5 9l5-5 5 5" />
    </Icon>
  );
}

/** Move down one place. */
export function IconDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 4v12M5 11l5 5 5-5" />
    </Icon>
  );
}

/** Move to the top: the up arrow under a rule, so it reads as "all the way" rather than as a second up. */
export function IconTop(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 3.5h11M10 17V7.5M5.5 12l4.5-4.5 4.5 4.5" />
    </Icon>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 5l10 10M15 5L5 15" />
    </Icon>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
    </Icon>
  );
}

/** Start over: an arrow running back round to where it began. */
export function IconReset(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 10a5.5 5.5 0 1 0 1.6-3.9" />
      <path d="M4.5 3.5v3.2h3.2" />
    </Icon>
  );
}
