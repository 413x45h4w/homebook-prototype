import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FeedbackEditor, PaymentBox, ProposalCard, ThemeList, VisitSummary } from '../components/blocks';
import { VoiceFeedbackForm } from '../components/VoiceFeedbackForm';
import { VoiceNoteList } from '../components/VoiceNotes';
import { Field, Modal, PageHeader, useToast } from '../components/ui';
import { ALEX_ID, alex, clientById, providerById } from '../data/load';
import { googleCalendarUrl, googleMapsDirUrl } from '../lib/links';
import { splitPacket } from '../lib/packet';
import { useStore } from '../lib/store';
import { formatRange, money } from '../lib/time';
import { kindLabel } from '../lib/types';
import { KbCard } from '../components/blocks';

export function VisitsPage() {
  const { state } = useStore();
  const visits = state.visits
    .filter((visit) => (state.persona === 'customer' ? visit.clientId === ALEX_ID : visit.spId === state.activeSpId))
    .sort((a, b) => +new Date(b.start) - +new Date(a.start));
  const upcoming = visits.filter((visit) => visit.status === 'scheduled');
  const done = visits.filter((visit) => visit.status !== 'scheduled');
  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Calendar"
        title={state.persona === 'customer' ? 'Visits' : 'All jobs'}
        lede={state.persona === 'customer' ? 'Upcoming work in the apartment, and the notes you left afterward.' : 'Every stop on your demo calendar.'}
      />
      <section className="stack">
        <h2 style={{ margin: 0 }}>Scheduled</h2>
        {upcoming.map((visit) => (
          <VisitSummary key={visit.id} visit={visit} />
        ))}
        {upcoming.length === 0 ? <p className="empty">Nothing scheduled.</p> : null}
      </section>
      <section className="stack">
        <h2 style={{ margin: 0 }}>Past and cancelled</h2>
        {done.map((visit) => (
          <VisitSummary key={visit.id} visit={visit} />
        ))}
      </section>
    </div>
  );
}

