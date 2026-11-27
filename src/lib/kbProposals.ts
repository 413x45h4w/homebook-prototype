import { classify } from './classify';
import type { CategoryId, KbItem, KbProposal, KbProposalEvent } from './types';

export interface KbDraft {
  title: string;
  body: string;
  category: CategoryId;
  topic: string;
  note?: string;
}

type Built = { ok: true; proposal: KbProposal } | { ok: false; reason: string };
type Published = { ok: true; proposal: KbProposal; item: KbItem } | { ok: false; reason: string };

function clean(draft: KbDraft): { ok: true; title: string; body: string; topic: string; note: string } | { ok: false; reason: string } {
  const title = draft.title.replace(/\s+/g, ' ').trim();
  const body = draft.body.trim();
  const topic = draft.topic.replace(/\s+/g, ' ').trim();
  if (!title || !body) return { ok: false, reason: 'Add a title and the note.' };
  if (!topic) return { ok: false, reason: 'Say which task, room, or topic this is for.' };
  return { ok: true, title, body, topic, note: (draft.note ?? '').trim() };
}

function eventFor(
  id: string,
  at: string,
  action: KbProposalEvent['action'],
  actor: KbProposalEvent['actor'],
  draft: { title: string; body: string; category: CategoryId; topic: string; note: string },
): KbProposalEvent {
  return { id, at, action, actor, note: draft.note, title: draft.title, body: draft.body, category: draft.category, topic: draft.topic };
}

export function submitKbProposal(input: KbDraft & { id: string; eventId: string; spId: string; clientId: string; now: Date }): Built {
  const text = clean(input);
  if (!text.ok) return text;
  const at = input.now.toISOString();
  return {
    ok: true,
    proposal: {
      id: input.id,
      spId: input.spId,
      clientId: input.clientId,
      status: 'pending',
      title: text.title,
      body: text.body,
      category: input.category,
      topic: text.topic,
      createdAt: at,
      history: [eventFor(input.eventId, at, 'submitted', 'provider', { ...text, category: input.category })],
    },
  };
}

export function reviseKbProposal(proposal: KbProposal, input: KbDraft & { eventId: string; now: Date }): Built {
  if (proposal.status !== 'pending' && proposal.status !== 'changes_requested') {
    return { ok: false, reason: 'This suggestion is already decided.' };
  }
  const text = clean(input);
  if (!text.ok) return text;
  const at = input.now.toISOString();
  return {
    ok: true,
    proposal: {
      ...proposal,
      status: 'pending',
      title: text.title,
      body: text.body,
      category: input.category,
      topic: text.topic,
      history: [...proposal.history, eventFor(input.eventId, at, 'revised', 'provider', { ...text, category: input.category })],
    },
  };
}

export function requestKbChanges(proposal: KbProposal, note: string, now: Date, eventId: string): Built {
  if (proposal.status !== 'pending') return { ok: false, reason: 'Only a note waiting on you can be sent back.' };
  const text = note.trim();
  if (!text) return { ok: false, reason: 'Say what should change.' };
  const at = now.toISOString();
  return {
    ok: true,
    proposal: {
      ...proposal,
      status: 'changes_requested',
      history: [
        ...proposal.history,
        eventFor(eventId, at, 'changes_requested', 'homeowner', {
          title: proposal.title,
          body: proposal.body,
          category: proposal.category,
          topic: proposal.topic,
          note: text,
        }),
      ],
    },
  };
}

export function declineKbProposal(proposal: KbProposal, note: string, now: Date, eventId: string): Built {
  if (proposal.status !== 'pending' && proposal.status !== 'changes_requested') {
    return { ok: false, reason: 'This suggestion is already decided.' };
  }
  const at = now.toISOString();
  return {
    ok: true,
    proposal: {
      ...proposal,
      status: 'declined',
      history: [
        ...proposal.history,
        eventFor(eventId, at, 'declined', 'homeowner', {
          title: proposal.title,
          body: proposal.body,
          category: proposal.category,
          topic: proposal.topic,
          note: note.trim(),
        }),
      ],
    },
  };
}

export function approveKbProposal(
  proposal: KbProposal,
  edit: Partial<KbDraft>,
  now: Date,
  ids: { eventId: string; itemId: string },
): Published {
  if (proposal.status !== 'pending') return { ok: false, reason: 'This suggestion is not waiting for approval.' };
  const text = clean({
    title: edit.title ?? proposal.title,
    body: edit.body ?? proposal.body,
    category: edit.category ?? proposal.category,
    topic: edit.topic ?? proposal.topic,
    note: edit.note,
  });
  if (!text.ok) return text;
  const category = edit.category ?? proposal.category;
  const at = now.toISOString();
  const item: KbItem = {
    id: ids.itemId,
    title: text.title,
    body: text.body,
    category,
    audienceMode: 'auto',
    audience: classify(category, `${text.title}\n${text.body}`).audience,
    images: [],
    createdAt: at,
    contributedBy: { spId: proposal.spId, proposalId: proposal.id },
  };
  return {
    ok: true,
    item,
    proposal: {
      ...proposal,
      status: 'approved',
      title: text.title,
      body: text.body,
      category,
      topic: text.topic,
      publishedItemId: item.id,
      history: [...proposal.history, eventFor(ids.eventId, at, 'approved', 'homeowner', { ...text, category })],
    },
  };
}

export function proposalsWaitingOnHomeowner(proposals: KbProposal[]): KbProposal[] {
  return proposals.filter((proposal) => proposal.status === 'pending');
}
