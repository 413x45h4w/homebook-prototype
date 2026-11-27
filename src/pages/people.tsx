import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ThemeList, VisitSummary } from '../components/blocks';
import { VoiceNoteList } from '../components/VoiceNotes';
import { useOverlayStep } from '../lib/useFlowStep';
import { Avatar, PageHeader, Stars, useToast } from '../components/ui';
import { ALEX_ID, alex, clients, providerById } from '../data/load';
import { mailHref, telHref, tradeFromKind, tradeLabel, websiteHref } from '../lib/providers';
import { googleCalendarUrl } from '../lib/links';
import { averageRating } from '../lib/packet';
import { describeSlot, slotsOnDay } from '../lib/schedule';
import { useStore } from '../lib/store';
import { addMinutes, formatRange, formatTime, money, upcomingDays, withTime } from '../lib/time';
import { kindLabel } from '../lib/types';

export function ProvidersPage() {
  const { state } = useStore();
  return (
    <div className="stack-lg">
      <PageHeader kicker="People" title="Who comes to the apartment" lede="The people who already work here, plus anyone you add.">
        {state.persona === 'customer' ? (
          <Link className="btn" to="/providers/new">Add a provider</Link>
        ) : null}
      </PageHeader>
      {state.providers.map((provider) => {
        const rating = averageRating(state.visits, provider.id);
        const next = state.visits
          .filter((visit) => visit.spId === provider.id && visit.clientId === ALEX_ID && visit.status === 'scheduled')
          .sort((a, b) => +new Date(a.start) - +new Date(b.start))[0];
        return (
          <article key={provider.id} className="card stack">
            <div className="person">
              <Avatar name={provider.name} color={provider.color} large />
              <div>
                <h2 style={{ margin: 0, fontSize: 26 }}>{provider.name}</h2>
                <div className="muted">
                  {provider.company ? `${provider.company} · ` : ''}
                  {tradeLabel(provider.trade ?? tradeFromKind(provider.kind))}
                  {provider.rate ? ` · ${money(provider.rate)}` : ''} · {provider.active ? 'Active' : 'Past provider'}
                </div>
                {rating ? (
                  <div className="cluster">
                    <Stars value={Math.round(rating)} />
                    <span className="faint">{rating.toFixed(1)}</span>
                  </div>
                ) : null}
              </div>
            </div>
            <p style={{ margin: 0 }}>{provider.bio}</p>
            {next ? <div className="muted">Next with Alex: {formatRange(next.start, next.end)}</div> : null}
            <div className="cluster">
              <Link className="btn" to={`/providers/${provider.id}`}>
                Profile and feedback
              </Link>
              {state.threads.some((thread) => thread.spId === provider.id) ? (
                <Link className="btn btn-ghost" to={`/messages/thread-${provider.id.replace('sp-', '')}`}>
                  Message
                </Link>
              ) : null}
              {provider.bookable ? (
                <Link className="btn btn-soft" to={`/book/${provider.id}`}>
                  Book a visit
                </Link>
              ) : (
                <Link className="btn btn-soft" to={`/packet/${provider.kind}`}>
                  See what Sam was given
                </Link>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function ProviderPage() {
  const { spId = '' } = useParams();
  const { state } = useStore();
  const provider = state.providers.find((person) => person.id === spId);
  if (!provider) return <PageHeader title="That provider isn’t in the demo" />;
  const visits = state.visits
    .filter((visit) => visit.spId === provider.id && visit.clientId === ALEX_ID)
    .sort((a, b) => +new Date(b.start) - +new Date(a.start));
  const rating = averageRating(state.visits, provider.id);
  return (
    <div className="stack-lg">
      <PageHeader
        kicker={tradeLabel(provider.trade ?? tradeFromKind(provider.kind))}
        title={provider.name}
        lede={provider.company ? `${provider.company}. ${provider.bio}` : provider.bio}
        back={{ to: '/providers', label: 'People' }}
      />
      <div className="cluster">
        {rating ? <Stars value={Math.round(rating)} /> : null}
        {provider.rate ? <span className="chip">{money(provider.rate)} a visit</span> : null}
        {state.persona === 'customer' ? (
          <Link className="btn btn-small" to={`/providers/${provider.id}/edit`}>Edit</Link>
        ) : null}
        {state.threads.some((thread) => thread.spId === provider.id) ? (
          <Link className="btn btn-small" to={`/messages/thread-${provider.id.replace('sp-', '')}`}>
            Message
          </Link>
        ) : null}
        {provider.bookable ? (
          <Link className="btn btn-small btn-soft" to={`/book/${provider.id}`}>
            Book a visit
          </Link>
        ) : (
          <Link className="btn btn-small btn-soft" to={`/packet/${provider.kind}`}>
            Open the packet Sam helped build
          </Link>
        )}
        <Link className="btn btn-small btn-ghost" to={`/packet/${provider.kind}`}>
          What {provider.name.split(' ')[0]} can see
        </Link>
      </div>
      <section className="card stack">
        <h2 style={{ margin: 0 }}>Contact</h2>
        {provider.preferredContact ? <p className="muted" style={{ margin: 0 }}>Preferred: {provider.preferredContact}</p> : null}
        {provider.phone ? <a className="btn" href={telHref(provider.phone)}>Call {provider.phone}</a> : <p className="muted">No phone yet.</p>}
        {provider.preferredContact === 'text' && provider.phone ? <a className="btn btn-ghost" href={`sms:${provider.phone.replace(/\D/g, '')}`}>Text</a> : null}
        {provider.email ? <a className="btn btn-ghost" href={mailHref(provider.email)}>Email {provider.email}</a> : null}
        {provider.website ? <a className="btn btn-ghost" href={websiteHref(provider.website)} target="_blank" rel="noreferrer">Website</a> : null}
        {provider.serviceArea ? <p style={{ margin: 0 }}>{provider.serviceArea}</p> : null}
        {provider.notes ? <p style={{ margin: 0 }}>{provider.notes}</p> : null}
      </section>
      <section className="card stack">
        <h2 style={{ margin: 0 }}>Feedback themes</h2>
        <ThemeList spId={provider.id} />
      </section>
      <section className="stack">
        <div className="split">
          <h2 style={{ margin: 0 }}>Voice notes</h2>
          <Link className="btn btn-small" to={`/voice/${provider.id}`}>
            Leave a voice note
          </Link>
        </div>
        <p className="muted">Append-only. Each memo keeps the time it was sent.</p>
        <VoiceNoteList notes={state.voiceNotes.filter((note) => note.spId === provider.id)} />
      </section>
      <section className="stack">
        <h2 style={{ margin: 0 }}>Visits with Alex</h2>
        {visits.map((visit) => (
          <VisitSummary key={visit.id} visit={visit} />
        ))}
      </section>
    </div>
  );
}

export function BookPage() {
  const { spId = '' } = useParams();
  const provider = providerById(spId);
  const { state, requestTime } = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const [picked, setPicked] = useState<{ start: string; end: string } | null>(null);
  useOverlayStep(picked ? 'book-confirm' : null);
  const [requestDate, setRequestDate] = useState(() => localDateInput(upcomingDays(2)[1]));
  const [requestTimeValue, setRequestTimeValue] = useState('09:00');
  const [requestNote, setRequestNote] = useState('Could we find a time outside the usual grid?');
  const [bookedId, setBookedId] = useState<string | null>(null);
  if (!provider) return <PageHeader title="That provider isn’t in the demo" />;
  if (!provider.bookable) {
    return (
      <div className="stack">
        <PageHeader title={`${provider.name} isn’t taking visits`} lede={provider.bio} back={{ to: '/providers', label: 'People' }} />
        <div className="cluster">
          <Link className="btn" to={`/packet/${provider.kind}`}>
            Open the {kindLabel(provider.kind).toLowerCase()} packet
          </Link>
          <Link className="btn btn-ghost" to={`/messages/thread-${provider.id.replace('sp-', '')}`}>
            Read the old thread
          </Link>
        </div>
      </div>
    );
  }
  const visits = state.visits.filter((visit) => visit.spId === provider.id);
  const days = upcomingDays(7);
  const booked = bookedId ? state.visits.find((visit) => visit.id === bookedId) : undefined;

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Low touch"
        title={`Book ${provider.name}`}
        lede={`${provider.service} · ${money(provider.rate)} · ${provider.durationMin} minutes at ${alex.address}. Open slots book immediately. A tight slot can be requested in the thread instead.`}
        back={{ to: `/providers/${provider.id}`, label: provider.name }}
      />
      {provider.kind === 'piano_teacher' ? <p className="notice">Lena’s hours in this demo are Thursdays.</p> : null}
      <div className="week">
        {days.map((day) => (
          <section key={day.toISOString()} className="day-col">
            <strong>{day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
            {slotsOnDay(provider, day).length === 0 ? <span className="faint">No hours</span> : null}
            {slotsOnDay(provider, day).map((slot) => {
              const described = describeSlot(visits, clients, { ...slot, clientId: ALEX_ID });
              return (
                <button
                  type="button"
                  key={slot.start}
                  className={`slot slot-${described.state}`}
                  onClick={() => setPicked(slot)}
                >
                  <div>{formatTime(slot.start)}</div>
                  <div className="faint">
                    {described.state === 'open' ? 'Open' : described.state === 'booked' ? 'Taken' : described.state === 'past' ? 'Past' : 'Tight'}
                  </div>
                </button>
              );
            })}
          </section>
        ))}
      </div>
      {picked ? (
        <SlotSheet
          start={picked.start}
          end={picked.end}
          providerId={provider.id}
          onClose={() => setPicked(null)}
          onBooked={(visitId) => {
            setBookedId(visitId);
            setPicked(null);
          }}
        />
      ) : null}
      {booked ? (
        <div className="card stack">
          <h2 style={{ margin: 0 }}>You’re booked</h2>
          <p>{formatRange(booked.start, booked.end)} with {provider.name}.</p>
          <div className="cluster">
            <Link className="btn" to={`/visits/${booked.id}`}>
              Open the visit
            </Link>
            <a
              className="btn btn-ghost"
              target="_blank"
              rel="noreferrer"
              href={googleCalendarUrl({
                title: `${provider.service} with ${provider.name}`,
                start: booked.start,
                end: booked.end,
                details: 'Booked in Homebook.',
                location: `${alex.address}, ${alex.cityLine}`,
              })}
            >
              Add to Google Calendar
            </a>
          </div>
        </div>
      ) : null}
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          const [year, month, date] = requestDate.split('-').map(Number);
          const start = withTime(new Date(year, (month || 1) - 1, date || 1), requestTimeValue);
          const end = addMinutes(start, provider.durationMin);
          const threadId = requestTime({
            spId: provider.id,
            start: start.toISOString(),
            end: end.toISOString(),
            note: requestNote,
          });
          if (!threadId) {
            toast('Could not send that request.');
            return;
          }
          const thread = state.threads.find((row) => row.spId === provider.id);
          toast('Request sent');
          if (thread) navigate(`/messages/${thread.id}?message=${threadId}`);
        }}
      >
        <h2 style={{ margin: 0 }}>Request a different time</h2>
        <p className="muted">High touch: this goes to {provider.name.split(' ')[0]} as a message. They can accept it or propose other times.</p>
        <label className="field">
          <span className="field-label">Date</span>
          <input type="date" value={requestDate} onChange={(event) => setRequestDate(event.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Start</span>
          <input type="time" value={requestTimeValue} onChange={(event) => setRequestTimeValue(event.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Note</span>
          <textarea value={requestNote} onChange={(event) => setRequestNote(event.target.value)} />
        </label>
        <button className="btn" type="submit">
          Send request
        </button>
      </form>
    </div>
  );
}

function localDateInput(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function SlotSheet({
  start,
  end,
  providerId,
  onClose,
  onBooked,
}: {
  start: string;
  end: string;
  providerId: string;
  onClose: () => void;
  onBooked: (visitId: string) => void;
}) {
  const provider = providerById(providerId)!;
  const { state, bookVisit, requestTime } = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const visits = state.visits.filter((visit) => visit.spId === providerId);
  const described = describeSlot(visits, clients, { start, end, clientId: ALEX_ID });
  return (
    <div className="card stack">
      <div className="split">
        <h2 style={{ margin: 0 }}>{formatRange(start, end)}</h2>
        <button type="button" className="btn btn-small btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <p style={{ margin: 0 }}>
        {provider.service} with {provider.name} · {money(provider.rate)} · {alex.address}
      </p>
      {described.state === 'open' ? (
        <button
          type="button"
          className="btn"
          onClick={() => {
            const result = bookVisit({ spId: providerId, start, end });
            if (!result.ok) toast(result.reason);
            else {
              toast('Visit booked');
              onBooked(result.visitId);
            }
          }}
        >
          Confirm booking
        </button>
      ) : (
        <div className="stack">
          <div className={described.state === 'conflict' ? 'notice notice-bad' : 'notice'}>{described.reason}</div>
          {described.state === 'conflict' ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                const messageId = requestTime({
                  spId: providerId,
                  start,
                  end,
                  note: `Could we still do ${formatRange(start, end)}? The grid flagged travel time.`,
                });
                const thread = state.threads.find((row) => row.spId === providerId);
                if (messageId && thread) {
                  toast('Request sent');
                  navigate(`/messages/${thread.id}?message=${messageId}`);
                }
              }}
            >
              Request this time anyway
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