export function VisitPage() {
  const { id = '' } = useParams();
  const { state, requestReschedule, cancelVisit, markCompleted } = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const visit = state.visits.find((row) => row.id === id);
  const [note, setNote] = useState('Something came up — can we move this?');
  const [ask, setAsk] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  if (!visit) return <PageHeader title="That visit isn’t on the calendar" />;
  const provider = providerById(visit.spId);
  const client = clientById(visit.clientId);
  if (!provider || !client) return <PageHeader title="That visit isn’t on the calendar" />;
  const thread = state.threads.find((row) => row.spId === visit.spId);
  const proposalMessage = state.messages.find(
    (message) => message.proposal?.visitId === visit.id && message.proposal.status !== 'declined',
  );
  const packet = client.fullKnowledgeBase ? splitPacket(state.items, provider.kind) : null;
  const calendar = googleCalendarUrl({
    title: `${provider.service} · ${client.shortName}`,
    start: visit.start,
    end: visit.end,
    details: `Homebook visit with ${provider.name}.`,
    location: `${client.address}, ${client.cityLine}`,
  });
  const map = googleMapsDirUrl([client]);

  return (
    <div className="stack-lg">
      <PageHeader
        kicker={provider.service}
        title={`${client.shortName} · ${formatRange(visit.start, visit.end)}`}
        lede={`${provider.name} · ${kindLabel(provider.kind)} · ${money(visit.amount)} · ${visit.status}`}
        back={{ to: state.persona === 'provider' ? '/sp' : '/visits', label: state.persona === 'provider' ? 'Today' : 'Visits' }}
      />
      <div className="card stack">
        <div>
          {client.address}, {client.neighborhood}
        </div>
        <div className="cluster">
          <a className="btn" href={calendar} target="_blank" rel="noreferrer">
            Add to Google Calendar
          </a>
          <a className="btn btn-ghost" href={map} target="_blank" rel="noreferrer">
            Open in Google Maps
          </a>
          {thread ? (
            <Link className="btn btn-ghost" to={`/messages/${thread.id}`}>
              Message
            </Link>
          ) : null}
        </div>
        {visit.status === 'scheduled' ? (
          <div className="cluster">
            <button type="button" className="btn btn-soft" onClick={() => markCompleted(visit.id)}>
              Mark completed
            </button>
            {state.persona === 'customer' && visit.clientId === ALEX_ID ? (
              proposalMessage ? (
                <Link className="btn btn-ghost" to={`/messages/${proposalMessage.threadId}?message=${proposalMessage.id}`}>
                  Reschedule in progress
                </Link>
              ) : (
                <button type="button" className="btn btn-ghost" onClick={() => setAsk(true)}>
                  Request reschedule
                </button>
              )
            ) : null}
            <button type="button" className="btn btn-danger" onClick={() => setConfirmCancel(true)}>
              Cancel visit
            </button>
          </div>
        ) : null}
      </div>
      {proposalMessage ? <ProposalCard message={proposalMessage} /> : null}
      <PaymentBox visit={visit} />
      <section className="card stack">
        <h2 style={{ margin: 0 }}>Feedback</h2>
        {visit.status === 'cancelled' ? <p className="muted">Cancelled visits don’t take feedback.</p> : <FeedbackEditor visit={visit} />}
        <VoiceNoteList notes={state.voiceNotes.filter((note) => note.visitId === visit.id)} />
      </section>
      {state.persona === 'customer' && visit.status !== 'cancelled' ? (
        <VoiceFeedbackForm spId={visit.spId} visitId={visit.id} heading="Voice feedback for this visit" />
      ) : null}
      {state.persona === 'customer' ? (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Themes across {provider.name.split(' ')[0]}’s visits</h2>
          <ThemeList spId={provider.id} />
          <Link to={`/providers/${provider.id}`}>Open the full timeline</Link>
        </section>
      ) : null}
      {state.persona === 'provider' ? (
        <section className="stack">
          <h2 style={{ margin: 0 }}>What to know before you arrive</h2>
          {packet ? (
            <>
              <p className="muted">
                {packet.specific.length} notes for {kindLabel(provider.kind).toLowerCase()}s and {packet.universal.length} for every provider.
              </p>
              {[...packet.specific, ...packet.universal].map((item) => (
                <KbCard key={item.id} item={item} />
              ))}
            </>
          ) : (
            <div className="card">
              <p>{client.accessNote}</p>
              <p className="muted">A full household file is in the demo for Alex Chen. Other stops carry this access note.</p>
            </div>
          )}
        </section>
      ) : null}
      {ask ? (
        <Modal title="Request reschedule" onClose={() => setAsk(false)}>
          <h2>Ask {provider.name.split(' ')[0]} for a new time</h2>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              const messageId = requestReschedule(visit.id, note);
              if (!messageId || !thread) {
                toast('That visit can’t be moved.');
                return;
              }
              toast('Reschedule requested');
              navigate(`/messages/${thread.id}?message=${messageId}`);
            }}
          >
            <Field label="Note">
              <textarea value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
            <button className="btn" type="submit">
              Send request
            </button>
          </form>
        </Modal>
      ) : null}
      {confirmCancel ? (
        <Modal title="Cancel visit" onClose={() => setConfirmCancel(false)}>
          <h2>Cancel this visit?</h2>
          <p className="muted">The other person gets a notification. The slot opens up again.</p>
          <div className="cluster">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                cancelVisit(visit.id);
                setConfirmCancel(false);
                toast('Visit cancelled');
              }}
            >
              Cancel visit
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmCancel(false)}>
              Keep it
            </button>
          </div>
        </Modal>
      ) : null}
      {visit.clientId === ALEX_ID && state.persona === 'customer' ? (
        <p className="faint">
          {provider.name} can see the {kindLabel(provider.kind).toLowerCase()} packet for {alex.neighborhood}.{' '}
          <Link to={`/packet/${provider.kind}`}>Preview it</Link>.
        </p>
      ) : null}
    </div>
  );
}
