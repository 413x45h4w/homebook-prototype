import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, copyText, useToast } from '../components/ui';
import { statusFromDecisions } from '../lib/feedbackSync';
import {
  eventsFor,
  loadReviewQueue,
  localTicketsToUpload,
  reviewerStatus,
  submitDecision,
  uploadLocalTickets,
  type RemoteEvent,
  type RemoteTicket,
} from '../lib/feedbackRemote';
import { AUTH_REDIRECT, supabase } from '../lib/supabaseClient';
import { formatDayTime } from '../lib/time';

export function ReviewPage() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [tickets, setTickets] = useState<RemoteTicket[]>([]);
  const [events, setEvents] = useState<RemoteEvent[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'all' | RemoteTicket['status']>('pending');
  const [flow, setFlow] = useState('all');
  const [type, setType] = useState<'all' | RemoteTicket['type']>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [localCount, setLocalCount] = useState(() => localTicketsToUpload().length);

  const refresh = useCallback(async () => {
    const who = await reviewerStatus();
    setSessionEmail(who.email);
    setReviewer(who.reviewer);
    if (who.error && !who.reviewer) setError(who.error);
    if (!who.reviewer) return;
    const queue = await loadReviewQueue();
    if (queue.error) {
      setError(`Could not load tickets. ${queue.error}`);
      return;
    }
    setError('');
    setTickets(queue.tickets);
    setEvents(queue.events);
  }, []);

  useEffect(() => {
    void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 20000);
    return () => {
      data.subscription.unsubscribe();
      window.clearInterval(timer);
    };
  }, [refresh]);

  const flows = useMemo(() => [...new Set(tickets.map((ticket) => ticket.flow))].sort(), [tickets]);
  const filtered = tickets.filter((ticket) => {
    if (status !== 'all' && ticket.status !== status) return false;
    if (flow !== 'all' && ticket.flow !== flow) return false;
    if (type !== 'all' && ticket.type !== type) return false;
    return true;
  });
  const groups = new Map<string, RemoteTicket[]>();
  for (const ticket of filtered) {
    const key = `${ticket.flow} / ${ticket.step}`;
    groups.set(key, [...(groups.get(key) ?? []), ticket]);
  }
  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? null;
  const history = selected ? eventsFor(events, selected.id) : [];
  const pending = tickets.filter((ticket) => ticket.status === 'pending').length;

  const signIn = async () => {
    setAuthMessage('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) setAuthMessage(authError.message);
    else void refresh();
  };

  const signUp = async () => {
    setAuthMessage('');
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: AUTH_REDIRECT },
    });
    if (authError) setAuthMessage(authError.message);
    else {
      setAuthMessage(
        'Check your email to confirm the account. The link opens Homebook. If it does not sign you in, the account is still confirmed — come back here and sign in.',
      );
    }
  };

  const decide = async (decision: 'approved' | 'disapproved') => {
    if (!selected) return;
    const message = await submitDecision(selected.id, decision, note);
    if (message) {
      setError(message);
      toast(message);
      return;
    }
    setNote('');
    toast(decision === 'approved' ? 'Ticket approved' : 'Ticket disapproved');
    await refresh();
  };

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Owner"
        title="Feedback tickets"
        lede="Testers send notes straight here. No export. Approving or disapproving adds a row to the history."
      >
        {reviewer ? <span className="chip">{pending} pending</span> : null}
      </PageHeader>
      {!sessionEmail ? (
        <form
          className="card stack"
          onSubmit={(event) => {
            event.preventDefault();
            void signIn();
          }}
        >
          <h2 style={{ margin: 0 }}>Sign in to review</h2>
          <p className="muted">Testers do not need an account. Only reviewers can read the queue.</p>
          <label className="field">
            <span className="field-label">Email</span>
            <input type="email" value={email} autoComplete="username" onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input type="password" value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <div className="cluster">
            <button className="btn" type="submit">
              Sign in
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => void signUp()}>
              Create account
            </button>
          </div>
          {authMessage ? <p className="notice" role="status">{authMessage}</p> : null}
        </form>
      ) : null}
      {sessionEmail && !reviewer ? (
        <div className="notice notice-warn" role="status">
          Signed in as {sessionEmail}. You don’t have reviewer access.
          <div className="cluster" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => void supabase.auth.signOut()}>
              Sign out
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="notice notice-bad" role="alert">{error}</p> : null}
      {reviewer ? (
        <>
          <div className="cluster">
            <button type="button" className="btn btn-small" onClick={() => void refresh()}>
              Refresh
            </button>
            <span className="faint">Also checks for new notes about every 20 seconds.</span>
            {localCount > 0 ? (
              <button
                type="button"
                className="btn btn-small btn-ghost"
                onClick={async () => {
                  const result = await uploadLocalTickets();
                  setLocalCount(localTicketsToUpload().length);
                  if (result.error) setError(result.error);
                  toast(result.failed ? `Uploaded ${result.uploaded}. ${result.failed} still local.` : `Uploaded ${result.uploaded} local tickets`);
                  await refresh();
                }}
              >
                Upload my local tickets ({localCount})
              </button>
            ) : null}
            <button type="button" className="btn btn-small btn-ghost" onClick={() => void supabase.auth.signOut()}>
              Sign out
            </button>
          </div>
          <div className="cluster">
            <label className="field" style={{ minWidth: 140 }}>
              <span className="field-label">Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
                <option value="pending">Pending review</option>
                <option value="approved">Approved</option>
                <option value="disapproved">Disapproved</option>
                <option value="reopened">Reopened</option>
                <option value="all">All</option>
              </select>
            </label>
            <label className="field" style={{ minWidth: 160 }}>
              <span className="field-label">Flow</span>
              <select value={flow} onChange={(event) => setFlow(event.target.value)}>
                <option value="all">All flows</option>
                {flows.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="field" style={{ minWidth: 140 }}>
              <span className="field-label">Type</span>
              <select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
                <option value="all">All types</option>
                <option value="bug">Bug</option>
                <option value="idea">Idea</option>
                <option value="confusing">Confusing</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <div className="cluster">
            <button type="button" className="btn btn-small btn-ghost" onClick={() => download('homebook-tickets.json', JSON.stringify(filtered, null, 2), 'application/json')}>
              Export JSON
            </button>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => download('homebook-tickets.csv', toCsv(filtered), 'text/csv')}>
              Export CSV
            </button>
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={async () => {
                const approved = tickets.filter((ticket) => ticket.status === 'approved');
                if (!approved.length) {
                  toast('Approve a ticket first.');
                  return;
                }
                const ok = await copyText(approved.map(toMarkdown).join('\n\n'));
                toast(ok ? 'Approved tickets copied as GitHub issues' : 'Could not copy. Export JSON instead.');
              }}
            >
              Copy approved as GitHub issues
            </button>
          </div>
          {groups.size === 0 ? <p className="empty">No tickets in this filter.</p> : null}
          {[...groups.entries()].map(([group, rows]) => (
            <section key={group} className="stack">
              <h2 style={{ margin: 0, fontSize: 22 }}>{group}</h2>
              {rows.map((ticket) => (
                <button type="button" key={ticket.id} className="card" onClick={() => setSelectedId(ticket.id)}>
                  <div className="split">
                    <strong>{ticket.title}</strong>
                    <span className="chip">{ticket.status === 'pending' ? 'Pending review' : ticket.status}</span>
                  </div>
                  <p className="muted" style={{ margin: '8px 0 0' }}>
                    {ticket.tester_name ? `${ticket.tester_name} · ` : ''}
                    {ticket.type}
                    {ticket.severity ? ` · ${ticket.severity}` : ''} · {formatDayTime(ticket.created_at)}
                  </p>
                </button>
              ))}
            </section>
          ))}
          {selected ? (
            <article className="card stack">
              <div className="split">
                <h2 style={{ margin: 0, fontSize: 26 }}>{selected.title}</h2>
                <span className="chip">{selected.status}</span>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setSelectedId(null)}>
                  Close
                </button>
              </div>
              <p style={{ margin: 0 }}>{selected.body}</p>
              <dl className="context-list">
                <div><dt>Flow</dt><dd>{selected.flow} / {selected.step}</dd></div>
                <div><dt>Screen</dt><dd>{selected.screen}</dd></div>
                <div><dt>Route</dt><dd>{selected.route}</dd></div>
                <div><dt>Role</dt><dd>{selected.role}</dd></div>
                <div><dt>From</dt><dd>{selected.tester_name || 'Anonymous'}</dd></div>
                <div><dt>Context</dt><dd>{JSON.stringify(selected.context)}</dd></div>
              </dl>
              <label className="field">
                <span className="field-label">Reviewer note</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional. Saved with the decision." />
              </label>
              <div className="cluster">
                <button type="button" className="btn" onClick={() => void decide('approved')}>Approve</button>
                <button type="button" className="btn btn-danger" onClick={() => void decide('disapproved')}>Disapprove</button>
              </div>
              <h3 style={{ marginBottom: 0 }}>Decision history</h3>
              <p className="faint">Latest decision: {statusFromDecisions(history.map((event) => ({ id: event.id, decision: event.decision, note: event.note, created_at: event.created_at })))}</p>
              <ol className="stack">
                <li>created · {formatDayTime(selected.created_at)}</li>
                {history.map((event) => (
                  <li key={event.id}>
                    <strong>{event.decision}</strong> · {formatDayTime(event.created_at)}
                    {event.reviewer_email ? ` · ${event.reviewer_email}` : ''}
                    {event.note ? ` · ${event.note}` : ''}
                  </li>
                ))}
              </ol>
            </article>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function download(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsv(tickets: RemoteTicket[]): string {
  const header = ['id', 'created_at', 'status', 'type', 'severity', 'flow', 'step', 'tester_name', 'title', 'body'];
  const lines = [header.join(',')];
  for (const ticket of tickets) {
    lines.push([ticket.id, ticket.created_at, ticket.status, ticket.type, ticket.severity ?? '', ticket.flow, ticket.step, ticket.tester_name ?? '', ticket.title, ticket.body].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
}

function toMarkdown(ticket: RemoteTicket): string {
  return [`### ${ticket.title}`, '', ticket.body, '', `- Type: ${ticket.type}`, `- Flow: ${ticket.flow} / ${ticket.step}`, `- Route: ${ticket.route}`, `- From: ${ticket.tester_name || 'Anonymous'}`, `- When: ${ticket.created_at}`].join('\n');
}
