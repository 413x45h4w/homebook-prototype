import { describe, expect, it } from 'vitest';
import {
  appendDecision,
  buildTicketInsert,
  decisionRow,
  formatPostgrestError,
  flushOutbox,
  queueLegacyTickets,
  sendTicket,
  statusFromDecisions,
  type DecisionEvent,
  type InsertClient,
  type OutboxItem,
  type TicketInsert,
} from './feedbackSync';
import { contextSample } from './tickets';

function memoryClient(failIds = new Set<string>()): InsertClient & { calls: { table: string; row: TicketInsert }[] } {
  const calls: { table: string; row: TicketInsert }[] = [];
  return {
    calls,
    async insert(table, row) {
      calls.push({ table, row: row as TicketInsert });
      if (failIds.has((row as TicketInsert).id)) return { error: { message: 'offline' } };
      return { error: null };
    },
  };
}

describe('central feedback', () => {
  it('builds an insert row with the captured context and no select', async () => {
    const built = buildTicketInsert({
      id: '11111111-1111-4111-8111-111111111111',
      text: '  The tab is hard to see ',
      type: 'bug',
      severity: 'high',
      testerName: 'Alex’s wife',
      context: contextSample(),
      now: new Date('2026-11-27T08:00:00.000Z'),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.row.body).toBe('The tab is hard to see');
    expect(built.row.tester_name).toBe('Alex’s wife');
    expect(built.row.context).toMatchObject({ entityIds: { id: 'visit-1' }, activeSpId: 'sp-maria' });
    expect(built.row.title.length).toBeLessThanOrEqual(200);

    const client = memoryClient();
    const sent = await sendTicket(client, built.row, []);
    expect(sent.status).toBe('sent');
    expect(sent.outbox).toEqual([]);
    expect(client.calls).toEqual([{ table: 'feedback_tickets', row: built.row }]);
  });

  it('queues a failed submit and retries it without dropping other queued notes', async () => {
    const first = buildTicketInsert({
      id: '22222222-2222-4222-8222-222222222222',
      text: 'Already waiting',
      type: 'idea',
      context: contextSample(),
    });
    const second = buildTicketInsert({
      id: '33333333-3333-4333-8333-333333333333',
      text: 'Network died',
      type: 'bug',
      context: contextSample(),
    });
    if (!first.ok || !second.ok) throw new Error('rows');
    const existing: OutboxItem[] = [{ id: first.row.id, row: first.row, attempts: 1 }];
    const client = memoryClient(new Set([second.row.id]));
    const queued = await sendTicket(client, second.row, existing);
    expect(queued.status).toBe('queued');
    expect(queued.error).toBe('offline');
    expect(queued.outbox.map((item) => item.id)).toEqual([first.row.id, second.row.id]);
    expect(existing).toHaveLength(1);

    const retry = memoryClient(new Set([second.row.id]));
    const flushed = await flushOutbox(retry, queued.outbox);
    expect(flushed.sent).toBe(1);
    expect(flushed.outbox.map((item) => item.id)).toEqual([second.row.id]);
    expect(flushed.outbox[0].attempts).toBe(2);
    expect(retry.calls.map((call) => call.row.id)).toEqual([first.row.id, second.row.id]);
  });

  it('queues earlier local tickets once, keeping the original time and context', () => {
    const local = {
      id: 'tkt-old',
      description: 'The door code note was hard to find',
      type: 'confusing' as const,
      createdAt: '2026-11-20T15:00:00.000Z',
      context: { flow: 'knowledge', step: 'note-detail', screen: 'KnowledgeItem', route: '/knowledge/kb-door', role: 'customer' as const, entityIds: { id: 'kb-door' } },
    };
    const first = queueLegacyTickets([], [], [local], 'Samira');
    expect(first.added).toBe(1);
    expect(first.migratedIds).toEqual(['tkt-old']);
    expect(first.outbox[0].localId).toBe('tkt-old');
    expect(first.outbox[0].row.created_at).toBe('2026-11-20T15:00:00.000Z');
    expect(first.outbox[0].row.tester_name).toBe('Samira');
    expect(first.outbox[0].row.context).toMatchObject({
      flow: 'knowledge',
      originalCreatedAt: '2026-11-20T15:00:00.000Z',
      migratedFromLocalId: 'tkt-old',
      entityIds: { id: 'kb-door' },
    });
    const second = queueLegacyTickets(first.outbox, first.migratedIds, [local], 'Samira');
    expect(second.added).toBe(0);
    expect(second.outbox).toHaveLength(1);
  });

  it('appends an approve decision without erasing earlier history', () => {
    const created: DecisionEvent[] = [];
    const approved = appendDecision(created, {
      id: 'evt-1',
      decision: 'approved',
      note: 'Ship it',
      created_at: '2026-11-27T09:00:00.000Z',
    });
    const both = appendDecision(approved, {
      id: 'evt-2',
      decision: 'disapproved',
      note: 'Not now',
      created_at: '2026-11-27T10:00:00.000Z',
    });
    expect(created).toEqual([]);
    expect(statusFromDecisions(created)).toBe('pending');
    expect(statusFromDecisions(approved)).toBe('approved');
    expect(statusFromDecisions(both)).toBe('disapproved');
    expect(both.map((event) => event.decision)).toEqual(['approved', 'disapproved']);
    const approvedRow = decisionRow('ticket-1', 'approved', '  Ship it  ');
    expect(approvedRow).toEqual({
      ticket_id: 'ticket-1',
      decision: 'approved',
      note: 'Ship it',
    });
    expect(approvedRow).not.toHaveProperty('id');
    expect(approvedRow).not.toHaveProperty('created_at');
    expect(approvedRow).not.toHaveProperty('reviewer_email');
    expect(decisionRow('ticket-1', 'disapproved', '   ')).toEqual({
      ticket_id: 'ticket-1',
      decision: 'disapproved',
    });
    expect(formatPostgrestError({ message: 'invalid input syntax for type bigint', details: 'Failing row contains (id) = (uuid).', hint: null, code: '22P02' })).toBe(
      'invalid input syntax for type bigint [22P02] — Failing row contains (id) = (uuid).',
    );
  });
});
