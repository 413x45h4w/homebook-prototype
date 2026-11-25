import { estimateTravel, formatKm } from './travel';
import { formatRange, overlaps, withTime } from './time';
import type { Client, Provider, Visit } from './types';

export interface Leg {
  fromId: string;
  toId: string;
  km: number;
  minutes: number;
  bufferMinutes: number;
  gapMinutes: number;
  conflict: boolean;
  fromLabel: string;
  toLabel: string;
  summary: string;
}

export function sortedVisits(visits: Visit[]): Visit[] {
  return [...visits].sort((a, b) => +new Date(a.start) - +new Date(b.start));
}

export function activeVisits(visits: Visit[]): Visit[] {
  return visits.filter((visit) => visit.status !== 'cancelled');
}

export function dayLegs(visits: Visit[], clients: Client[]): Leg[] {
  const sorted = sortedVisits(activeVisits(visits));
  const legs: Leg[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    const from = clients.find((client) => client.id === prev.clientId);
    const to = clients.find((client) => client.id === next.clientId);
    if (!from || !to) continue;
    const travel = estimateTravel(from, to);
    const gapMinutes = Math.round((+new Date(next.start) - +new Date(prev.end)) / 60_000);
    const conflict = gapMinutes + 0.01 < travel.bufferMinutes;
    const fromLabel = `${from.shortName} · ${from.neighborhood}`;
    const toLabel = `${to.shortName} · ${to.neighborhood}`;
    const summary = conflict
      ? `${from.neighborhood} → ${to.neighborhood} needs about ${travel.bufferMinutes} min (${travel.minutes} min moving over ${formatKm(travel.km)}, plus 5 min to get in). Only ${gapMinutes} min are free, so this buffer doesn’t fit.`
      : travel.bufferMinutes === 0
        ? 'Same stop. No travel to pad.'
        : `${formatKm(travel.km)} · about ${travel.minutes} min + 5 min to get in · ${gapMinutes} min free. Fits.`;
    legs.push({
      fromId: prev.id,
      toId: next.id,
      km: travel.km,
      minutes: travel.minutes,
      bufferMinutes: travel.bufferMinutes,
      gapMinutes,
      conflict,
      fromLabel,
      toLabel,
      summary,
    });
  }
  return legs;
}

export function travelProblem(
  visits: Visit[],
  clients: Client[],
  candidate: { start: string; end: string; clientId: string },
  ignoreId?: string,
): string | null {
  const start = +new Date(candidate.start);
  const end = +new Date(candidate.end);
  const here = clients.find((client) => client.id === candidate.clientId);
  if (!here) return 'That client is missing from the demo.';
  const sorted = sortedVisits(activeVisits(visits).filter((visit) => visit.id !== ignoreId));

  const overlap = sorted.find((visit) =>
    overlaps(start, end, +new Date(visit.start), +new Date(visit.end)),
  );
  if (overlap) {
    const who = clients.find((client) => client.id === overlap.clientId);
    return `That overlaps ${who?.shortName ?? 'another client'} (${formatRange(overlap.start, overlap.end)}).`;
  }

  const prev = [...sorted].reverse().find((visit) => +new Date(visit.end) <= start);
  const next = sorted.find((visit) => +new Date(visit.start) >= end);

  const check = (other: Visit, gapMinutes: number, toward: boolean) => {
    const place = clients.find((client) => client.id === other.clientId);
    if (!place) return null;
    const travel = estimateTravel(toward ? place : here, toward ? here : place);
    if (gapMinutes + 0.01 >= travel.bufferMinutes) return null;
    const arrow = toward
      ? `${place.neighborhood} → ${here.neighborhood}`
      : `${here.neighborhood} → ${place.neighborhood}`;
    return `${arrow} needs about ${travel.bufferMinutes} min (${travel.minutes} min over ${formatKm(travel.km)} plus 5 min to get in). Only ${gapMinutes} min are free.`;
  };

  if (prev) {
    const gap = Math.round((start - +new Date(prev.end)) / 60_000);
    const problem = check(prev, gap, true);
    if (problem) return problem;
  }
  if (next) {
    const gap = Math.round((+new Date(next.start) - end) / 60_000);
    const problem = check(next, gap, false);
    if (problem) return problem;
  }
  return null;
}

export type SlotState = 'open' | 'booked' | 'conflict' | 'past';

export function describeSlot(
  visits: Visit[],
  clients: Client[],
  candidate: { start: string; end: string; clientId: string },
  ignoreId?: string,
): { state: SlotState; reason?: string } {
  if (+new Date(candidate.end) < Date.now()) {
    return { state: 'past', reason: 'That time has already passed.' };
  }
  const problem = travelProblem(visits, clients, candidate, ignoreId);
  if (!problem) return { state: 'open' };
  if (problem.startsWith('That overlaps')) return { state: 'booked', reason: problem };
  return { state: 'conflict', reason: problem };
}

export function slotsOnDay(provider: Provider, day: Date): { start: string; end: string }[] {
  const dow = day.getDay();
  return provider.slotTemplates
    .filter((slot) => slot.days.includes(dow))
    .map((slot) => ({
      start: withTime(day, slot.start).toISOString(),
      end: withTime(day, slot.end).toISOString(),
    }));
}
