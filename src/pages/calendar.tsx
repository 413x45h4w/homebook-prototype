import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOverlayStep } from '../lib/useFlowStep';
import { PageHeader, useToast } from '../components/ui';
import {
  addDays,
  addMonths,
  appointmentEvents,
  dateKey,
  eventIcs,
  eventsOnDay,
  monthGrid,
  sameDay,
  startOfMonth,
  startOfWeek,
  visitEvents,
  weekDays,
  type CalendarEvent,
} from '../lib/calendar';
import { useStore } from '../lib/store';
import { formatTime } from '../lib/time';
import type { AppointmentRecurrence } from '../lib/types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarPage({ providerId = '' }: { providerId?: string }) {
  const { state, saveAppointment, deleteAppointment } = useStore();
  const toast = useToast();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [mode, setMode] = useState<'month' | 'week' | 'agenda'>('month');
  const [selected, setSelected] = useState(() => new Date());
  const [editing, setEditing] = useState<null | { id?: string; date: string }>(null);
  useOverlayStep(editing ? 'appointment-form' : null);

  const names = (id: string) => state.providers.find((provider) => provider.id === id)?.name ?? '';
  const rangeStart = mode === 'week' ? startOfWeek(cursor) : startOfMonth(cursor);
  const rangeEnd = mode === 'week' ? addDays(rangeStart, 6) : addDays(addMonths(cursor, 1), -1);
  const events = useMemo(() => {
    const visits = visitEvents(state.visits, names).filter((event) => !providerId || event.providerId === providerId);
    const appointments = appointmentEvents(state.appointments, addDays(rangeStart, -40), addDays(rangeEnd, 40)).filter(
      (event) => !providerId || event.providerId === providerId,
    );
    return [...visits, ...appointments];
  }, [state.visits, state.appointments, state.providers, providerId, rangeStart.getTime(), rangeEnd.getTime()]);

  const openNew = (day: Date) => setEditing({ date: dateKey(day) });
  const openExisting = (event: CalendarEvent) => {
    if (event.kind === 'visit') return;
    const id = event.id.split('::')[0];
    const appointment = state.appointments.find((row) => row.id === id);
    if (!appointment) return;
    setEditing({ id: appointment.id, date: appointment.date });
  };

  const title =
    mode === 'week'
      ? `${rangeStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${rangeEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Calendar"
        title={providerId ? `${names(providerId) || 'Provider'}’s calendar` : 'Apartment calendar'}
        lede="Visits already on the books show up here. Add anything else — a repair, a filter change, a one-off — and download it to your own calendar."
      >
        <div className="cluster">
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setCursor((day) => (mode === 'week' ? addDays(day, -7) : addMonths(day, -1)))}>
            Previous
          </button>
          <button type="button" className="btn btn-small" onClick={() => { const today = new Date(); setCursor(today); setSelected(today); }}>
            Today
          </button>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setCursor((day) => (mode === 'week' ? addDays(day, 7) : addMonths(day, 1)))}>
            Next
          </button>
        </div>
      </PageHeader>
      <div className="cluster">
        {(['month', 'week', 'agenda'] as const).map((item) => (
          <button key={item} type="button" className={`chip-button${mode === item ? ' chip-on' : ''}`} onClick={() => setMode(item)}>
            {item === 'month' ? 'Month' : item === 'week' ? 'Week' : 'Agenda'}
          </button>
        ))}
        <button type="button" className="btn btn-small" onClick={() => openNew(selected)}>
          New event
        </button>
        <strong>{title}</strong>
      </div>
      {mode === 'month' ? (
        <div className="cal-month">
          {WEEKDAYS.map((day) => (
            <div key={day} className="cal-dow">{day}</div>
          ))}
          {monthGrid(cursor).map((day) => {
            const inMonth = day.getMonth() === cursor.getMonth();
            const dayEvents = eventsOnDay(events, day);
            return (
              <button
                type="button"
                key={dateKey(day)}
                className={`cal-day${inMonth ? '' : ' cal-muted'}${sameDay(day, selected) ? ' cal-selected' : ''}`}
                onClick={() => { setSelected(day); }}
              >
                <span>{day.getDate()}</span>
                {dayEvents.slice(0, 3).map((event) => (
                  <em key={event.id} className={event.kind === 'visit' ? 'cal-pill cal-visit' : 'cal-pill'}>{event.title}</em>
                ))}
              </button>
            );
          })}
        </div>
      ) : null}
      {mode === 'week' ? (
        <div className="cal-week">
          {weekDays(cursor).map((day) => (
            <section key={dateKey(day)} className="cal-week-col">
              <button type="button" className="btn btn-small btn-ghost" onClick={() => { setSelected(day); openNew(day); }}>
                {day.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
              </button>
              {eventsOnDay(events, day).map((event) => (
                <EventRow key={event.id} event={event} providerName={names(event.providerId)} onEdit={() => openExisting(event)} />
              ))}
            </section>
          ))}
        </div>
      ) : null}
      {mode === 'agenda' ? (
        <div className="stack">
          {Array.from({ length: 21 }, (_, index) => addDays(selected, index)).map((day) => {
            const dayEvents = eventsOnDay(events, day);
            if (!dayEvents.length) return null;
            return (
              <section key={dateKey(day)} className="stack">
                <h2 style={{ margin: 0, fontSize: 22 }}>{day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
                {dayEvents.map((event) => (
                  <EventRow key={event.id} event={event} providerName={names(event.providerId)} onEdit={() => openExisting(event)} />
                ))}
              </section>
            );
          })}
        </div>
      ) : null}
      <section className="stack">
        <div className="split">
          <h2 style={{ margin: 0, fontSize: 22 }}>{selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
          <button type="button" className="btn btn-small" onClick={() => openNew(selected)}>Add</button>
        </div>
        {eventsOnDay(events, selected).length === 0 ? <p className="empty">Nothing this day.</p> : null}
        {eventsOnDay(events, selected).map((event) => (
          <EventRow key={event.id} event={event} providerName={names(event.providerId)} onEdit={() => openExisting(event)} />
        ))}
      </section>
      {editing ? (
        <AppointmentForm
          id={editing.id}
          date={editing.date}
          providerId={providerId}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            const result = saveAppointment(input);
            if (!result.ok) {
              toast(result.reason);
              return;
            }
            toast(input.id ? 'Event updated' : 'Event added');
            setEditing(null);
            setSelected(new Date(`${input.date}T12:00:00`));
          }}
          onDelete={(id) => {
            deleteAppointment(id);
            toast('Event deleted');
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function EventRow({ event, providerName, onEdit }: { event: CalendarEvent; providerName: string; onEdit: () => void }) {
  const download = () => {
    const blob = new Blob([eventIcs(event)], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${event.title.replace(/\s+/g, '-').toLowerCase()}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <article className="card stack">
      <div className="split">
        <strong>{event.title}</strong>
        <span className="chip">{event.kind === 'visit' ? 'Visit' : event.recurrence && event.recurrence !== 'none' ? event.recurrence : 'Event'}</span>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {formatTime(event.start)}–{formatTime(event.end)}
        {providerName ? ` · ${providerName}` : ''}
        {event.location ? ` · ${event.location}` : ''}
      </p>
      {event.notes ? <p style={{ margin: 0 }}>{event.notes}</p> : null}
      <div className="cluster">
        {event.href ? <Link className="btn btn-small" to={event.href}>Open visit</Link> : <button type="button" className="btn btn-small" onClick={onEdit}>Edit</button>}
        <button type="button" className="btn btn-small btn-ghost" onClick={download}>Add to my calendar</button>
      </div>
    </article>
  );
}

function AppointmentForm({
  id,
  date,
  providerId,
  onClose,
  onSave,
  onDelete,
}: {
  id?: string;
  date: string;
  providerId: string;
  onClose: () => void;
  onSave: (input: {
    id?: string;
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    providerId: string;
    location: string;
    notes: string;
    recurrence: AppointmentRecurrence;
  }) => void;
  onDelete: (id: string) => void;
}) {
  const { state } = useStore();
  const existing = id ? state.appointments.find((row) => row.id === id) : undefined;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [day, setDay] = useState(existing?.date ?? date);
  const [startTime, setStartTime] = useState(existing?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(existing?.endTime ?? '10:00');
  const [person, setPerson] = useState(existing?.providerId ?? providerId);
  const [location, setLocation] = useState(existing?.location ?? '412 West 22nd Street, Apt 4B');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [recurrence, setRecurrence] = useState<AppointmentRecurrence>(existing?.recurrence ?? 'none');
  return (
    <form
      className="card stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ id, title, date: day, startTime, endTime, providerId: person, location, notes, recurrence });
      }}
    >
      <div className="split">
        <h2 style={{ margin: 0 }}>{id ? 'Edit event' : 'New event'}</h2>
        <button type="button" className="btn btn-small btn-ghost" onClick={onClose}>Close</button>
      </div>
      <label className="field">
        <span className="field-label">Title</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Boiler check" />
      </label>
      <label className="field">
        <span className="field-label">Date</span>
        <input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
      </label>
      <div className="cluster">
        <label className="field">
          <span className="field-label">Start</span>
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">End</span>
          <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Provider</span>
        <select value={person} onChange={(event) => setPerson(event.target.value)}>
          <option value="">No provider</option>
          {state.providers.filter((provider) => provider.active).map((provider) => (
            <option key={provider.id} value={provider.id}>{provider.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Location</span>
        <input value={location} onChange={(event) => setLocation(event.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Notes</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Repeats</span>
        <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as AppointmentRecurrence)}>
          <option value="none">Does not repeat</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every two weeks</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>
      <div className="cluster">
        <button className="btn" type="submit">{id ? 'Save event' : 'Add event'}</button>
        {id ? <button type="button" className="btn btn-danger" onClick={() => onDelete(id)}>Delete</button> : null}
      </div>
    </form>
  );
}
