import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { ThreadView } from '../components/blocks';
import { Avatar, PageHeader, usePageTitle } from '../components/ui';
import { providerById } from '../data/load';
import { useStore } from '../lib/store';
import { formatDayTime } from '../lib/time';
import { kindLabel } from '../lib/types';

export function MessagesPage() {
  const { state } = useStore();
  const threads = state.threads.filter((thread) => (state.persona === 'provider' ? thread.spId === state.activeSpId : true));
  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Inbox"
        title={state.persona === 'customer' ? 'Messages' : 'Alex Chen'}
        lede="Every conversation stays searchable, and instructions can be filed into the house notes."
      />
      <div className="stack">
        {threads.map((thread) => {
          const provider = providerById(thread.spId);
          const messages = state.messages
            .filter((message) => message.threadId === thread.id)
            .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
          const last = messages[0];
          if (!provider || !last) return null;
          return (
            <Link key={thread.id} to={`/messages/${thread.id}`} className="card card-link person">
              <Avatar name={provider.name} color={provider.color} />
              <span>
                <strong>
                  {provider.name} · {kindLabel(provider.kind)}
                </strong>
                <span className="muted" style={{ display: 'block' }}>
                  {last.body.slice(0, 90)}
                  {last.body.length > 90 ? '…' : ''}
                </span>
                <span className="faint">{formatDayTime(last.createdAt)}</span>
              </span>
            </Link>
          );
        })}
        {threads.length === 0 ? <p className="empty">No conversations for this persona.</p> : null}
      </div>
    </div>
  );
}

export function ThreadPage() {
  const { threadId = '' } = useParams();
  const [params] = useSearchParams();
  const { state } = useStore();
  const thread = state.threads.find((row) => row.id === threadId);
  const provider = thread ? providerById(thread.spId) : undefined;
  usePageTitle(provider ? provider.name : 'Message');
  useEffect(() => {
    const id = params.get('message');
    if (!id) return;
    document.getElementById(`msg-${id}`)?.scrollIntoView({ block: 'nearest' });
  }, [params, threadId, state.messages.length]);
  return (
    <div className="stack">
      <Link to="/messages" className="kicker">
        ← Inbox
      </Link>
      <ThreadView threadId={threadId} />
    </div>
  );
}
