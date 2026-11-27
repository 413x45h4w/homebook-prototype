import type { FeedbackContext, FeedbackSeverity, FeedbackType } from './tickets';

export interface TicketInsert {
  id: string;
  created_at: string;
  title: string;
  body: string;
  type: FeedbackType;
  severity: FeedbackSeverity | null;
  flow: string;
  step: string;
  screen: string;
  route: string;
  role: string;
  tester_name: string | null;
  context: Record<string, unknown>;
  app_version: string;
}

export interface OutboxItem {
  id: string;
  row: TicketInsert;
  attempts: number;
  lastError?: string;
}

export interface DecisionInsert {
  id: string;
  ticket_id: string;
  decision: 'approved' | 'disapproved';
  note: string | null;
}

export interface InsertResult {
  error: { message: string } | null;
}

export interface InsertClient {
  insert(table: 'feedback_tickets' | 'ticket_events', row: TicketInsert | DecisionInsert): Promise<InsertResult>;
}

export interface DecisionEvent {
  id: string;
  decision: 'approved' | 'disapproved' | 'reopened';
  note: string | null;
  created_at: string;
}

const CONTEXT_BUDGET = 19_000;

export function buildTicketInsert(input: {
  id?: string;
  text: string;
  type: FeedbackType;
  severity?: FeedbackSeverity;
  testerName?: string;
  context: FeedbackContext;
  now?: Date;
}): { ok: true; row: TicketInsert } | { ok: false; reason: string } {
  const body = input.text.replace(/\s+/g, ' ').trim().slice(0, 5000);
  if (!body) return { ok: false, reason: 'Write a few words about what happened.' };
  if (!input.context.flow || !input.context.step) return { ok: false, reason: 'This screen is missing flow context.' };
  const now = input.now ?? new Date();
  const headline = body.length > 72 ? `${body.slice(0, 72).trimEnd()}…` : body;
  const typeLabel = input.type[0].toUpperCase() + input.type.slice(1);
  const title = `${typeLabel}: ${headline} (${input.context.flow} / ${input.context.step})`.slice(0, 200);
  const name = input.testerName?.trim().slice(0, 100) || null;
  return {
    ok: true,
    row: {
      id: input.id ?? crypto.randomUUID(),
      created_at: now.toISOString(),
      title,
      body,
      type: input.type,
      severity: input.severity ?? null,
      flow: input.context.flow.slice(0, 200),
      step: input.context.step.slice(0, 200),
      screen: input.context.screen.slice(0, 200),
      route: input.context.route.slice(0, 500),
      role: input.context.role,
      tester_name: name,
      context: fitContext(input.context),
      app_version: input.context.appVersion.slice(0, 40),
    },
  };
}

function fitContext(context: FeedbackContext): Record<string, unknown> {
  const full: Record<string, unknown> = {
    routeFlow: context.routeFlow,
    routeStep: context.routeStep,
    routeScreen: context.routeScreen,
    overlay: context.overlay,
    entityIds: context.entityIds,
    viewport: context.viewport,
    device: context.device,
    commit: context.commit,
    activeSpId: context.activeSpId,
  };
  if (JSON.stringify(full).length <= CONTEXT_BUDGET) return full;
  full.device = String(context.device).slice(0, 180);
  if (JSON.stringify(full).length <= CONTEXT_BUDGET) return full;
  delete full.device;
  return full;
}

export async function sendTicket(
  client: InsertClient,
  row: TicketInsert,
  outbox: OutboxItem[],
): Promise<{ status: 'sent' | 'queued'; outbox: OutboxItem[]; error?: string }> {
  const result = await client.insert('feedback_tickets', row);
  if (!result.error) return { status: 'sent', outbox };
  return {
    status: 'queued',
    error: result.error.message,
    outbox: [...outbox, { id: row.id, row, attempts: 1, lastError: result.error.message }],
  };
}

export async function flushOutbox(
  client: InsertClient,
  outbox: OutboxItem[],
): Promise<{ outbox: OutboxItem[]; sent: number }> {
  const remaining: OutboxItem[] = [];
  let sent = 0;
  for (const item of outbox) {
    const result = await client.insert('feedback_tickets', item.row);
    if (result.error) remaining.push({ ...item, attempts: item.attempts + 1, lastError: result.error.message });
    else sent += 1;
  }
  return { outbox: remaining, sent };
}

export function decisionRow(ticketId: string, decision: 'approved' | 'disapproved', note: string, id?: string): DecisionInsert {
  const trimmed = note.trim();
  return { id: id ?? crypto.randomUUID(), ticket_id: ticketId, decision, note: trimmed ? trimmed.slice(0, 2000) : null };
}

export function appendDecision(events: DecisionEvent[], event: DecisionEvent): DecisionEvent[] {
  return [...events, event];
}

export function statusFromDecisions(events: DecisionEvent[]): 'pending' | 'approved' | 'disapproved' | 'reopened' {
  const latest = events[events.length - 1];
  return latest ? latest.decision : 'pending';
}
