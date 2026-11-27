import seedJson from './seed.json';
import { classify } from '../lib/classify';
import { itemText } from '../lib/packet';
import { atDay, nextWeekday } from '../lib/time';
import type {
  AppNotification,
  Audience,
  CategoryId,
  Client,
  KbItem,
  KbSource,
  Message,
  Persona,
  Proposal,
  Provider,
  SentPacket,
  SpKind,
  State,
  Thread,
  Visit,
  VisitStatus,
  PaymentStatus,
} from '../lib/types';

interface SeedWhen {
  dayOffset?: number;
  nthWeekday?: number;
  which?: number;
  start: string;
  end: string;
}

interface SeedFile {
  customerId: string;
  clients: Client[];
  providers: Provider[];
  threads: Thread[];
  items: {
    id: string;
    title: string;
    category: CategoryId;
    dayOffset: number;
    time: string;
    body: string;
    images: { id: string; src: string; caption: string }[];
    source?: KbSource;
  }[];
  messages: {
    id: string;
    threadId: string;
    from: Message['from'];
    dayOffset: number;
    time: string;
    body: string;
    savedAsKbItemId?: string;
    proposal?: {
      kind: Proposal['kind'];
      status: Proposal['status'];
      visitId?: string;
      slots: SeedWhen[];
    };
  }[];
  visits: (SeedWhen & {
    id: string;
    spId: string;
    clientId: string;
    status: VisitStatus;
    paymentStatus: PaymentStatus;
    amount: number;
    feedback?: { rating: number; comment: string; themes: string[] };
  })[];
  notifications: {
    id: string;
    persona: Persona;
    spId?: string;
    title: string;
    body: string;
    dayOffset: number;
    time: string;
    read: boolean;
    href: string;
  }[];
  sentPackets: {
    id: string;
    kind: SpKind;
    recipientName: string;
    note: string;
    itemIds: string[];
    dayOffset: number;
    time: string;
  }[];
}

const seed = seedJson as SeedFile;

export const STORAGE_KEY = 'homebook.v1';
export const STATE_VERSION = 1;
export const ALEX_ID = seed.customerId;

export const clients = seed.clients as Client[];
export const providers = seed.providers as Provider[];

export function clientById(id: string): Client | undefined {
  return clients.find((client) => client.id === id);
}

export function providerById(id: string): Provider | undefined {
  return providers.find((provider) => provider.id === id);
}

export const alex = clientById(ALEX_ID)!;

function rangeFrom(when: SeedWhen): { start: string; end: string } {
  if (typeof when.nthWeekday === 'number') {
    return {
      start: nextWeekday(when.nthWeekday, when.which ?? 0, when.start).toISOString(),
      end: nextWeekday(when.nthWeekday, when.which ?? 0, when.end).toISOString(),
    };
  }
  const offset = when.dayOffset ?? 0;
  return {
    start: atDay(offset, when.start).toISOString(),
    end: atDay(offset, when.end).toISOString(),
  };
}

function stamp(dayOffset: number, time: string): string {
  return atDay(dayOffset, time).toISOString();
}

function buildItems(): KbItem[] {
  return seed.items.map((raw) => {
    const item: KbItem = {
      id: raw.id,
      title: raw.title,
      body: raw.body,
      category: raw.category as CategoryId,
      audienceMode: 'auto',
      audience: [],
      images: raw.images.map((image) => ({ ...image })),
      createdAt: stamp(raw.dayOffset, raw.time),
      source: raw.source
        ? {
            messageId: raw.source.messageId,
            threadId: raw.source.threadId,
            spId: raw.source.spId,
          }
        : undefined,
    };
    item.audience = classify(item.category, itemText(item)).audience;
    return item;
  });
}

function buildMessages(): Message[] {
  return seed.messages.map((raw) => {
    const message: Message = {
      id: raw.id,
      threadId: raw.threadId,
      from: raw.from as Message['from'],
      body: raw.body,
      createdAt: stamp(raw.dayOffset, raw.time),
      savedAsKbItemId: raw.savedAsKbItemId,
    };
    if (raw.proposal) {
      message.proposal = {
        kind: raw.proposal.kind,
        status: raw.proposal.status,
        visitId: raw.proposal.visitId,
        slots: raw.proposal.slots.map((slot) => rangeFrom(slot)),
      };
    }
    return message;
  });
}

function buildVisits(): Visit[] {
  return seed.visits.map((raw) => {
    const when = rangeFrom(raw);
    const visit: Visit = {
      id: raw.id,
      spId: raw.spId,
      clientId: raw.clientId,
      start: when.start,
      end: when.end,
      status: raw.status,
      paymentStatus: raw.paymentStatus,
      amount: raw.amount,
    };
    if ('feedback' in raw && raw.feedback) {
      visit.feedback = {
        rating: raw.feedback.rating,
        comment: raw.feedback.comment,
        themes: [...raw.feedback.themes],
        createdAt: when.end,
      };
    }
    return visit;
  });
}

function buildNotifications(): AppNotification[] {
  return seed.notifications.map((raw) => ({
    id: raw.id,
    persona: raw.persona,
    spId: raw.spId,
    title: raw.title,
    body: raw.body,
    createdAt: stamp(raw.dayOffset, raw.time),
    read: raw.read,
    href: raw.href,
  }));
}

function buildPackets(): SentPacket[] {
  return seed.sentPackets.map((raw) => ({
    id: raw.id,
    kind: raw.kind,
    recipientName: raw.recipientName,
    note: raw.note,
    itemIds: [...raw.itemIds],
    createdAt: stamp(raw.dayOffset, raw.time),
  }));
}

export function freshState(): State {
  return {
    version: STATE_VERSION,
    persona: 'customer',
    activeSpId: 'sp-maria',
    items: buildItems(),
    threads: seed.threads.map((thread) => ({ ...thread })) as Thread[],
    messages: buildMessages(),
    visits: buildVisits(),
    notifications: buildNotifications(),
    sentPackets: buildPackets(),
    dismissedOffers: [],
    voiceNotes: [],
    kbProposals: [],
  };
}

export function loadState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw) as State;
    if (!parsed || parsed.version !== STATE_VERSION || !Array.isArray(parsed.items)) return freshState();
    if (!Array.isArray(parsed.voiceNotes)) parsed.voiceNotes = [];
    if (!Array.isArray(parsed.kbProposals)) parsed.kbProposals = [];
    return parsed;
  } catch {
    return freshState();
  }
}

export function kindOf(spId: string): SpKind {
  return providerById(spId)?.kind ?? 'cleaner';
}

export function audienceOrAll(audience: Audience[]): Audience[] {
  return audience.includes('all') || audience.length === 0 ? ['all'] : audience;
}
