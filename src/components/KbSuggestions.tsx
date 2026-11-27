import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { providerById } from '../data/load';
import { useStore } from '../lib/store';
import { liveCaptionsAvailable, speechRecognitionCtor } from '../lib/speech';
import { formatDayTime } from '../lib/time';
import { CATEGORIES, categoryMeta, type CategoryId, type KbItem, type KbProposal } from '../lib/types';
import { useToast } from './ui';

export function contributedByLine(item: KbItem): string | null {
  if (!item.contributedBy) return null;
  const name = providerById(item.contributedBy.spId)?.name ?? 'a provider';
  return `Contributed by ${name}`;
}

export function SuggestKbNote({ clientId }: { clientId: string }) {
  const { state, suggestKbNote, reviseKbNote } = useStore();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState<CategoryId>('general');
  const [dictating, setDictating] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const mine = state.kbProposals.filter((proposal) => proposal.spId === state.activeSpId && proposal.clientId === clientId);

  const dictate = () => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    if (dictating) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setDictating(false);
      return;
    }
    const recognition = new Ctor();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    const base = body.trim() ? `${body.trim()} ` : '';
    recognition.onresult = (event) => {
      let spoken = '';
      for (let index = 0; index < event.results.length; index += 1) {
        spoken += event.results[index][0]?.transcript ?? '';
      }
      setBody(`${base}${spoken}`.replace(/\s+/g, ' ').trim());
    };
    recognition.onerror = () => setDictating(false);
    recognition.onend = () => setDictating(false);
    setDictating(true);
    try {
      recognition.start();
    } catch {
      setDictating(false);
    }
  };

  return (
    <section className="stack">
      <h2 style={{ margin: 0 }}>Suggest a knowledge-base note</h2>
      <p className="muted" style={{ margin: 0 }}>
        Alex reviews this before it is published. It does not appear in the household file until then.
      </p>
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          const result = suggestKbNote({ title, body, category, topic });
          if (!result.ok) {
            toast(result.reason);
            return;
          }
          toast('Sent to Alex for review');
          setTitle('');
          setBody('');
          setTopic('');
        }}
      >
        <label className="field">
          <span className="field-label">Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Backflush the espresso machine" />
        </label>
        <label className="field">
          <span className="field-label">Which task, room, or topic</span>
          <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Kitchen espresso" />
        </label>
        <label className="field">
          <span className="field-label">Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as CategoryId)}>
            {CATEGORIES.map((row) => (
              <option key={row.id} value={row.id}>{row.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Note</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="What you want the next person to know." />
        </label>
        {liveCaptionsAvailable() ? (
          <button type="button" className="btn btn-small btn-ghost" onClick={dictate}>
            {dictating ? 'Listening…' : 'Dictate'}
          </button>
        ) : null}
        <button className="btn" type="submit">Send to Alex</button>
      </form>
      {mine.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} mode="provider" onRevise={(input) => {
          const result = reviseKbNote(proposal.id, input);
          toast(result.ok ? 'Update sent to Alex' : result.reason);
          return result.ok;
        }} />
      ))}
    </section>
  );
}

const STATUS_LABEL: Record<KbProposal['status'], string> = {
  pending: 'Pending review',
  changes_requested: 'Changes requested',
  declined: 'Declined',
  approved: 'Published',
};

