import { describe, expect, it } from 'vitest';
import { decisionRow } from './feedbackSync';
import { previewScreen, productionScreen, queueSection, ticketBranch, ticketShortId, ticketShortIds } from './ticketPipeline';

describe('ticket pipeline', () => {
  it('names the branch and preview from the first 8 characters', () => {
    expect(ticketShortId('ccf16b62-1111-2222-3333-444444444444')).toBe('ccf16b62');
    expect(ticketBranch('ccf16b62-1111-2222-3333-444444444444')).toBe('ticket/ccf16b62');
    expect(productionScreen('/knowledge/kb-door')).toBe('https://413x45h4w.github.io/homebook-prototype/#/knowledge/kb-door');
    expect(previewScreen('ccf16b62', '/knowledge/kb-door')).toBe(
      'https://413x45h4w.github.io/homebook-prototype/preview/ccf16b62/#/knowledge/kb-door',
    );
  });

  it('sorts tickets into the review queues and ignores stray refs', () => {
    expect(queueSection('pending')).toBe('needs');
    expect(queueSection('approved')).toBe('working');
    expect(queueSection('in_progress')).toBe('working');
    expect(queueSection('preview_ready')).toBe('ready');
    expect(queueSection('shipped')).toBe('shipped');
    expect(queueSection('discarded')).toBe('closed');
    expect(ticketShortIds(['refs/remotes/origin/main', 'refs/remotes/origin/ticket/demo', 'refs/heads/ticket/ccf16b62', 'ticket/../x'])).toEqual([
      'ccf16b62',
      'demo',
    ]);
  });

  it('writes a ship request without an id column', () => {
    const row = decisionRow('ccf16b62-1111-2222-3333-444444444444', 'ship_requested', '  Looks right  ');
    expect(row).toEqual({ ticket_id: 'ccf16b62-1111-2222-3333-444444444444', decision: 'ship_requested', note: 'Looks right' });
    expect(row).not.toHaveProperty('id');
    expect(decisionRow('ccf16b62-1111-2222-3333-444444444444', 'changes_requested', 'Move the button')).toMatchObject({
      decision: 'changes_requested',
      note: 'Move the button',
    });
  });
});
