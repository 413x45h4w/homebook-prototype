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
  localId?: string;
  row: TicketInsert;
  attempts: number;
  lastError?: string;
}

export interface LegacyTicket {
  id: string;
  title?: string;
  description: string;
  type: FeedbackType;
  severity?: FeedbackSeverity | null;
  createdAt?: string;
  context?: Record<string, unknown>;
}

/** Columns a reviewer may send. id is a generated bigint, and created_at / reviewer_email have database defaults. */
export interface DecisionInsert {
  ticket_id: string;
  decision: 'approved' | 'disapproved';
  note?: string;
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

export function formatPostgrestError(error: { message?: string; details?: string | null; hint?: string | null; code?: string | null }): string {
  const message = error.message?.trim() || 'The request was rejected.';
  const extra = [error.details, error.hint].map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  const code = error.code ? ` [${error.code}]` : '';
  return extra.length ? `${message}${code} — ${extra.join(' — ')}` : `${message}${code}`;
}

export function decisionRow(ticketId: string, decision: 'approved' | 'disapproved', note: string): DecisionInsert {
  const trimmed = note.trim().slice(0, 2000);
  const row: DecisionInsert = { ticket_id: ticketId, decision };
  if (trimmed) row.note = trimmed;
  return row;
}

export function appendDecision(events: DecisionEvent[], event: DecisionEvent): DecisionEvent[] {
  return [...events, event];
}

export function statusFromDecisions(events: DecisionEvent[]): 'pending' | 'approved' | 'disapproved' | 'reopened' {
  const latest = events[events.length - 1];
  return latest ? latest.decision : 'pending';
}

export function legacyTicketRow(ticket: LegacyTicket, testerName: string): TicketInsert | null {
  const description = ticket.description?.trim();
  if (!ticket.id || !description) return null;
  const ctx = ticket.context ?? {};
  const createdAt = ticket.createdAt || new Date().toISOString();
  const role = ctx.role === 'provider' ? 'provider' : 'customer';
  const built = buildTicketInsert({
    text: description,
    type: ticket.type || 'other',
    severity: ticket.severity ?? undefined,
    testerName,
    context: {
      route: String(ctx.route || '/'),
      flow: String(ctx.flow || 'unknown'),
      step: String(ctx.step || 'unknown'),
      screen: String(ctx.screen || 'unknown'),
      routeFlow: String(ctx.routeFlow || ctx.flow || 'unknown'),
      routeStep: String(ctx.routeStep || ctx.step || 'unknown'),
      routeScreen: String(ctx.routeScreen || ctx.screen || 'unknown'),
      overlay: typeof ctx.overlay === 'string' ? ctx.overlay : null,
      role,
      activeSpId: String(ctx.activeSpId || ''),
      entityIds: (ctx.entityIds as Record<string, string>) || {},
      viewport: String(ctx.viewport || ''),
      device: String(ctx.device || ''),
      appVersion: String(ctx.appVersion || 'local'),
      commit: String(ctx.commit || 'local'),
    },
    now: new Date(createdAt),
  });
  if (!built.ok) return null;
  const context: Record<string, unknown> = { ...ctx, originalCreatedAt: createdAt, migratedFromLocalId: ticket.id };
  if (JSON.stringify(context).length > 19_000) delete context.device;
  return { ...built.row, created_at: createdAt, context };
}

/** Queue pre-Supabase tickets once. Already migrated or already queued ids are skipped. */
export function queueLegacyTickets(
  outbox: OutboxItem[],
  migratedIds: string[],
  tickets: LegacyTicket[],
  testerName: string,
): { outbox: OutboxItem[]; migratedIds: string[]; added: number } {
  const migrated = new Set(migratedIds);
  const queued = new Set(outbox.map((item) => item.localId).filter((id): id is string => Boolean(id)));
  const added: OutboxItem[] = [];
  for (const ticket of tickets) {
    if (!ticket?.id || migrated.has(ticket.id) || queued.has(ticket.id)) continue;
    const row = legacyTicketRow(ticket, testerName);
    if (!row) continue;
    added.push({ id: row.id, localId: ticket.id, row, attempts: 0 });
    migrated.add(ticket.id);
    queued.add(ticket.id);
  }
  return { outbox: [...outbox, ...added], migratedIds: [...migrated], added: added.length };
}
