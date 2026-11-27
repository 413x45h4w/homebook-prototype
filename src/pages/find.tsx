import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, highlight } from '../components/ui';
import { providerById } from '../data/load';
import { providerSearchText } from '../lib/providers';
import { notificationsFor, useStore } from '../lib/store';
import { formatDayTime } from '../lib/time';

export function SearchPage() {
  const { state } = useStore();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const needle = q.trim().toLowerCase();
  const items = needle
    ? state.items.filter((item) => `${item.title} ${item.body}`.toLowerCase().includes(needle))
    : [];
  const providers = needle ? state.providers.filter((provider) => providerSearchText(provider).includes(needle)) : [];
  const messages = needle
    ? state.messages.filter((message) => message.body.toLowerCase().includes(needle))
    : [];
  return (
    <div className="stack-lg">
      <PageHeader kicker="Search" title="Notes and conversations" lede="Messages that were filed show a link back to the knowledge base item they created." />
      <form
        className="cluster"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setParams({ q: String(data.get('q') ?? '') });
        }}
      >
        <input name="q" defaultValue={q} aria-label="Search" placeholder="Try harness, espresso, scales" className="inline-input" />
        <button className="btn" type="submit">
          Search
        </button>
      </form>
      {!needle ? <p className="muted">Search the house file and every provider thread.</p> : null}
      {needle ? (
        <>
          <section className="stack">
            <h2 style={{ margin: 0 }}>Providers · {providers.length}</h2>
            {providers.map((provider) => (
              <Link key={provider.id} to={`/providers/${provider.id}`} className="card card-link">
                <strong>{highlight(provider.name, q)}</strong>
                <p className="muted">{highlight(`${provider.company ?? ''} ${provider.phone} ${provider.email ?? ''} ${provider.serviceArea ?? ''}`, q)}</p>
              </Link>
            ))}
          </section>
          <section className="stack">
            <h2 style={{ margin: 0 }}>Knowledge base · {items.length}</h2>
            {items.map((item) => (
              <Link key={item.id} to={`/knowledge/${item.id}`} className="card card-link">
                <strong>{highlight(item.title, q)}</strong>
                <p className="muted">{highlight(item.body.slice(0, 180), q)}</p>
              </Link>
            ))}
          </section>
          <section className="stack">
            <h2 style={{ margin: 0 }}>Messages · {messages.length}</h2>
            {messages.map((message) => {
              const thread = state.threads.find((row) => row.id === message.threadId);
              const provider = thread ? providerById(thread.spId) : undefined;
              const saved = message.savedAsKbItemId ? state.items.find((item) => item.id === message.savedAsKbItemId) : undefined;
              return (
                <div key={message.id} className="card stack">
                  <Link to={`/messages/${message.threadId}?message=${message.id}`}>
                    <strong>{provider?.name ?? 'Conversation'}</strong>
                    <span className="faint"> · {formatDayTime(message.createdAt)}</span>
                  </Link>
                  <p style={{ margin: 0 }}>{highlight(message.body, q)}</p>
                  {saved ? (
                    <Link to={`/knowledge/${saved.id}`} className="chip">
                      Knowledge base · {saved.title}
                    </Link>
                  ) : null}
                </div>
              );
            })}
            {items.length + messages.length + providers.length === 0 ? <p className="empty">Nothing matches “{q}”.</p> : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

export function NotificationsPage() {
  const { state, markNotificationRead, markAllNotificationsRead } = useStore();
  const notes = notificationsFor(state);
  return (
    <div className="stack-lg">
      <PageHeader kicker="Notifications" title="What’s waiting" lede="Bookings, reschedules, packets, and payments show up here. They’re part of the demo, not a real push service.">
        <button type="button" className="btn btn-ghost" onClick={() => markAllNotificationsRead()}>
          Mark all read
        </button>
      </PageHeader>
      <div className="stack">
        {notes.map((note) => (
          <Link
            key={note.id}
            to={note.href}
            className="card card-link"
            onClick={() => markNotificationRead(note.id)}
          >
            <div className="split">
              <strong>{note.title}</strong>
              {!note.read ? <span className="chip">New</span> : null}
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>{note.body}</p>
            <span className="faint">{formatDayTime(note.createdAt)}</span>
          </Link>
        ))}
        {notes.length === 0 ? <p className="empty">Nothing for this persona.</p> : null}
      </div>
    </div>
  );
}
