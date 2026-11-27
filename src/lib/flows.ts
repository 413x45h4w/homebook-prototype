export interface FlowRoute {
  path: string;
  flow: string;
  step: string;
  screen: string;
}

export interface FlowMatch {
  flow: string;
  step: string;
  screen: string;
  entityIds: Record<string, string>;
}

export interface ResolvedFlow extends FlowMatch {
  routeFlow: string;
  routeStep: string;
  routeScreen: string;
  overlay: string | null;
}

export interface OverlayStep {
  step: string;
  screen: string;
  flow?: string;
}

/** Every App route. A test fails if App.tsx and this list drift, or if flow/step/screen is blank. */
export const FLOW_ROUTES: FlowRoute[] = [
  { path: '/', flow: 'home', step: 'dashboard', screen: 'CustomerHome' },
  { path: '/knowledge', flow: 'knowledge', step: 'list', screen: 'KnowledgeList' },
  { path: '/knowledge/new', flow: 'knowledge', step: 'new-note', screen: 'KnowledgeItem' },
  { path: '/knowledge/proposals', flow: 'knowledge', step: 'provider-proposals', screen: 'KnowledgeProposals' },
  { path: '/knowledge/:id', flow: 'knowledge', step: 'note-detail', screen: 'KnowledgeItem' },
  { path: '/voice', flow: 'voice-feedback', step: 'compose', screen: 'VoicePage' },
  { path: '/voice/:spId', flow: 'voice-feedback', step: 'compose-for-provider', screen: 'VoicePage' },
  { path: '/packet/:kind', flow: 'handoff', step: 'packet', screen: 'PacketPage' },
  { path: '/share', flow: 'handoff', step: 'share', screen: 'SharePage' },
  { path: '/export', flow: 'handoff', step: 'export', screen: 'ExportPage' },
  { path: '/visits', flow: 'visits', step: 'list', screen: 'VisitsPage' },
  { path: '/visits/:id', flow: 'visits', step: 'detail', screen: 'VisitPage' },
  { path: '/messages', flow: 'messages', step: 'inbox', screen: 'MessagesPage' },
  { path: '/messages/:threadId', flow: 'messages', step: 'thread', screen: 'ThreadPage' },
  { path: '/book/:spId', flow: 'booking', step: 'pick-slot', screen: 'BookPage' },
  { path: '/providers', flow: 'providers', step: 'list', screen: 'ProvidersPage' },
  { path: '/providers/:spId', flow: 'providers', step: 'profile', screen: 'ProviderPage' },
  { path: '/search', flow: 'search', step: 'results', screen: 'SearchPage' },
  { path: '/notifications', flow: 'notifications', step: 'list', screen: 'NotificationsPage' },
  { path: '/sp', flow: 'provider-day', step: 'today', screen: 'SpToday' },
  { path: '/sp/schedule', flow: 'provider-day', step: 'week', screen: 'SpSchedule' },
  { path: '/sp/clients', flow: 'provider-clients', step: 'list', screen: 'SpClients' },
  { path: '/sp/clients/:clientId', flow: 'provider-clients', step: 'client', screen: 'SpClient' },
  { path: '/sp/payments', flow: 'payments', step: 'list', screen: 'SpPayments' },
  { path: '/review', flow: 'app-feedback', step: 'review-queue', screen: 'ReviewPage' },
  { path: '*', flow: 'system', step: 'not-found', screen: 'NotFound' },
];

export const OVERLAYS: Record<string, OverlayStep> = {
  'switch-persona': { flow: 'account', step: 'switch-persona', screen: 'PersonaDialog' },
  'reset-demo': { flow: 'account', step: 'reset-demo', screen: 'ResetDialog' },
  'delete-note': { flow: 'knowledge', step: 'confirm-delete', screen: 'DeleteNoteDialog' },
  'reschedule-visit': { flow: 'visits', step: 'request-reschedule', screen: 'RescheduleDialog' },
  'cancel-visit': { flow: 'visits', step: 'confirm-cancel', screen: 'CancelVisitDialog' },
  'book-confirm': { flow: 'booking', step: 'confirm-slot', screen: 'SlotSheet' },
  'voice-record': { flow: 'voice-feedback', step: 'record', screen: 'VoiceCapture' },
  'voice-transcribe': { flow: 'voice-feedback', step: 'transcribe', screen: 'VoiceCapture' },
  'voice-review': { flow: 'voice-feedback', step: 'review', screen: 'VoiceCapture' },
};

const NOT_FOUND: FlowMatch = {
  flow: 'system',
  step: 'not-found',
  screen: 'NotFound',
  entityIds: {},
};

function specificity(path: string): number {
  const parts = path.split('/').filter(Boolean);
  const staticParts = parts.filter((part) => !part.startsWith(':')).length;
  return staticParts * 10 + parts.length;
}

const compiled = [...FLOW_ROUTES]
  .filter((route) => route.path !== '*')
  .sort((a, b) => specificity(b.path) - specificity(a.path))
  .map((route) => {
    const names: string[] = [];
    const pattern = route.path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
      names.push(name);
      return '([^/]+)';
    });
    return { route, names, re: new RegExp(`^${pattern}$`) };
  });

export function matchFlow(pathname: string): FlowMatch | null {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname || '/';
  for (const entry of compiled) {
    const found = path.match(entry.re);
    if (!found) continue;
    const entityIds: Record<string, string> = {};
    entry.names.forEach((name, index) => {
      entityIds[name] = decodeURIComponent(found[index + 1] ?? '');
    });
    return { flow: entry.route.flow, step: entry.route.step, screen: entry.route.screen, entityIds };
  }
  return null;
}

export function resolveFlow(pathname: string, overlayId: string | null): ResolvedFlow {
  const route = matchFlow(pathname) ?? NOT_FOUND;
  const base: ResolvedFlow = {
    ...route,
    routeFlow: route.flow,
    routeStep: route.step,
    routeScreen: route.screen,
    overlay: null,
  };
  if (!overlayId) return base;
  const overlay = OVERLAYS[overlayId];
  if (!overlay?.step || !overlay.screen) throw new Error(`Unknown overlay step: ${overlayId}`);
  return {
    ...base,
    flow: overlay.flow ?? route.flow,
    step: overlay.step,
    screen: overlay.screen,
    overlay: overlayId,
  };
}
