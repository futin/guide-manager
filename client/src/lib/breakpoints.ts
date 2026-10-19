/**
 * The phone breakpoint every `@media (max-width: 639px)` in styles.css writes out. ui-kit's CSS has no media queries (custom properties cannot drive one),
 * so the host says when the phone shape applies: `useMediaQuery(PHONE)` feeds `narrow` to the chip and to the drawer, and `restoreTarget` asks the same
 * question of `matchMedia`. One string, so the three can never disagree about where the phone starts.
 */
export const PHONE = '(max-width: 639px)';
