import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AudienceTags, KbCard, PhotoEditor, RelevanceEditor, itemBody } from '../components/blocks';
import { VoiceFeedbackForm } from '../components/VoiceFeedbackForm';
import { Field, Modal, PageHeader, useToast } from '../components/ui';
import { providerById } from '../data/load';
import { classify } from '../lib/classify';
import { effective } from '../lib/packet';
import { useStore } from '../lib/store';
import { formatDayTime, uid } from '../lib/time';
import { CATEGORIES, SP_KINDS, categoryMeta, type Audience, type CategoryId, type KbItem } from '../lib/types';

export function KnowledgeList() {
  const { state } = useStore();
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const kind = params.get('kind') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const items = useMemo(() => {
    return state.items
      .filter((item) => (category ? item.category === category : true))
      .filter((item) => {
        if (!kind) return true;
        const audience = effective(item).audience;
        if (kind === 'all') return audience.includes('all');
        return audience.includes('all') || audience.includes(kind as Audience);
      })
      .filter((item) => {
        const blob = `${item.title} ${item.body}`.toLowerCase();
        return blob.includes(q.trim().toLowerCase());
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [state.items, category, kind, q]);

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Knowledge base"
        title="Everything the apartment knows"
        lede="Notes are tagged for the kind of provider who needs them. Apartment access stays with everyone. Laundry stays with the cleaner."
      >
        <Link to="/knowledge/new" className="btn">
          Add a note
        </Link>
      </PageHeader>
      <div className="cluster">
        <button type="button" className={`chip-button${category === '' ? ' chip-on' : ''}`} onClick={() => setParams(kind ? { kind } : {})}>
          All rooms
        </button>
        {CATEGORIES.map((row) => (
          <button
            type="button"
            key={row.id}
            className={`chip-button${category === row.id ? ' chip-on' : ''}`}
            onClick={() => setParams({ ...(kind ? { kind } : {}), category: row.id })}
          >
            {row.label}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="field-label">Relevant to</span>
        <select
          value={kind}
          onChange={(event) => {
            const next = new URLSearchParams(params);
            if (event.target.value) next.set('kind', event.target.value);
            else next.delete('kind');
            setParams(next);
          }}
        >
          <option value="">Any note</option>
          <option value="all">All providers only</option>
          {SP_KINDS.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <input
        className="inline-input"
        value={q}
        placeholder="Filter notes"
        aria-label="Filter notes"
        onChange={(event) => setQ(event.target.value)}
      />
      <div className="stack">
        {items.map((item) => (
          <KbCard key={item.id} item={item} />
        ))}
        {items.length === 0 ? <p className="empty">No notes match. Clear a filter or add one.</p> : null}
      </div>
    </div>
  );
}

const blank = (): KbItem => ({
  id: uid('kb'),
  title: '',
  body: '',
  category: 'general',
  audienceMode: 'auto',
  audience: ['all'],
  images: [],
  createdAt: new Date().toISOString(),
});

export function KnowledgeItem() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const { state, saveItem, deleteItem } = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const existing = state.items.find((item) => item.id === id);
  const [draft, setDraft] = useState<KbItem>(() => existing ?? blank());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const readOnly = state.persona === 'provider';

  useEffect(() => {
    if (isNew) setDraft(blank());
    else if (existing) setDraft(existing);
  }, [isNew, existing?.id]);

  if (!isNew && !existing) {
    return <PageHeader title="That note is gone" lede="It may have been deleted in this browser." />;
  }

  const info = effective(draft);
  const live = classify(draft.category, `${draft.title}\n${draft.body}\n${draft.images.map((image) => image.caption).join('\n')}`);

  const persistAudience = (next: { mode: 'auto' | 'override'; audience: Audience[] }) => {
    const updated = { ...draft, audienceMode: next.mode, audience: next.mode === 'auto' ? live.audience : next.audience };
    setDraft(updated);
    if (!isNew) saveItem(updated);
  };

  return (
    <div className="stack-lg">
      <PageHeader
        kicker={categoryMeta(draft.category).label}
        title={isNew ? 'New note' : draft.title || 'Untitled note'}
        back={{ to: '/knowledge', label: 'Knowledge base' }}
      />
      {isNew && !readOnly ? (
        <VoiceFeedbackForm heading="Say it, then send it as feedback" />
      ) : null}
      {readOnly ? (
        <div className="notice">You’re viewing Alex’s note as a provider. Switch persona to Alex to edit it.</div>
      ) : null}
      {readOnly ? (
        <article className="card stack">
          {itemBody(draft)}
          <div className="cluster">
            <AudienceTags audience={info.audience} />
            <span className="chip">{info.mode === 'override' ? 'Tags overridden' : 'Auto-tagged'}</span>
          </div>
          <p className="why-pop" style={{ margin: 0 }}>{info.why}</p>
        </article>
      ) : (
        <form
          className="card stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.title.trim() || !draft.body.trim()) {
              toast('Add a title and a note before saving.');
              return;
            }
            const item = {
              ...draft,
              title: draft.title.trim(),
              body: draft.body.trim(),
              audience: draft.audienceMode === 'auto' ? live.audience : draft.audience,
            };
            saveItem(item);
            toast('Note saved');
            navigate(`/knowledge/${item.id}`);
          }}
        >
          <Field label="Title">
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </Field>
          <Field label="Category">
            <select
              value={draft.category}
              onChange={(event) => setDraft({ ...draft, category: event.target.value as CategoryId })}
            >
              {CATEGORIES.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Note">
            <textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
          </Field>
          <RelevanceEditor
            category={draft.category}
            text={`${draft.title}\n${draft.body}\n${draft.images.map((image) => image.caption).join('\n')}`}
            mode={draft.audienceMode}
            audience={draft.audienceMode === 'auto' ? live.audience : draft.audience}
            onChange={persistAudience}
          />
          <div className="cluster">
            <button className="btn" type="submit">
              Save note
            </button>
            {!isNew ? (
              <button className="btn btn-danger" type="button" onClick={() => setConfirmDelete(true)}>
                Delete note
              </button>
            ) : null}
          </div>
        </form>
      )}
      <section className="stack">
        <h2 style={{ margin: 0 }}>Photos</h2>
        <PhotoEditor
          item={isNew ? draft : (existing ?? draft)}
          locked={readOnly}
          onChange={isNew && !readOnly ? (images) => setDraft((current) => ({ ...current, images })) : undefined}
        />
        {!isNew && !readOnly ? <p className="faint">Annotations save as you type. New photos are kept in this browser.</p> : null}
      </section>
      {draft.source ? (
        <p className="muted">
          Linked to a message with {providerById(draft.source.spId)?.name ?? 'a provider'} ·{' '}
          <Link to={`/messages/${draft.source.threadId}?message=${draft.source.messageId}`}>Open the conversation</Link>
          {' · '}
          {formatDayTime(draft.createdAt)}
        </p>
      ) : (
        <p className="faint">Added {formatDayTime(draft.createdAt)}</p>
      )}
      {confirmDelete ? (
        <Modal title="Delete note" onClose={() => setConfirmDelete(false)}>
          <h2>Delete this note?</h2>
          <p className="muted">You can also restore the whole demo with Reset demo data.</p>
          <div className="cluster">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                deleteItem(draft.id);
                toast('Note deleted');
                navigate('/knowledge');
              }}
            >
              Delete note
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
