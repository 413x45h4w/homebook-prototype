import { describe, expect, it } from 'vitest';
import { appointmentEvents, dateKey, eventIcs, monthGrid, validateAppointment, type CalendarEvent } from './calendar';
import type { Appointment } from './types';

const weekly: Appointment = {
  id: 'apt-1',
  title: 'Filter change',
  date: '2026-11-02',
  startTime: '09:00',
  endTime: '10:00',
  providerId: 'sp-maria',
  location: 'Apt 4B',
  notes: 'HVAC filters',
  recurrence: 'weekly',
  createdAt: '2026-11-01T00:00:00.000Z',
};

describe('calendar', () => {
  it('builds a six-week month and expands a weekly appointment inside the range', () => {
    const november = new Date(2026, 10, 1);
    expect(monthGrid(november)).toHaveLength(42);
    const events = appointmentEvents([weekly], new Date(2026, 10, 1), new Date(2026, 10, 30));
    expect(events.map((event) => dateKey(event.start))).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
    expect(events[0].providerId).toBe('sp-maria');
  });

  it('rejects an end time that is not after the start', () => {
    const bad = validateAppointment({
      title: 'Boiler check',
      date: '2026-11-27',
      startTime: '15:00',
      endTime: '14:00',
      providerId: '',
      location: '',
      notes: '',
      recurrence: 'none',
    });
    expect(bad.ok).toBe(false);
  });

  it('writes an ics file a calendar app can open', () => {
    const event: CalendarEvent = {
      id: 'e1',
      kind: 'appointment',
      title: 'Boiler check',
      start: new Date(2026, 10, 27, 9, 30),
      end: new Date(2026, 10, 27, 10, 0),
      providerId: 'sp-rita',
      location: '412 West 22nd Street',
      notes: 'Bring a wrench',
      recurrence: 'none',
    };
    const ics = eventIcs(event);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Boiler check');
    expect(ics).toContain('DTSTART:20261127T093000');
    expect(ics).toContain('LOCATION:412 West 22nd Street');
  });
});
