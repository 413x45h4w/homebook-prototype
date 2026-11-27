import { useSyncExternalStore } from 'react';
import { decideTicket, type AppTicket } from './tickets';

const KEY = 'homebook.appFeedback.v1';

let tickets: AppTicket[] = load();
const listeners = new Set<() => void>();

function load(): AppTicket[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppTicket[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(tickets));
  } catch {
    /* The queue still works in memory if storage is full. */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppTickets(): AppTicket[] {
  return useSyncExternalStore(subscribe, () => tickets, () => tickets);
}

export function addAppTicket(ticket: AppTicket) {
  tickets = [...tickets, ticket];
  emit();
}

export function reviewAppTicket(id: string, decision: 'approved' | 'disapproved', note: string) {
  tickets = decideTicket(tickets, id, decision, note);
  emit();
}

export function pendingTicketCount(list: AppTicket[]): number {
  return list.filter((ticket) => ticket.status === 'pending').length;
}
