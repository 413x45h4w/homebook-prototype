import { describe, expect, it } from 'vitest';
import { contextSample, createTicket, decideTicket, ticketToGithubMarkdown, ticketsToCsv } from './tickets';

describe('app feedback tickets', () => {
  it('captures context and opens a pending ticket', () => {
    const now = new Date('2026-11-27T04:00:00.000Z');
    const context = { ...contextSample(), step: 'request-reschedule', overlay: 'reschedule-visit' };
    const result = createTicket({ text: '  The reschedule button is easy to miss. ', type: 'confusing', context }, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ticket.status).toBe('pending');
    expect(result.ticket.description).toBe('The reschedule button is easy to miss.');
    expect(result.ticket.context.flow).toBe('visits');
    expect(result.ticket.context.step).toBe('request-reschedule');
    expect(result.ticket.context.entityIds).toEqual({ id: 'visit-1' });
    expect(result.ticket.context.role).toBe('customer');
    expect(result.ticket.createdAt).toBe(now.toISOString());
    expect(result.ticket.history).toHaveLength(1);
    expect(result.ticket.history[0].kind).toBe('created');
    expect(result.ticket.history[0].status).toBe('pending');
    expect(result.ticket.title).toContain('visits / request-reschedule');
  });

  it('records approve and disapprove as history instead of erasing it', () => {
    const created = createTicket({ text: 'Add a darker map', type: 'idea', severity: 'low', context: contextSample() });
    if (!created.ok) throw new Error(created.reason);
    const approvedAt = new Date('2026-11-27T05:00:00.000Z');
    const approved = decideTicket([created.ticket], created.ticket.id, 'approved', 'Ship it', approvedAt);
    expect(approved[0]).not.toBe(created.ticket);
    expect(approved[0].status).toBe('approved');
    expect(approved[0].history).toHaveLength(2);
    expect(approved[0].history[0].kind).toBe('created');
    expect(approved[0].history[1]).toMatchObject({ kind: 'approved', status: 'approved', note: 'Ship it' });
    expect(created.ticket.history).toHaveLength(1);

    const disapproved = decideTicket(approved, created.ticket.id, 'disapproved', 'Not now', new Date('2026-11-27T06:00:00.000Z'));
    expect(disapproved[0].status).toBe('disapproved');
    expect(disapproved[0].history.map((event) => event.kind)).toEqual(['created', 'approved', 'disapproved']);
    expect(disapproved[0].history[1].note).toBe('Ship it');
  });

  it('exports csv and GitHub issue markdown', () => {
    const created = createTicket({ text: 'Search ignores quotes', type: 'bug', severity: 'high', context: contextSample() });
    if (!created.ok) throw new Error(created.reason);
    const csv = ticketsToCsv([created.ticket]);
    expect(csv.split('\n')[0]).toContain('flow');
    expect(csv).toContain('Search ignores quotes');
    const markdown = ticketToGithubMarkdown(created.ticket);
    expect(markdown).toContain('### Bug:');
    expect(markdown).toContain('Route: /visits/visit-1');
  });

  it('rejects an empty note', () => {
    expect(createTicket({ text: '   ', type: 'other', context: contextSample() }).ok).toBe(false);
  });
});
