import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, copyText, useToast } from '../components/ui';
import {
  eventsFor,
  latestBuild,
  loadReviewQueue,
  loadTicketBuilds,
  localTicketsToUpload,
  reviewerStatus,
  submitDecision,
  uploadLocalTickets,
  type RemoteEvent,
  type RemoteTicket,
  type TicketBuild,
} from '../lib/feedbackRemote';
import { COMPARE_WIDTH, QUEUE_SECTIONS, previewScreen, productionScreen, ticketShortId, type ReviewerDecision } from '../lib/ticketPipeline';
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
  const [builds, setBuilds] = useState<TicketBuild[]>([]);
  const [error, setError] = useState('');
  const [flow, setFlow] = useState('all');
  const [type, setType] = useState<'all' | RemoteTicket['type']>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [frame, setFrame] = useState<'desktop' | 'phone'>('desktop');
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
    const built = await loadTicketBuilds();
    if (built.error) setError(`Tickets loaded. Build info is unavailable. ${built.error}`);
    setBuilds(built.builds);
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
    if (flow !== 'all' && ticket.flow !== flow) return false;
    if (type !== 'all' && ticket.type !== type) return false;
    return true;
  });
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

  const decide = async (decision: ReviewerDecision) => {
    if (!selected) return;
    if (decision === 'changes_requested' && !note.trim()) {
      setError('Say what should change.');
      return;
    }
    const message = await submitDecision(selected.id, decision, note);
    if (message) {
      setError(message);
      toast(message);
      return;
    }
    setNote('');
    const labels: Record<ReviewerDecision, string> = {
      approved: 'Queued for work',
      disapproved: 'Ticket disapproved',
      reopened: 'Ticket reopened',
      ship_requested: 'Ship requested. It goes to production after the preview is merged.',
      changes_requested: 'Changes requested',
      discarded: 'Ticket discarded',
    };
    toast(labels[decision]);
    await refresh();
  };

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Owner"
        title="Feedback tickets"
        lede="Approving queues a ticket for a preview build. Ship is the only step that changes the live site."
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
          {QUEUE_SECTIONS.map((section) => {
            const rows = filtered.filter((ticket) => section.statuses.includes(ticket.status));
            return (
              <section key={section.id} className="stack">
                <h2 style={{ margin: 0, fontSize: 22 }}>{section.title} · {rows.length}</h2>
                {rows.length === 0 ? <p className="empty">Nothing in this queue.</p> : null}
                {rows.map((ticket) => (
                  <button type="button" key={ticket.id} className="card" onClick={() => setSelectedId(ticket.id)}>
                    <div className="split">
                      <strong>{ticket.title}</strong>
                      <span className="chip">{ticket.status === 'pending' ? 'Needs decision' : ticket.status.replaceAll('_', ' ')}</span>
                    </div>
                    <p className="muted" style={{ margin: '8px 0 0' }}>
                      {ticket.tester_name ? `${ticket.tester_name} · ` : ''}
                      {ticket.flow} / {ticket.step} · {formatDayTime(ticket.created_at)}
                    </p>
                  </button>
                ))}
              </section>
            );
          })}
          {selected ? (
            <article className="card stack">
              <div className="split">
                <h2 style={{ margin: 0, fontSize: 26 }}>{selected.title}</h2>
                <span className="chip">{selected.status.replaceAll('_', ' ')}</span>
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
              </dl>
              {selected.status === 'preview_ready' ? (
                <PreviewCompare ticket={selected} build={latestBuild(builds, selected.id)} frame={frame} onFrame={setFrame} />
              ) : null}
              <label className="field">
                <span className="field-label">Reviewer note</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={selected.status === 'preview_ready' ? 'Required when you request changes.' : 'Optional. Saved with the decision.'} />
              </label>
              <div className="cluster">
                {selected.status === 'pending' || selected.status === 'reopened' ? (
                  <>
                    <button type="button" className="btn" onClick={() => void decide('approved')}>Approve and queue</button>
                    <button type="button" className="btn btn-danger" onClick={() => void decide('disapproved')}>Disapprove</button>
                  </>
                ) : null}
                {selected.status === 'preview_ready' ? (
                  <>
                    <button type="button" className="btn" onClick={() => void decide('ship_requested')}>Ship to production</button>
                    <button type="button" className="btn btn-ghost" onClick={() => void decide('changes_requested')}>Request changes</button>
                    <button type="button" className="btn btn-danger" onClick={() => void decide('discarded')}>Discard</button>
                  </>
                ) : null}
              </div>
              <h3 style={{ marginBottom: 0 }}>Decision history</h3>
              <p className="faint">Latest state: {selected.status.replaceAll('_', ' ')}</p>
              <ol className="stack">
                <li>created · {formatDayTime(selected.created_at)}</li>
                {history.map((event) => (
                  <li key={event.id}>
                    <strong>{event.decision.replaceAll('_', ' ')}</strong> · {formatDayTime(event.created_at)}
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

function PreviewCompare({
  ticket,
  build,
  frame,
  onFrame,
}: {
  ticket: RemoteTicket;
  build: TicketBuild | null;
  frame: 'desktop' | 'phone';
  onFrame: (frame: 'desktop' | 'phone') => void;
}) {
  const shortId = ticketShortId(ticket.id);
  const width = COMPARE_WIDTH[frame];
  return (
    <div className="stack">
      <div className="cluster">
        <button type="button" className={`chip-button${frame === 'desktop' ? ' chip-on' : ''}`} onClick={() => onFrame('desktop')}>Desktop</button>
        <button type="button" className={`chip-button${frame === 'phone' ? ' chip-on' : ''}`} onClick={() => onFrame('phone')}>iPhone</button>
        {build?.pr_url ? <a className="btn btn-small btn-ghost" href={build.pr_url}>Pull request</a> : <span className="faint">Branch ticket/{shortId}</span>}
      </div>
      {build?.summary ? <p style={{ margin: 0 }}>{build.summary}</p> : <p className="muted">No change summary yet.</p>}
      <div className="compare-grid" style={{ ['--frame-w' as string]: `${width}px` }}>
        <div className="stack">
          <h3 style={{ margin: 0 }}>Production</h3>
          <div className="compare-frame"><iframe title="Production" src={productionScreen(ticket.route)} /></div>
          {build?.before_screenshot_url ? <img className="compare-shot" src={build.before_screenshot_url} alt="Before" /> : null}
        </div>
        <div className="stack">
          <h3 style={{ margin: 0 }}>Preview</h3>
          <div className="compare-frame"><iframe title="Preview" src={build?.preview_url || previewScreen(shortId, ticket.route)} /></div>
          {build?.after_screenshot_url ? <img className="compare-shot" src={build.after_screenshot_url} alt="After" /> : null}
        </div>
      </div>
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
