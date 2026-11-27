import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clearClips } from './audioStore';
import { classify } from './classify';
import { itemText } from './packet';
import { appendVoiceFeedback, type VoiceFeedback } from './voiceFeedback';
import { approveKbProposal, declineKbProposal, requestKbChanges, reviseKbProposal, submitKbProposal } from './kbProposals';
import { travelProblem } from './schedule';
import { formatRange, uid } from './time';
import type {
  AppNotification,
  Appointment,
  Audience,
  CategoryId,
  KbImage,
  KbItem,
  Message,
  PaymentStatus,
  Persona,
  Proposal,
  SpKind,
  State,
  Visit,
} from './types';
import { ALEX_ID, clients, freshState, loadState, providerById, setLiveProviders, STORAGE_KEY } from '../data/load';
import { validateAppointment } from './calendar';
import { validateProvider, type ProviderDraft } from './providers';

type Updater = (state: State) => State;

export interface StoreApi {
  state: State;
  reset: () => void;
  setPersona: (persona: Persona, spId?: string) => void;
  dismissOffer: (messageId: string) => void;
  saveItem: (item: KbItem) => void;
  deleteItem: (id: string) => void;
  setAudience: (id: string, audience: Audience[]) => void;
  useAutoAudience: (id: string) => void;
  addImage: (id: string, image: KbImage) => boolean;
  setImageSrc: (itemId: string, imageId: string, src: string) => void;
  setCaption: (itemId: string, imageId: string, caption: string) => void;
  removeImage: (itemId: string, imageId: string) => void;
  sendMessage: (threadId: string, body: string) => string | null;
  saveInstructionFromMessage: (messageId: string, draft: { title: string; category: CategoryId }) => string | null;
  bookVisit: (input: { spId: string; start: string; end: string }) => { ok: true; visitId: string } | { ok: false; reason: string };
  requestTime: (input: { spId: string; start: string; end: string; note: string }) => string | null;
  requestReschedule: (visitId: string, note: string) => string | null;
  proposeSlots: (messageId: string, slots: { start: string; end: string }[]) => boolean;
  acceptSlot: (messageId: string, index: number) => { ok: true; visitId: string } | { ok: false; reason: string };
  declineProposal: (messageId: string) => void;
  cancelVisit: (visitId: string) => void;
  markCompleted: (visitId: string) => void;
  saveFeedback: (visitId: string, feedback: { rating: number; comment: string; themes: string[] }) => void;
  requestPayment: (visitId: string) => void;
  setPaymentStatus: (visitId: string, status: PaymentStatus) => void;
  sendPacket: (input: { kind: SpKind; recipientName: string; note: string; itemIds: string[] }) => string;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  addVoiceFeedback: (note: VoiceFeedback) => void;
  suggestKbNote: (input: { title: string; body: string; category: CategoryId; topic: string }) => { ok: true; id: string } | { ok: false; reason: string };
  reviseKbNote: (id: string, input: { title: string; body: string; category: CategoryId; topic: string }) => { ok: true } | { ok: false; reason: string };
  decideKbNote: (
    id: string,
    action: 'approved' | 'changes_requested' | 'declined',
    edit: { title: string; body: string; category: CategoryId; topic: string; note: string },
  ) => { ok: true; itemId?: string } | { ok: false; reason: string };
  saveProvider: (draft: ProviderDraft) => { ok: true; id: string } | { ok: false; reason: string };
  saveAppointment: (input: Omit<Appointment, 'id' | 'createdAt'> & { id?: string }) => { ok: true; id: string } | { ok: false; reason: string };
  deleteAppointment: (id: string) => void;
}

const StoreContext = createContext<StoreApi | null>(null);

function pushNote(state: State, note: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): AppNotification[] {
  return [
    {
      id: uid('ntf'),
      createdAt: new Date().toISOString(),
      read: false,
      ...note,
    },
    ...state.notifications,
  ];
}

