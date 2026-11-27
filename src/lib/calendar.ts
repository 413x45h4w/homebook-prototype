import type { Appointment, AppointmentRecurrence, Visit } from './types';

export interface CalendarEvent {
  id: string;
  kind: 'visit' | 'appointment';
  title: string;
  start: Date;
  end: Date;
  providerId: string;
  location: string;
  notes: string;
  href?: string;
  recurrence?: AppointmentRecurrence;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

export function startOfWeek(date: Date): Date {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  day.setDate(day.getDate() - day.getDay());
  return day;
}

export function addDays(date: Date, count: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function monthGrid(anchor: Date): Date[] {
  const start = startOfWeek(startOfMonth(anchor));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function dateKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function atTime(day: Date, time: string): Date {
  const [hour, minute] = time.split(':').map(Number);
  const next = new Date(day);
  next.setHours(hour || 0, minute || 0, 0, 0);
  return next;
}

function occurrenceDates(appointment: Appointment, rangeStart: Date, rangeEnd: Date): Date[] {
  const first = parseDateKey(appointment.date);
  if (!appointment.recurrence || appointment.recurrence === 'none') {
    return first >= rangeStart && first <= rangeEnd ? [first] : [];
  }
  if (appointment.recurrence === 'monthly') {
    const dates: Date[] = [];
    let year = first.getFullYear();
    let month = first.getMonth();
    for (let step = 0; step < 240; step += 1) {
      const last = new Date(year, month + 1, 0).getDate();
      const date = new Date(year, month, Math.min(first.getDate(), last));
      if (date > rangeEnd) break;
      if (date >= first && date >= rangeStart) dates.push(date);
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
    return dates;
  }
  const stepDays = appointment.recurrence === 'biweekly' ? 14 : 7;
  const dates: Date[] = [];
  const cursor = new Date(first);
  for (let step = 0; step < 400 && cursor <= rangeEnd; step += 1) {
    if (cursor >= rangeStart) dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + stepDays);
  }
  return dates;
}

export function appointmentEvents(appointments: Appointment[], rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const appointment of appointments) {
    for (const day of occurrenceDates(appointment, rangeStart, rangeEnd)) {
      events.push({
        id: `${appointment.id}::${dateKey(day)}`,
        kind: 'appointment',
        title: appointment.title,
        start: atTime(day, appointment.startTime),
        end: atTime(day, appointment.endTime),
        providerId: appointment.providerId,
        location: appointment.location,
        notes: appointment.notes,
        recurrence: appointment.recurrence,
      });
    }
  }
  return events;
}

export function visitEvents(visits: Visit[], names: (id: string) => string): CalendarEvent[] {
  return visits
    .filter((visit) => visit.status !== 'cancelled')
    .map((visit) => ({
      id: visit.id,
      kind: 'visit' as const,
      title: `${names(visit.spId) || 'Visit'}`,
      start: new Date(visit.start),
      end: new Date(visit.end),
      providerId: visit.spId,
      location: '',
      notes: visit.status === 'completed' ? 'Completed visit' : 'Scheduled visit',
      href: `/visits/${visit.id}`,
    }));
}

export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((event) => sameDay(event.start, day)).sort((a, b) => +a.start - +b.start);
}

export function validateAppointment(input: {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  providerId: string;
  location: string;
  notes: string;
  recurrence: AppointmentRecurrence;
}): { ok: true; value: Omit<Appointment, 'id' | 'createdAt'> } | { ok: false; reason: string } {
  const title = input.title.replace(/\s+/g, ' ').trim();
  if (title.length < 2) return { ok: false, reason: 'Add a title.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, reason: 'Choose a date.' };
  if (!/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{2}:\d{2}$/.test(input.endTime)) return { ok: false, reason: 'Choose a start and end time.' };
  if (input.endTime <= input.startTime) return { ok: false, reason: 'End time has to be after the start.' };
  return {
    ok: true,
    value: {
      title,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      providerId: input.providerId,
      location: input.location.trim(),
      notes: input.notes.trim(),
      recurrence: input.recurrence,
    },
  };
}

function icsStamp(date: Date): string {
  const pad = (value: number) => `${value}`.padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export function eventIcs(event: CalendarEvent): string {
  const rule =
    event.recurrence === 'weekly'
      ? 'RRULE:FREQ=WEEKLY'
      : event.recurrence === 'biweekly'
        ? 'RRULE:FREQ=WEEKLY;INTERVAL=2'
        : event.recurrence === 'monthly'
          ? 'RRULE:FREQ=MONTHLY'
          : '';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Homebook//Calendar//EN',
    'BEGIN:VEVENT',
    `DTSTART:${icsStamp(event.start)}`,
    `DTEND:${icsStamp(event.end)}`,
    `SUMMARY:${icsText(event.title)}`,
    event.location ? `LOCATION:${icsText(event.location)}` : '',
    event.notes ? `DESCRIPTION:${icsText(event.notes)}` : '',
    rule,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}
