import {
  decisionRow,
  flushOutbox,
  formatPostgrestError,
  queueLegacyTickets,
  sendTicket,
  type LegacyTicket,
  type InsertClient,
  type OutboxItem,
  type TicketInsert,
} from './feedbackSync';
import { supabase } from './supabaseClient';

const OUTBOX_KEY = 'homebook.feedbackOutbox.v1';
const NAME_KEY = 'homebook.testerName';
const MIGRATED_KEY = 'homebook.feedbackMigratedIds';

export interface RemoteTicket {
  id: string;
  created_at: string;
  title: string;
  body: string;
  type: 'bug' | 'idea' | 'confusing' | 'other';
  severity: 'low' | 'medium' | 'high' | null;
  flow: string;
  step: string;
  screen: string;
  route: string;
  role: string;
  tester_name: string | null;
  context: Record<string, unknown> | null;
  app_version: string | null;
  status: 'pending' | 'approved' | 'disapproved' | 'reopened';
}

export interface RemoteEvent {
  id: string;
  ticket_id: string;
  created_at: string;
  decision: 'approved' | 'disapproved' | 'reopened';
  note: string | null;
  reviewer_email: string | null;
}

const client: InsertClient = {
  async insert(table, row) {
    const { error } = await supabase.from(table).insert(row);
    return { error: error ? { message: formatPostgrestError(error) } : null };
  },
};

export function readOutbox(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeOutbox(items: OutboxItem[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

export function readTesterName(): string {
  return localStorage.getItem(NAME_KEY) ?? '';
}

export function writeTesterName(name: string) {
  localStorage.setItem(NAME_KEY, name.slice(0, 100));
}

export async function submitToSupabase(row: TicketInsert): Promise<{ status: 'sent' | 'queued'; error?: string }> {
  const current = readOutbox();
  const result = await sendTicket(client, row, current);
  if (result.status === 'queued') writeOutbox(result.outbox);
  return { status: result.status, error: result.error };
}

export async function retryOutbox(): Promise<{ sent: number; left: number; error?: string }> {
  const current = readOutbox();
  if (!current.length) return { sent: 0, left: 0 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { sent: 0, left: current.length, error: 'Offline' };
  }
  const flushed = await flushOutbox(client, current);
  writeOutbox(flushed.outbox);
  return {
    sent: flushed.sent,
    left: flushed.outbox.length,
    error: flushed.outbox[0]?.lastError,
  };
}

export async function reviewerStatus(): Promise<{ signedIn: boolean; email: string | null; reviewer: boolean; error?: string }> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return { signedIn: false, email: null, reviewer: false, error: error.message };
  const email = data.session?.user.email ?? null;
  if (!email) return { signedIn: false, email: null, reviewer: false };
  const check = await supabase.rpc('is_reviewer');
  if (check.error) return { signedIn: true, email, reviewer: false, error: check.error.message };
  return { signedIn: true, email, reviewer: check.data === true };
}

export async function loadReviewQueue(): Promise<{ tickets: RemoteTicket[]; events: RemoteEvent[]; error?: string }> {
  const tickets = await supabase.from('ticket_status').select('*').order('created_at', { ascending: false });
  if (tickets.error) return { tickets: [], events: [], error: tickets.error.message };
  const events = await supabase.from('ticket_events').select('*').order('created_at', { ascending: true });
  if (events.error) return { tickets: (tickets.data ?? []) as RemoteTicket[], events: [], error: events.error.message };
  return { tickets: (tickets.data ?? []) as RemoteTicket[], events: (events.data ?? []) as RemoteEvent[] };
}

export async function submitDecision(ticketId: string, decision: 'approved' | 'disapproved', note: string): Promise<string | null> {
  const row = decisionRow(ticketId, decision, note);
  const result = await client.insert('ticket_events', row);
  return result.error?.message ?? null;
}

export function eventsFor(events: RemoteEvent[], ticketId: string): RemoteEvent[] {
  return events.filter((event) => event.ticket_id === ticketId);
}

const LOCAL_KEY = 'homebook.appFeedback.v1';

interface LocalTicket {
  id: string;
  title: string;
  description: string;
  type: TicketInsert['type'];
  severity?: TicketInsert['severity'];
  createdAt: string;
  context: TicketInsert['context'] & {
    flow?: string;
    step?: string;
    screen?: string;
    route?: string;
    role?: string;
    appVersion?: string;
    commit?: string;
    activeSpId?: string;
    entityIds?: Record<string, string>;
    viewport?: string;
    device?: string;
    overlay?: string | null;
    routeFlow?: string;
    routeStep?: string;
    routeScreen?: string;
  };
}

export function localTicketsToUpload(): { id: string; row: TicketInsert }[] {
  let parsed: LocalTicket[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    parsed = raw ? (JSON.parse(raw) as LocalTicket[]) : [];
  } catch {
    parsed = [];
  }
  const migrated = new Set(JSON.parse(localStorage.getItem(MIGRATED_KEY) || '[]') as string[]);
  return parsed
    .filter((ticket) => ticket?.description && !migrated.has(ticket.id))
    .map((ticket) => ({
      id: ticket.id,
      row: {
        id: crypto.randomUUID(),
        created_at: ticket.createdAt || new Date().toISOString(),
        title: (ticket.title || ticket.description).slice(0, 200),
        body: ticket.description.slice(0, 5000),
        type: ticket.type,
        severity: ticket.severity ?? null,
        flow: String(ticket.context?.flow || 'unknown').slice(0, 200),
        step: String(ticket.context?.step || 'unknown').slice(0, 200),
        screen: String(ticket.context?.screen || 'unknown').slice(0, 200),
        route: String(ticket.context?.route || '/').slice(0, 500),
        role: String(ticket.context?.role || 'customer'),
        tester_name: 'Local browser',
        context: ticket.context ?? {},
        app_version: String(ticket.context?.appVersion || 'local').slice(0, 40),
      },
    }));
}

let migrationRun: Promise<{ sent: number; queued: number }> | null = null;

export function migrateLocalTickets(): Promise<{ sent: number; queued: number }> {
  if (!migrationRun) {
    migrationRun = runLegacyMigration().finally(() => {
      migrationRun = null;
    });
  }
  return migrationRun;
}

async function runLegacyMigration(): Promise<{ sent: number; queued: number }> {
  let parsed: LegacyTicket[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    parsed = raw ? (JSON.parse(raw) as LegacyTicket[]) : [];
  } catch {
    parsed = [];
  }
  const migrated = JSON.parse(localStorage.getItem(MIGRATED_KEY) || '[]') as string[];
  const queued = queueLegacyTickets(readOutbox(), migrated, parsed, readTesterName());
  if (!queued.added) return { sent: 0, queued: 0 };
  writeOutbox(queued.outbox);
  localStorage.setItem(MIGRATED_KEY, JSON.stringify(queued.migratedIds));
  const addedIds = new Set(queued.outbox.slice(-queued.added).map((item) => item.id));
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { sent: 0, queued: queued.added };
  }
  const flushed = await flushOutbox(client, readOutbox());
  writeOutbox(flushed.outbox);
  const left = new Set(flushed.outbox.map((item) => item.id));
  let sent = 0;
  let stillQueued = 0;
  for (const id of addedIds) {
    if (left.has(id)) stillQueued += 1;
    else sent += 1;
  }
  return { sent, queued: stillQueued };
}

export async function uploadLocalTickets(): Promise<{ uploaded: number; failed: number; error?: string }> {
  const result = await migrateLocalTickets();
  return {
    uploaded: result.sent,
    failed: result.queued,
    error: result.queued ? 'Queued, will send' : undefined,
  };
}