export function notificationsFor(state: State): AppNotification[] {
  return state.notifications
    .filter((note) =>
      state.persona === 'customer' ? note.persona === 'customer' : note.persona === 'provider' && note.spId === state.activeSpId,
    )
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => loadState());
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* A very large photo can miss the quota. The in-memory demo still works. */
    }
  }, [state]);

  const api = useMemo<Omit<StoreApi, 'state'>>(() => {
    const update = (fn: Updater) => {
      const next = fn(ref.current);
      ref.current = next;
      setState(next);
      return next;
    };

    return {
      reset: () => {
        localStorage.removeItem(STORAGE_KEY);
        void clearClips().catch(() => undefined);
        const next = freshState();
        ref.current = next;
        setState(next);
      },
      setPersona: (persona, spId) => {
        update((current) => ({ ...current, persona, activeSpId: spId ?? current.activeSpId }));
      },
      dismissOffer: (messageId) => {
        update((current) =>
          current.dismissedOffers.includes(messageId)
            ? current
            : { ...current, dismissedOffers: [...current.dismissedOffers, messageId] },
        );
      },
      saveItem: (item) => {
        update((current) => {
          const audience =
            item.audienceMode === 'auto' ? classify(item.category, itemText(item)).audience : normalizeAudience(item.audience);
          const nextItem = { ...item, audience };
          const exists = current.items.some((row) => row.id === item.id);
          return {
            ...current,
            items: exists ? current.items.map((row) => (row.id === item.id ? nextItem : row)) : [nextItem, ...current.items],
          };
        });
      },
      deleteItem: (id) => {
        update((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) }));
      },
      setAudience: (id, audience) => {
        update((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === id ? { ...item, audienceMode: 'override', audience: normalizeAudience(audience) } : item,
          ),
        }));
      },
      useAutoAudience: (id) => {
        update((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === id
              ? { ...item, audienceMode: 'auto', audience: classify(item.category, itemText(item)).audience }
              : item,
          ),
        }));
      },
      addImage: (id, image) => {
        const item = ref.current.items.find((row) => row.id === id);
        if (!item || item.images.length >= 6) return false;
        update((current) => ({
          ...current,
          items: current.items.map((row) => (row.id === id ? { ...row, images: [...row.images, image] } : row)),
        }));
        return true;
      },
      setImageSrc: (itemId, imageId, src) => {
        update((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === itemId
              ? { ...item, images: item.images.map((image) => (image.id === imageId ? { ...image, src } : image)) }
              : item,
          ),
        }));
      },
      setCaption: (itemId, imageId, caption) => {
        update((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === itemId
              ? { ...item, images: item.images.map((image) => (image.id === imageId ? { ...image, caption } : image)) }
              : item,
          ),
        }));
      },
      removeImage: (itemId, imageId) => {
        update((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === itemId ? { ...item, images: item.images.filter((image) => image.id !== imageId) } : item,
          ),
        }));
      },
      sendMessage: (threadId, body) => {
        const text = body.trim();
        if (!text) return null;
        const id = uid('msg');
        update((current) => {
          const thread = current.threads.find((row) => row.id === threadId);
          const from = current.persona === 'customer' ? 'customer' : 'provider';
          const message: Message = { id, threadId, from, body: text, createdAt: new Date().toISOString() };
          const spId = thread?.spId ?? current.activeSpId;
          const provider = providerById(spId);
          const note =
            from === 'customer'
              ? {
                  persona: 'provider' as const,
                  spId,
                  title: 'New message from Alex',
                  body: clip(text),
                  href: `/messages/${threadId}`,
                }
              : {
                  persona: 'customer' as const,
                  title: `New message from ${provider?.name ?? 'your provider'}`,
                  body: clip(text),
                  href: `/messages/${threadId}`,
                };
          return { ...current, messages: [...current.messages, message], notifications: pushNote(current, note) };
        });
        return id;
      },
      saveInstructionFromMessage: (messageId, draft) => {
        const id = uid('kb');
        let saved = false;
        update((current) => {
          const message = current.messages.find((row) => row.id === messageId);
          if (!message || message.savedAsKbItemId) return current;
          const thread = current.threads.find((row) => row.id === message.threadId);
          const title = draft.title.trim() || message.body;
          const item: KbItem = {
            id,
            title,
            body: message.body,
            category: draft.category,
            audienceMode: 'auto',
            audience: classify(draft.category, `${title}\n${message.body}`).audience,
            images: [],
            createdAt: new Date().toISOString(),
            source: thread ? { messageId, threadId: thread.id, spId: thread.spId } : undefined,
          };
          saved = true;
          return {
            ...current,
            items: [item, ...current.items],
            messages: current.messages.map((row) => (row.id === messageId ? { ...row, savedAsKbItemId: id } : row)),
          };
        });
        return saved ? id : null;
      },
      bookVisit: (input) => {
        const provider = providerById(input.spId);
        if (!provider?.bookable) return { ok: false, reason: 'This provider isn’t taking new visits.' };
        let result: { ok: true; visitId: string } | { ok: false; reason: string } = {
          ok: false,
          reason: 'That time isn’t open.',
        };
        update((current) => {
          const problem = travelProblem(
            current.visits.filter((visit) => visit.spId === input.spId),
            clients,
            { ...input, clientId: ALEX_ID },
          );
          if (problem) {
            result = { ok: false, reason: problem };
            return current;
          }
          const visit = makeVisit(input.spId, input.start, input.end, provider.rate);
          result = { ok: true, visitId: visit.id };
          return {
            ...current,
            visits: [...current.visits, visit],
            notifications: pushNote(current, {
              persona: 'provider',
              spId: input.spId,
              title: 'Alex booked a visit',
              body: formatRange(input.start, input.end),
              href: `/visits/${visit.id}`,
            }),
          };
        });
        return result;
      },
      requestTime: (input) => {
        const thread = ref.current.threads.find((row) => row.spId === input.spId && row.clientId === ALEX_ID);
        if (!thread) return null;
        const id = uid('msg');
        const body = input.note.trim() || `Could we book ${formatRange(input.start, input.end)}?`;
        update((current) => ({
          ...current,
          messages: [
            ...current.messages,
            {
              id,
              threadId: thread.id,
              from: 'customer',
              body,
              createdAt: new Date().toISOString(),
              proposal: { kind: 'booking', status: 'pending', slots: [{ start: input.start, end: input.end }] },
            },
          ],
          notifications: pushNote(current, {
            persona: 'provider',
            spId: input.spId,
            title: 'Alex requested a time',
            body: formatRange(input.start, input.end),
            href: `/messages/${thread.id}`,
          }),
        }));
        return id;
      },
      requestReschedule: (visitId, note) => {
        const existing = ref.current.messages.find(
          (message) =>
            message.proposal?.visitId === visitId &&
            (message.proposal.status === 'pending' || message.proposal.status === 'proposed'),
        );
        if (existing) return existing.id;
        const visit = ref.current.visits.find((row) => row.id === visitId);
        if (!visit || visit.status !== 'scheduled') return null;
        const thread = ref.current.threads.find((row) => row.spId === visit.spId && row.clientId === ALEX_ID);
        if (!thread) return null;
        const id = uid('msg');
        const body = note.trim() || `Can we move ${formatRange(visit.start, visit.end)}?`;
        update((current) => ({
          ...current,
          messages: [
            ...current.messages,
            {
              id,
              threadId: thread.id,
              from: 'customer',
              body,
              createdAt: new Date().toISOString(),
              proposal: { kind: 'reschedule', status: 'pending', visitId, slots: [] },
            },
          ],
          notifications: pushNote(current, {
            persona: 'provider',
            spId: visit.spId,
            title: 'Alex asked to reschedule',
            body: formatRange(visit.start, visit.end),
            href: `/messages/${thread.id}`,
          }),
        }));
        return id;
      },
      proposeSlots: (messageId, slots) => {
        if (!slots.length) return false;
        let ok = false;
        update((current) => {
          const message = current.messages.find((row) => row.id === messageId);
          if (!message?.proposal) return current;
          if (message.proposal.status === 'accepted' || message.proposal.status === 'declined') return current;
          const thread = current.threads.find((row) => row.id === message.threadId);
          const provider = thread ? providerById(thread.spId) : undefined;
          ok = true;
          const proposal: Proposal = { ...message.proposal, status: 'proposed', slots };
          return {
            ...current,
            messages: current.messages.map((row) => (row.id === messageId ? { ...row, proposal } : row)),
            notifications: pushNote(current, {
              persona: 'customer',
              title: `${provider?.name ?? 'Your provider'} sent other times`,
              body: slots.map((slot) => formatRange(slot.start, slot.end)).join(' · '),
              href: `/messages/${message.threadId}`,
            }),
          };
        });
        return ok;
      },
      acceptSlot: (messageId, index) => {
        let result: { ok: true; visitId: string } | { ok: false; reason: string } = {
          ok: false,
          reason: 'That proposal is no longer open.',
        };
        update((current) => {
          const message = current.messages.find((row) => row.id === messageId);
          const slot = message?.proposal?.slots[index];
          if (!message?.proposal || !slot) return current;
          if (message.proposal.status !== 'pending' && message.proposal.status !== 'proposed') return current;
          const thread = current.threads.find((row) => row.id === message.threadId);
          if (!thread) return current;
          const provider = providerById(thread.spId);
          if (!provider) return current;
          const ignoreId = message.proposal.kind === 'reschedule' ? message.proposal.visitId : undefined;
          const problem = travelProblem(
            current.visits.filter((visit) => visit.spId === thread.spId),
            clients,
            { start: slot.start, end: slot.end, clientId: ALEX_ID },
            ignoreId,
          );
          if (problem) {
            result = { ok: false, reason: problem };
            return current;
          }
          let visits = current.visits;
          let visitId = message.proposal.visitId ?? uid('visit');
          if (message.proposal.kind === 'reschedule' && message.proposal.visitId) {
            visitId = message.proposal.visitId;
            visits = visits.map((visit) =>
              visit.id === visitId ? { ...visit, start: slot.start, end: slot.end, status: 'scheduled' } : visit,
            );
          } else {
            visits = [...visits, makeVisit(thread.spId, slot.start, slot.end, provider.rate, visitId)];
          }
          const actor = current.persona === 'customer' ? 'Alex' : provider.name.split(' ')[0];
          const note =
            current.persona === 'customer'
              ? {
                  persona: 'provider' as const,
                  spId: thread.spId,
                  title: `${actor} accepted a time`,
                  body: formatRange(slot.start, slot.end),
                  href: `/visits/${visitId}`,
                }
              : {
                  persona: 'customer' as const,
                  title: `${actor} accepted a time`,
                  body: formatRange(slot.start, slot.end),
                  href: `/visits/${visitId}`,
                };
          result = { ok: true, visitId };
          return {
            ...current,
            visits,
            messages: current.messages.map((row) =>
              row.id === messageId
                ? { ...row, proposal: { ...message.proposal!, status: 'accepted', chosen: index, visitId } }
                : row,
            ),
            notifications: pushNote(current, note),
          };
        });
        return result;
      },
      declineProposal: (messageId) => {
        update((current) => {
          const message = current.messages.find((row) => row.id === messageId);
          if (!message?.proposal || message.proposal.status === 'accepted') return current;
          const thread = current.threads.find((row) => row.id === message.threadId);
          const provider = thread ? providerById(thread.spId) : undefined;
          const note =
            current.persona === 'customer'
              ? {
                  persona: 'provider' as const,
                  spId: thread?.spId,
                  title: 'Alex declined the proposed times',
                  body: clip(message.body),
                  href: `/messages/${message.threadId}`,
                }
              : {
                  persona: 'customer' as const,
                  title: `${provider?.name ?? 'Your provider'} declined the request`,
                  body: clip(message.body),
                  href: `/messages/${message.threadId}`,
                };
          return {
            ...current,
            messages: current.messages.map((row) =>
              row.id === messageId && row.proposal ? { ...row, proposal: { ...row.proposal, status: 'declined' } } : row,
            ),
            notifications: pushNote(current, note),
          };
        });
      },
      cancelVisit: (visitId) => {
        update((current) => {
          const visit = current.visits.find((row) => row.id === visitId);
          if (!visit || visit.status === 'cancelled') return current;
          const provider = providerById(visit.spId);
          const note =
            current.persona === 'customer'
              ? {
                  persona: 'provider' as const,
                  spId: visit.spId,
                  title: 'Alex cancelled a visit',
                  body: formatRange(visit.start, visit.end),
                  href: `/visits/${visitId}`,
                }
              : {
                  persona: 'customer' as const,
                  title: `${provider?.name ?? 'Your provider'} cancelled a visit`,
                  body: formatRange(visit.start, visit.end),
                  href: `/visits/${visitId}`,
                };
          return {
            ...current,
            visits: current.visits.map((row) => (row.id === visitId ? { ...row, status: 'cancelled' } : row)),
            notifications: pushNote(current, note),
          };
        });
      },
      markCompleted: (visitId) => {
        update((current) => ({
          ...current,
          visits: current.visits.map((visit) =>
            visit.id === visitId && visit.status === 'scheduled' ? { ...visit, status: 'completed' } : visit,
          ),
        }));
      },
      saveFeedback: (visitId, feedback) => {
        update((current) => {
          const visit = current.visits.find((row) => row.id === visitId);
          if (!visit) return current;
          return {
            ...current,
            visits: current.visits.map((row) =>
              row.id === visitId
                ? {
                    ...row,
                    status: 'completed',
                    feedback: { ...feedback, createdAt: new Date().toISOString() },
                  }
                : row,
            ),
            notifications: pushNote(current, {
              persona: 'provider',
              spId: visit.spId,
              title: 'Alex left feedback',
              body: feedback.comment ? clip(feedback.comment) : `${feedback.rating} stars`,
              href: `/visits/${visitId}`,
            }),
          };
        });
      },
      requestPayment: (visitId) => {
        update((current) => {
          const visit = current.visits.find((row) => row.id === visitId);
          if (!visit) return current;
          const provider = providerById(visit.spId);
          return {
            ...current,
            visits: current.visits.map((row) =>
              row.id === visitId ? { ...row, paymentStatus: row.paymentStatus === 'paid' ? 'paid' : 'requested' } : row,
            ),
            notifications: pushNote(current, {
              persona: 'customer',
              title: `${provider?.name ?? 'Your provider'} requested payment`,
              body: `${moneyish(visit.amount)} · ${formatRange(visit.start, visit.end)}`,
              href: `/visits/${visitId}`,
            }),
          };
        });
      },
      setPaymentStatus: (visitId, status) => {
        update((current) => {
          const visit = current.visits.find((row) => row.id === visitId);
          if (!visit) return current;
          const provider = providerById(visit.spId);
          const notifications =
            status === 'paid'
              ? pushNote(current, {
                  persona: 'customer',
                  title: `${provider?.name ?? 'Your provider'} marked a visit paid`,
                  body: formatRange(visit.start, visit.end),
                  href: `/visits/${visitId}`,
                })
              : current.notifications;
          return {
            ...current,
            visits: current.visits.map((row) => (row.id === visitId ? { ...row, paymentStatus: status } : row)),
            notifications,
          };
        });
      },
      sendPacket: (input) => {
        const id = uid('packet');
        update((current) => ({
          ...current,
          sentPackets: [
            {
              id,
              kind: input.kind,
              recipientName: input.recipientName.trim(),
              note: input.note.trim(),
              itemIds: input.itemIds,
              createdAt: new Date().toISOString(),
            },
            ...current.sentPackets,
          ],
          notifications: pushNote(current, {
            persona: 'customer',
            title: `Packet sent to ${input.recipientName.trim()}`,
            body: input.note.trim() || 'The household handoff is ready for them.',
            href: '/share',
          }),
        }));
        return id;
      },
      markNotificationRead: (id) => {
        update((current) => ({
          ...current,
          notifications: current.notifications.map((note) => (note.id === id ? { ...note, read: true } : note)),
        }));
      },
      markAllNotificationsRead: () => {
        update((current) => {
          const visible = new Set(notificationsFor(current).map((note) => note.id));
          return {
            ...current,
            notifications: current.notifications.map((note) => (visible.has(note.id) ? { ...note, read: true } : note)),
          };
        });
      },
      addVoiceFeedback: (note) => {
        update((current) => {
          const provider = providerById(note.spId);
          return {
            ...current,
            voiceNotes: appendVoiceFeedback(current.voiceNotes, note),
            notifications: pushNote(current, {
              persona: 'provider',
              spId: note.spId,
              title: 'Alex left a voice note',
              body: `${provider?.name ?? 'A provider'} · ${clip(note.transcript)}`,
              href: `/providers/${note.spId}`,
            }),
          };
        });
      },
      suggestKbNote: (input) => {
        const id = uid('kbp');
        const built = submitKbProposal({
          ...input,
          id,
          eventId: uid('kbe'),
          spId: ref.current.activeSpId,
          clientId: ALEX_ID,
          now: new Date(),
        });
        if (!built.ok) return built;
        update((current) => {
          const provider = providerById(current.activeSpId);
          return {
            ...current,
            kbProposals: [built.proposal, ...current.kbProposals],
            notifications: pushNote(current, {
              persona: 'customer',
              title: 'Pending from providers',
              body: `${provider?.name ?? 'A provider'} suggested “${built.proposal.title}”`,
              href: '/knowledge/proposals',
            }),
          };
        });
        return { ok: true, id };
      },
      reviseKbNote: (id, input) => {
        const current = ref.current.kbProposals.find((proposal) => proposal.id === id);
        if (!current) return { ok: false, reason: 'That suggestion is gone.' };
        const built = reviseKbProposal(current, { ...input, eventId: uid('kbe'), now: new Date() });
        if (!built.ok) return built;
        update((state) => ({
          ...state,
          kbProposals: state.kbProposals.map((proposal) => (proposal.id === id ? built.proposal : proposal)),
          notifications: pushNote(state, {
            persona: 'customer',
            title: 'Pending from providers',
            body: `${providerById(built.proposal.spId)?.name ?? 'A provider'} updated “${built.proposal.title}”`,
            href: '/knowledge/proposals',
          }),
        }));
        return { ok: true };
      },
      decideKbNote: (id, action, edit) => {
        const current = ref.current.kbProposals.find((proposal) => proposal.id === id);
        if (!current) return { ok: false, reason: 'That suggestion is gone.' };
        const now = new Date();
        const eventId = uid('kbe');
        if (action === 'approved') {
          const built = approveKbProposal(current, edit, now, { eventId, itemId: uid('kb') });
          if (!built.ok) return built;
          update((state) => ({
            ...state,
            items: [built.item, ...state.items],
            kbProposals: state.kbProposals.map((proposal) => (proposal.id === id ? built.proposal : proposal)),
            notifications: pushNote(state, {
              persona: 'provider',
              spId: current.spId,
              title: 'Alex published your note',
              body: built.item.title,
              href: `/knowledge/${built.item.id}`,
            }),
          }));
          return { ok: true, itemId: built.item.id };
        }
        const built = action === 'declined' ? declineKbProposal(current, edit.note, now, eventId) : requestKbChanges(current, edit.note, now, eventId);
        if (!built.ok) return built;
        update((state) => ({
          ...state,
          kbProposals: state.kbProposals.map((proposal) => (proposal.id === id ? built.proposal : proposal)),
          notifications: pushNote(state, {
            persona: 'provider',
            spId: current.spId,
            title: action === 'declined' ? 'Alex declined a note' : 'Alex asked for a change',
            body: edit.note.trim() || built.proposal.title,
            href: `/sp/clients/${current.clientId}`,
          }),
        }));
        return { ok: true };
      },
      saveProvider: (draft) => {
        const built = validateProvider(draft);
        if (!built.ok) return built;
        const existing = draft.id ? ref.current.providers.find((provider) => provider.id === draft.id) : undefined;
        const provider = existing
          ? {
              ...existing,
              name: built.provider.name,
              trade: built.provider.trade,
              kind: built.provider.kind,
              phone: built.provider.phone,
              company: built.provider.company,
              email: built.provider.email,
              website: built.provider.website,
              serviceArea: built.provider.serviceArea,
              preferredContact: built.provider.preferredContact,
              notes: built.provider.notes,
              bio: built.provider.notes || existing.bio,
            }
          : built.provider;
        update((current) => ({
          ...current,
          providers: existing
            ? current.providers.map((row) => (row.id === provider.id ? provider : row))
            : [provider, ...current.providers],
        }));
        return { ok: true, id: provider.id };
      },
      saveAppointment: (input) => {
        const built = validateAppointment(input);
        if (!built.ok) return built;
        const id = input.id || uid('apt');
        update((current) => {
          const previous = current.appointments.find((row) => row.id === id);
          const row: Appointment = { ...built.value, id, createdAt: previous?.createdAt ?? new Date().toISOString() };
          return {
            ...current,
            appointments: previous ? current.appointments.map((item) => (item.id === id ? row : item)) : [row, ...current.appointments],
          };
        });
        return { ok: true, id };
      },
      deleteAppointment: (id) => {
        update((current) => ({ ...current, appointments: current.appointments.filter((row) => row.id !== id) }));
      },
    };
  }, []);

  const value = useMemo<StoreApi>(() => ({ state, ...api }), [state, api]);
  setLiveProviders(state.providers);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function normalizeAudience(audience: Audience[]): Audience[] {
  const cleaned = audience.filter((kind) => kind !== 'all');
  if (!cleaned.length || audience.includes('all')) return ['all'];
  return [...new Set(cleaned)];
}

function makeVisit(spId: string, start: string, end: string, amount: number, id = uid('visit')): Visit {
  return {
    id,
    spId,
    clientId: ALEX_ID,
    start,
    end,
    status: 'scheduled',
    paymentStatus: 'unpaid',
    amount,
  };
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 140 ? `${clean.slice(0, 137)}…` : clean;
}

function moneyish(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export function useStore(): StoreApi {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
}
