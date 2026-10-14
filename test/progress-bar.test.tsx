/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react';

import { ProgressBar, SegmentedBar } from '../client/src/components/ProgressBar';

/** The bar's own element and its fill, if it drew one. */
function drawn(percent: number) {
  const { container } = render(<ProgressBar percent={percent} />);
  const bar = container.querySelector('.bar') as HTMLElement;
  return { bar, fill: bar.querySelector('.bar-fill') as HTMLElement | null };
}

describe('ProgressBar', () => {
  it('fills to the percent it is given', () => {
    const { bar, fill } = drawn(45);
    expect(bar.classList.contains('empty')).toBe(false);
    expect(fill?.style.width).toBe('45%');
  });

  it('draws an unread guide as a flat track: the empty modifier and no fill element', () => {
    // A zero-width fill would still carry the hatch's end cap on some engines; no element at all is the only flat track.
    const { bar, fill } = drawn(0);
    expect(bar.classList.contains('empty')).toBe(true);
    expect(fill).toBeNull();
  });

  it('caps an overshoot at a full bar', () => {
    expect(drawn(140).fill?.style.width).toBe('100%');
  });

  it('treats a negative percent as unread', () => {
    const { bar, fill } = drawn(-5);
    expect(bar.classList.contains('empty')).toBe(true);
    expect(fill).toBeNull();
  });

  it('names its value for assistive tech, using the label when one is given', () => {
    const { container } = render(<ProgressBar percent={45} label="Lesson 3" />);
    const bar = container.querySelector('.bar') as HTMLElement;
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('45');
    expect(bar.getAttribute('aria-label')).toBe('Lesson 3');
  });
});

describe('SegmentedBar', () => {
  it('draws one segment per lesson, each filled to its own percent', () => {
    const { container } = render(<SegmentedBar percents={[25, 0, 100]} />);
    const segments = Array.from(container.querySelectorAll('.segbar > .bar')) as HTMLElement[];
    expect(segments).toHaveLength(3);
    expect((segments[0].querySelector('.bar-fill') as HTMLElement).style.width).toBe('25%');
    expect(segments[1].classList.contains('empty')).toBe(true);
    expect(segments[1].querySelector('.bar-fill')).toBeNull();
    expect((segments[2].querySelector('.bar-fill') as HTMLElement).style.width).toBe('100%');
  });
});
