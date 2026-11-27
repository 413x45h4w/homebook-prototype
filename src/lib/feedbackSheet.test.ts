import { describe, expect, it } from 'vitest';
import { feedbackSheetFrame } from './feedbackSheet';

describe('feedback sheet frame', () => {
  it('uses the visible viewport on an upright phone, including when the keyboard is open', () => {
    expect(feedbackSheetFrame({ width: 390, visualHeight: 844, visualOffsetTop: 0 })).toEqual({ mode: 'sheet', top: 0, height: 844 });
    expect(feedbackSheetFrame({ width: 375, visualHeight: 667, visualOffsetTop: 0 })).toEqual({ mode: 'sheet', top: 0, height: 667 });
    expect(feedbackSheetFrame({ width: 390, visualHeight: 380, visualOffsetTop: 120 })).toEqual({ mode: 'sheet', top: 120, height: 380 });
  });

  it('leaves a wide screen on the side dock', () => {
    expect(feedbackSheetFrame({ width: 1280, visualHeight: 800, visualOffsetTop: 0 }).mode).toBe('dock');
  });
});
