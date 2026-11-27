import { useMemo, useState } from 'react';
import { PageHeader, copyText, useToast } from '../components/ui';
import { pendingTicketCount, reviewAppTicket, useAppTickets } from '../lib/ticketStore';
import { formatDayTime } from '../lib/time';
import { ticketToGithubMarkdown, ticketsToCsv, type AppTicket, type FeedbackType, type TicketStatus } from '../lib/tickets';

export function ReviewPage() {
  const tickets = useAppTickets();
  const toast = useToast();
  const [status, setStatus] = useState<TicketStatus | 'all'>('pending');
  const [flow, setFlow] = useState('all');
  const [type, setType] = useState<FeedbackType | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const pending = pendingTicketCount(tickets);
  const flows = useMemo(() => [...new Set(tickets.map((ticket) => ticket.context.flow))].sort(), [tickets]);
  const filtered = tickets.filter((ticket) => {
    if (status !== 'all' && ticket.status !== status) return false;
    if (flow !== 'all' && ticket.context.flow !== flow) return false;
    if (type !== 'all' && ticket.type !== type) return false;
    return true;
  });
  const groups = new Map<string, AppTicket[]>();
  for (const ticket of [...filtered].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))) {
    const key = `${ticket.context.flow} / ${ticket.context.step}`;
    groups.set(key, [...(groups.get(key) ?? []), ticket]);
  }
  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? null;

  const download = (filename: string, contents: string, mime: string) => {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const decide = (decision: 'approved' | 'disapproved') => {
    if (!selected) return;
    reviewAppTicket(selected.id, decision, note);
    setNote('');
    toast(decision === 'approved' ? 'Ticket approved' : 'Ticket disapproved');
  };

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Owner"
        title="Feedback tickets"
        lede="Notes people leave about Homebook itself. Approving or disapproving adds a history event. The apartment demo is separate, and these tickets stay in this browser."
      >
        <span className="chip">{pending} pending</span>
      </PageHeader>
      <div className="cluster">
        <label className="field" style={{ minWidth: 140 }}>
          <span className="field-label">Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as TicketStatus | 'all')}>
            <option value="pending">Pending review</option>
            <option value="approved">Approved</option>
            <option value="disapproved">Disapproved</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="field" style={{ minWidth: 160 }}>
          <span className="field-label">Flow</span>
          <select value={flow} onChange={(event) => setFlow(event.target.value)}>
            <option value="all">All flows</option>
            {flows.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 140 }}>
          <span className="field-label">Type</span>
          <select value={type} onChange={(event) => setType(event.target.value as FeedbackType | 'all')}>
            <option value="all">All types</option>
            <option value="bug">Bug</option>
            <option value="idea">Idea</option>
            <option value="confusing">Confusing</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <div className="cluster no-print">
        <button type="button" className="btn btn-small btn-ghost" onClick={() => download('homebook-tickets.json', JSON.stringify(filtered, null, 2), 'application/json')}>
          Export JSON
        </button>
        <button type="button" className="btn btn-small btn-ghost" onClick={() => download('homebook-tickets.csv', ticketsToCsv(filtered), 'text/csv')}>
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
            const ok = await copyText(approved.map(ticketToGithubMarkdown).join('\n\n'));
            toast(ok ? 'Approved tickets copied as GitHub issues' : 'Could not copy. Export JSON instead.');
          }}
        >
          Copy approved as GitHub issues
        </button>
      </div>
      {groups.size === 0 ? <p className="empty">No tickets in this filter. The Feedback tab on the edge of every screen files one.</p> : null}
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
                {ticket.type}
                {ticket.severity ? ` · ${ticket.severity}` : ''} · {formatDayTime(ticket.createdAt)}
              </p>
            </button>
          ))}
        </section>
      ))}
      {selected ? (
        <article className="card stack">
          <div className="split">
            <h2 style={{ margin: 0, fontSize: 26 }}>{selected.title}</h2>
            <span className="chip">{selected.status === 'pending' ? 'Pending review' : selected.status}</span>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setSelectedId(null)}>
              Close
            </button>
          </div>
          <p style={{ margin: 0 }}>{selected.description}</p>
          <dl className="context-list">
            <div>
              <dt>Flow</dt>
              <dd>
                {selected.context.flow} / {selected.context.step}
              </dd>
            </div>
            <div>
              <dt>Screen</dt>
              <dd>{selected.context.screen}</dd>
            </div>
            <div>
              <dt>Route</dt>
              <dd>{selected.context.route}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{selected.context.role}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{selected.context.activeSpId || 'None'}</dd>
            </div>
            <div>
              <dt>Entities</dt>
              <dd>{Object.keys(selected.context.entityIds).length ? JSON.stringify(selected.context.entityIds) : 'None'}</dd>
            </div>
            <div>
              <dt>Viewport</dt>
              <dd>{selected.context.viewport}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>
                {selected.context.appVersion} · {selected.context.commit.slice(0, 7)}
              </dd>
            </div>
          </dl>
          <p className="faint">{selected.context.device}</p>
          <label className="field">
            <span className="field-label">Reviewer note</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional. Saved on the decision." />
          </label>
          <div className="cluster">
            <button type="button" className="btn" onClick={() => decide('approved')}>
              Approve
            </button>
            <button type="button" className="btn btn-danger" onClick={() => decide('disapproved')}>
              Disapprove
            </button>
          </div>
          <h3 style={{ marginBottom: 0 }}>Decision history</h3>
          <ol className="stack">
            {selected.history.map((event) => (
              <li key={event.id}>
                <strong>{event.kind}</strong> · {formatDayTime(event.at)}
                {event.note ? ` · ${event.note}` : ''}
              </li>
            ))}
          </ol>
        </article>
      ) : null}
    </div>
  );
}
