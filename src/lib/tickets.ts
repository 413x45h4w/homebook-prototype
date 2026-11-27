import { uid } from './time';

export type FeedbackType = 'bug' | 'idea' | 'confusing' | 'other';
export type FeedbackSeverity = 'low' | 'medium' | 'high';
export type TicketStatus = 'pending' | 'approved' | 'disapproved';

export interface FeedbackContext {
  route: string;
  flow: string;
  step: string;
  screen: string;
  routeFlow: string;
  routeStep: string;
  routeScreen: string;
  overlay: string | null;
  role: 'customer' | 'provider';
  activeSpId: string;
  entityIds: Record<string, string>;
  viewport: string;
  device: string;
  appVersion: string;
  commit: string;
}

export interface TicketEvent {
  id: string;
  at: string;
  kind: 'created' | 'approved' | 'disapproved';
  status: TicketStatus;
  note?: string;
}

export interface AppTicket {
  id: string;
  title: string;
  description: string;
  type: FeedbackType;
  severity?: FeedbackSeverity;
  status: TicketStatus;
  context: FeedbackContext;
  history: TicketEvent[];
  createdAt: string;
}

const TYPE_LABEL: Record<FeedbackType, string> = {
  bug: 'Bug',
  idea: 'Idea',
  confusing: 'Confusing',
  other: 'Other',
};

export function ticketTitle(type: FeedbackType, text: string, flow: string, step: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const snippet = clean.length > 72 ? `${clean.slice(0, 72).trimEnd()}…` : clean;
  return `${TYPE_LABEL[type]}: ${snippet} (${flow} / ${step})`;
}

export function createTicket(
  input: { text: string; type: FeedbackType; severity?: FeedbackSeverity; context: FeedbackContext },
  now = new Date(),
): { ok: true; ticket: AppTicket } | { ok: false; reason: string } {
  const description = input.text.replace(/\s+/g, ' ').trim();
  if (!description) return { ok: false, reason: 'Write a few words about what happened.' };
  if (!input.context.flow || !input.context.step) return { ok: false, reason: 'This screen is missing flow context.' };
  const at = now.toISOString();
  return {
    ok: true,
    ticket: {
      id: uid('tkt'),
      title: ticketTitle(input.type, description, input.context.flow, input.context.step),
      description,
      type: input.type,
      severity: input.severity,
      status: 'pending',
      context: input.context,
      createdAt: at,
      history: [{ id: uid('evt'), at, kind: 'created', status: 'pending' }],
    },
  };
}

export function decideTicket(
  tickets: AppTicket[],
  id: string,
  decision: 'approved' | 'disapproved',
  note: string,
  now = new Date(),
): AppTicket[] {
  return tickets.map((ticket) => {
    if (ticket.id !== id) return ticket;
    const event: TicketEvent = {
      id: uid('evt'),
      at: now.toISOString(),
      kind: decision,
      status: decision,
      note: note.trim() || undefined,
    };
    return { ...ticket, status: decision, history: [...ticket.history, event] };
  });
}

export function ticketsToCsv(tickets: AppTicket[]): string {
  const headers = ['id', 'createdAt', 'status', 'type', 'severity', 'flow', 'step', 'screen', 'route', 'role', 'title', 'description'];
  const lines = [headers.join(',')];
  for (const ticket of tickets) {
    lines.push(
      [
        ticket.id,
        ticket.createdAt,
        ticket.status,
        ticket.type,
        ticket.severity ?? '',
        ticket.context.flow,
        ticket.context.step,
        ticket.context.screen,
        ticket.context.route,
        ticket.context.role,
        ticket.title,
        ticket.description,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function ticketToGithubMarkdown(ticket: AppTicket): string {
  const context = ticket.context;
  return [
    `### ${ticket.title}`,
    '',
    ticket.description,
    '',
    `- Type: ${ticket.type}`,
    `- Severity: ${ticket.severity ?? 'unspecified'}`,
    `- Status: ${ticket.status}`,
    `- Flow: ${context.flow} / ${context.step}`,
    `- Screen: ${context.screen}`,
    `- Route: ${context.route}`,
    `- Role: ${context.role}`,
    `- When: ${ticket.createdAt}`,
    context.entityIds && Object.keys(context.entityIds).length ? `- Entities: ${JSON.stringify(context.entityIds)}` : '',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export const contextSample = (): FeedbackContext => ({
  route: '/visits/visit-1',
  flow: 'visits',
  step: 'detail',
  screen: 'VisitPage',
  routeFlow: 'visits',
  routeStep: 'detail',
  routeScreen: 'VisitPage',
  overlay: null,
  role: 'customer',
  activeSpId: 'sp-maria',
  entityIds: { id: 'visit-1' },
  viewport: '390x844',
  device: 'test',
  appVersion: '1.0.0',
  commit: 'abc',
});
