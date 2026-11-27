export const SITE_ORIGIN = 'https://413x45h4w.github.io/homebook-prototype';

export const TICKET_DECISIONS = [
  'approved',
  'disapproved',
  'reopened',
  'in_progress',
  'preview_ready',
  'ship_requested',
  'shipped',
  'changes_requested',
  'discarded',
] as const;

export type TicketDecision = (typeof TICKET_DECISIONS)[number];

export type ReviewerDecision = 'approved' | 'disapproved' | 'reopened' | 'ship_requested' | 'changes_requested' | 'discarded';

export type TicketStatus = 'pending' | TicketDecision;

export type QueueSectionId = 'needs' | 'working' | 'ready' | 'shipped' | 'closed';

export const QUEUE_SECTIONS: { id: QueueSectionId; title: string; statuses: TicketStatus[] }[] = [
  { id: 'needs', title: 'Needs decision', statuses: ['pending', 'reopened'] },
  { id: 'working', title: 'Queued / In progress', statuses: ['approved', 'in_progress', 'changes_requested', 'ship_requested'] },
  { id: 'ready', title: 'Ready for review', statuses: ['preview_ready'] },
  { id: 'shipped', title: 'Shipped', statuses: ['shipped'] },
  { id: 'closed', title: 'Closed', statuses: ['disapproved', 'discarded'] },
];

export function ticketShortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 8);
}

export function ticketBranch(id: string): string {
  return `ticket/${ticketShortId(id)}`;
}

export function normalizeRoute(route: string | null | undefined): string {
  if (!route || route === '/') return '/';
  const path = route.split('?')[0];
  return path.startsWith('/') ? path : `/${path}`;
}

export function productionScreen(route: string | null | undefined): string {
  return `${SITE_ORIGIN}/#${normalizeRoute(route)}`;
}

export function previewScreen(shortId: string, route: string | null | undefined): string {
  return `${SITE_ORIGIN}/preview/${shortId}/#${normalizeRoute(route)}`;
}

export function previewHome(shortId: string): string {
  return `${SITE_ORIGIN}/preview/${shortId}/`;
}

export function queueSection(status: string): QueueSectionId {
  const found = QUEUE_SECTIONS.find((section) => section.statuses.includes(status as TicketStatus));
  return found?.id ?? 'needs';
}

export function ticketShortIds(refNames: string[]): string[] {
  const ids = new Set<string>();
  for (const name of refNames) {
    const cleaned = name.replace(/^refs\/remotes\/origin\//, '').replace(/^origin\//, '').replace(/^refs\/heads\//, '');
    if (!cleaned.startsWith('ticket/')) continue;
    const shortId = cleaned.slice('ticket/'.length);
    if (/^[A-Za-z0-9._-]{1,40}$/.test(shortId)) ids.add(shortId);
  }
  return [...ids].sort();
}

export const COMPARE_WIDTH = { desktop: 1100, phone: 390 } as const;