export function ProposalCard({
  proposal,
  mode,
  onRevise,
}: {
  proposal: KbProposal;
  mode: 'provider' | 'homeowner';
  onRevise?: (input: { title: string; body: string; category: CategoryId; topic: string }) => boolean;
}) {
  const { decideKbNote } = useStore();
  const toast = useToast();
  const provider = providerById(proposal.spId);
  const [title, setTitle] = useState(proposal.title);
  const [body, setBody] = useState(proposal.body);
  const [topic, setTopic] = useState(proposal.topic);
  const [category, setCategory] = useState<CategoryId>(proposal.category);
  const [note, setNote] = useState('');
  const canEdit = mode === 'homeowner' && proposal.status === 'pending';
  const canRevise = mode === 'provider' && (proposal.status === 'pending' || proposal.status === 'changes_requested');

  const decide = (action: 'approved' | 'changes_requested' | 'declined') => {
    const result = decideKbNote(proposal.id, action, { title, body, category, topic, note });
    if (!result.ok) {
      toast(result.reason);
      return;
    }
    if (action === 'approved') toast('Published to the knowledge base');
    else if (action === 'changes_requested') toast('Asked for changes');
    else toast('Declined');
    setNote('');
  };

  return (
    <article className="card stack">
      <div className="split">
        <strong>{proposal.title}</strong>
        <span className="chip">{STATUS_LABEL[proposal.status]}</span>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {provider?.name ?? 'Provider'} · {proposal.topic} · {categoryMeta(proposal.category).label}
      </p>
      {canEdit ? (
        <div className="stack">
          <label className="field">
            <span className="field-label">Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Which task, room, or topic</span>
            <input value={topic} onChange={(event) => setTopic(event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value as CategoryId)}>
              {CATEGORIES.map((row) => (
                <option key={row.id} value={row.id}>{row.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Note</span>
            <textarea value={body} onChange={(event) => setBody(event.target.value)} />
          </label>
        </div>
      ) : (
        <p style={{ margin: 0 }}>{proposal.body}</p>
      )}
      {proposal.status === 'approved' && proposal.publishedItemId ? (
        <p className="muted" style={{ margin: 0 }}>
          Contributed by {provider?.name ?? 'a provider'}. <Link to={`/knowledge/${proposal.publishedItemId}`}>Open the published note</Link>
        </p>
      ) : null}
      {canEdit ? (
        <>
          <label className="field">
            <span className="field-label">Note to the provider, if you want</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Required when you request changes." />
          </label>
          <div className="cluster">
            <button type="button" className="btn" onClick={() => decide('approved')}>Approve</button>
            <button type="button" className="btn btn-ghost" onClick={() => decide('changes_requested')}>Request changes</button>
            <button type="button" className="btn btn-danger" onClick={() => decide('declined')}>Decline</button>
          </div>
        </>
      ) : null}
      {canRevise && onRevise ? (
        <ReviseForm
          initial={{ title: proposal.title, body: proposal.body, category: proposal.category, topic: proposal.topic }}
          onRevise={onRevise}
        />
      ) : null}
      <h3 style={{ marginBottom: 0 }}>History</h3>
      <ol className="stack">
        {proposal.history.map((event) => (
          <li key={event.id}>
            <strong>{event.action.replace('_', ' ')}</strong> · {event.actor} · {formatDayTime(event.at)}
            {event.note ? ` · ${event.note}` : ''}
          </li>
        ))}
      </ol>
    </article>
  );
}

function ReviseForm({
  initial,
  onRevise,
}: {
  initial: { title: string; body: string; category: CategoryId; topic: string };
  onRevise: (input: { title: string; body: string; category: CategoryId; topic: string }) => boolean;
}) {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [topic, setTopic] = useState(initial.topic);
  const [category, setCategory] = useState<CategoryId>(initial.category);
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        const ok = onRevise({ title, body, category, topic });
        if (ok) {
          setTitle(title.trim());
          setBody(body.trim());
        }
      }}
    >
      <label className="field">
        <span className="field-label">Updated title</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Updated note</span>
        <textarea value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Topic</span>
        <input value={topic} onChange={(event) => setTopic(event.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Category</span>
        <select value={category} onChange={(event) => setCategory(event.target.value as CategoryId)}>
          {CATEGORIES.map((row) => (
            <option key={row.id} value={row.id}>{row.label}</option>
          ))}
        </select>
      </label>
      <button className="btn btn-ghost" type="submit">Send update</button>
    </form>
  );
}
