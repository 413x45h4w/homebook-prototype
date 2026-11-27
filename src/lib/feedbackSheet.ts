/** Portrait phones. Wider screens keep the side dock. */
export const FEEDBACK_SHEET_MAX_WIDTH = 540;

export function feedbackSheetFrame(input: {
  width: number;
  visualHeight: number;
  visualOffsetTop: number;
}): { mode: 'sheet' | 'dock'; top: number; height: number } {
  if (input.width > FEEDBACK_SHEET_MAX_WIDTH) return { mode: 'dock', top: 0, height: 0 };
  const height = Math.max(0, input.visualHeight);
  return { mode: 'sheet', top: input.visualOffsetTop, height };
}
