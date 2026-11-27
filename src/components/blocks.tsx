import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ALEX_ID, clients, providerById } from '../data/load';
import { classify, guessCategory, titleFromInstruction } from '../lib/classify';
import { fileToStoredImage, previewObjectUrl } from '../lib/images';
import { detectInstruction } from '../lib/instructions';
import { googleCalendarUrl, venmoUrl } from '../lib/links';
import { effective, extractThemes } from '../lib/packet';
import { describeSlot, slotsOnDay } from '../lib/schedule';
import { useStore } from '../lib/store';
import { contributedByLine } from './KbSuggestions';
import { formatRange, money, uid, upcomingDays } from '../lib/time';
import {
  CATEGORIES,
  SP_KINDS,
  THEME_SUGGESTIONS,
  audienceLabel,
  categoryMeta,
  kindLabel,
  type Audience,
  type CategoryId,
  type KbItem,
  type Message,
  type SpKind,
  type Visit,
} from '../lib/types';
import { asset } from '../lib/links';
import { Avatar, Field, Paragraphs, Stars, copyText, useToast } from './ui';

export function AudienceTags({ audience }: { audience: Audience[] }) {
  if (audience.includes('all')) return <span className="chip">All providers</span>;
  return (
    <>
      {audience.map((kind) => (
        <span className="chip" key={kind}>
          {kindLabel(kind)}
        </span>
      ))}
    </>
  );
}

export function WhyBlock({ item, openDefault = false }: { item: KbItem; openDefault?: boolean }) {
  const [open, setOpen] = useState(openDefault);
  const info = effective(item);
  return (
    <div>
      <button type="button" className="chip-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        Why relevant
      </button>
      {open ? (
        <div className="why-pop">
          <div>{info.why}</div>
          <ul className="signals">
            {info.signals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function RelevanceEditor({
  category,
  text,
  mode,
  audience,
  onChange,
}: {
  category: CategoryId;
  text: string;
  mode: 'auto' | 'override';
  audience: Audience[];
  onChange: (next: { mode: 'auto' | 'override'; audience: Audience[] }) => void;
}) {
  const auto = classify(category, text);
  const shown: Audience[] =
    mode === 'auto' || audience.includes('all') || audience.length === 0 ? (mode === 'auto' ? auto.audience : ['all']) : audience;
  const toggleKind = (kind: SpKind) => {
    const current: Audience[] = shown.includes('all') ? [] : shown.filter((item) => item !== 'all');
    const next = current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind];
    onChange({ mode: 'override', audience: next.length ? next : ['all'] });
  };
  return (
    <div className="stack">
      <div className="cluster">
        <span className="faint">Relevant to</span>
        <AudienceTags audience={shown} />
      </div>
      <p className="why-pop" style={{ margin: 0 }}>
        {mode === 'override' ? `You set these tags yourself. The guess was ${audienceLabel(auto.audience)}. ` : ''}
        {auto.why}
      </p>
      <div className="cluster">
        <button
          type="button"
          className={`chip-button${shown.includes('all') ? ' chip-on' : ''}`}
          onClick={() => onChange({ mode: 'override', audience: ['all'] })}
        >
          All providers
        </button>
        {SP_KINDS.map((kind) => (
          <button
            type="button"
            key={kind.id}
            className={`chip-button${shown.includes(kind.id) ? ' chip-on' : ''}`}
            onClick={() => toggleKind(kind.id)}
          >
            {kind.label}
          </button>
        ))}
        {mode === 'override' ? (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => onChange({ mode: 'auto', audience: auto.audience })}>
            Use suggestion
          </button>
        ) : (
          <span className="faint">Guessed from the category and the wording. Tap a tag to override.</span>
        )}
      </div>
    </div>
  );
}

export function KbCard({ item }: { item: KbItem }) {
  const info = effective(item);
  return (
    <article className={`card kb-card cat-${item.category}`}>
      <Link to={`/knowledge/${item.id}`} className="card-link" style={{ display: 'block', boxShadow: 'none', border: 'none', background: 'transparent', padding: 0 }}>
        <div className="split">
          <span className="kicker" style={{ color: 'var(--cat)' }}>
            {categoryMeta(item.category).label}
          </span>
          {item.images[0] ? (
            <img src={asset(item.images[0].src)} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 8 }} />
          ) : null}
        </div>
        <h2 style={{ fontSize: 22, margin: '6px 0' }}>{item.title}</h2>
        {contributedByLine(item) ? <p className="muted" style={{ margin: '0 0 8px' }}>{contributedByLine(item)}</p> : null}
        <p className="muted" style={{ margin: '0 0 10px' }}>
          {item.body.replace(/\s+/g, ' ').slice(0, 140)}
          {item.body.length > 140 ? '…' : ''}
        </p>
      </Link>
      <div className="cluster">
        <AudienceTags audience={info.audience} />
        <WhyBlock item={item} />
      </div>
    </article>
  );
}

export function PacketView({ kind, items }: { kind: SpKind; items: KbItem[] }) {
  const meta = SP_KINDS.find((row) => row.id === kind)!;
  return (
    <div className="stack-lg">
      <section className="stack">
        <h2 style={{ margin: 0 }}>For {meta.plural}</h2>
        <p className="muted" style={{ margin: 0 }}>
          Notes tagged for this kind of work, gathered across every {meta.label.toLowerCase()} Alex has used.
        </p>
        {items.length ? items.map((item) => <KbCard key={item.id} item={item} />) : <p className="empty">No notes are tagged only for {meta.plural}.</p>}
      </section>
    </div>
  );
}

export function PhotoEditor({
  item,
  onChange,
  locked = false,
}: {
  item: KbItem;
  onChange?: (images: KbItem['images']) => void;
  locked?: boolean;
}) {
  const store = useStore();
  const toast = useToast();
  const persisted = !onChange;
  const [busy, setBusy] = useState(false);

  const add = async (file: File | null) => {
    if (!file) return;
    if (item.images.length >= 6) {
      toast('This note holds up to 6 photos in the demo.');
      return;
    }
    const id = uid('img');
    const preview = previewObjectUrl(file);
    const temp = { id, src: preview, caption: '' };
    setBusy(true);
    try {
      if (onChange) onChange([...item.images, temp]);
      else if (!store.addImage(item.id, temp)) {
        URL.revokeObjectURL(preview);
        toast('This note holds up to 6 photos in the demo.');
        return;
      }
      const src = await fileToStoredImage(file);
      if (onChange) onChange([...item.images, { ...temp, src }]);
      else store.setImageSrc(item.id, id, src);
      window.setTimeout(() => URL.revokeObjectURL(preview), 400);
    } catch (error) {
      URL.revokeObjectURL(preview);
      toast(error instanceof Error ? error.message : 'Could not add that photo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="photo-grid">
        {item.images.map((image) => (
          <figure className="photo card" key={image.id} style={{ margin: 0 }}>
            <img src={asset(image.src)} alt={image.caption || item.title} />
            <Field label="Annotation">
              <input
                className="inline-input"
                value={image.caption}
                placeholder="e.g. this is where the vacuum lives"
                readOnly={locked}
                onChange={(event) => {
                  const caption = event.target.value;
                  if (locked) return;
                  if (onChange) onChange(item.images.map((row) => (row.id === image.id ? { ...row, caption } : row)));
                  else store.setCaption(item.id, image.id, caption);
                }}
              />
            </Field>
            {persisted && !locked ? (
              <button type="button" className="btn btn-small btn-soft" onClick={() => toast('Annotation saved')}>
                Save annotation
              </button>
            ) : null}
            {!locked ? (
              <button
                type="button"
                className="btn btn-small btn-ghost"
                onClick={() => {
                  if (onChange) onChange(item.images.filter((row) => row.id !== image.id));
                  else store.removeImage(item.id, image.id);
                }}
              >
                Remove photo
              </button>
            ) : null}
          </figure>
        ))}
      </div>
      {locked ? null : (
        <label className="btn btn-ghost">
          {busy ? 'Adding photo…' : 'Add a photo'}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              void add(file);
              event.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
}

export function PaymentBox({ visit }: { visit: Visit }) {
  const { state, requestPayment, setPaymentStatus } = useStore();
  const toast = useToast();
  const provider = providerById(visit.spId);
  const client = clients.find((row) => row.id === visit.clientId);
  if (!provider || !client) return null;
  const note = `Homebook · ${provider.service} · ${formatRange(visit.start, visit.end)}`;
  const showLinks = state.persona === 'provider' || visit.paymentStatus !== 'unpaid';
  return (
    <section className="card pay-box stack">
      <div className="split">
        <h2 style={{ margin: 0, fontSize: 22 }}>Payment · {money(visit.amount)}</h2>
        <span className="chip">{labelPay(visit.paymentStatus)}</span>
      </div>
      {state.persona === 'provider' ? (
        <div className="cluster">
          <button type="button" className="btn" onClick={() => requestPayment(visit.id)}>
            Request payment
          </button>
          {visit.paymentStatus !== 'paid' ? (
            <button type="button" className="btn btn-soft" onClick={() => setPaymentStatus(visit.id, 'paid')}>
              Mark paid
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setPaymentStatus(visit.id, 'unpaid')}>
              Mark unpaid
            </button>
          )}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          {visit.paymentStatus === 'unpaid'
            ? `${provider.name} hasn’t requested payment yet.`
            : visit.paymentStatus === 'paid'
              ? 'Marked paid in this demo.'
              : `${provider.name} will mark this paid when it lands.`}
        </p>
      )}
      {showLinks && visit.paymentStatus !== 'paid' ? (
        <div className="stack">
          <a className="btn" href={venmoUrl(provider.venmo, visit.amount, note)} target="_blank" rel="noreferrer">
            Pay with Venmo · {provider.venmo}
          </a>
          <div className="cluster">
            <input className="inline-input" readOnly value={provider.zelle} aria-label="Zelle email or phone" />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                const ok = await copyText(`${provider.name} · Zelle ${provider.zelle} · ${money(visit.amount)} · ${note}`);
                toast(ok ? 'Zelle details copied' : 'Select the Zelle address and copy it.');
              }}
            >
              Copy Zelle
            </button>
          </div>
          <p className="faint" style={{ margin: 0 }}>
            Zelle doesn’t have a payment link. The address above is {provider.name}’s Zelle email or phone.
          </p>
        </div>
      ) : null}
      {visit.paymentStatus === 'paid' ? <p className="muted" style={{ margin: 0 }}>Paid · {money(visit.amount)}</p> : null}
    </section>
  );
}

function labelPay(status: Visit['paymentStatus']) {
  if (status === 'paid') return 'Paid';
  if (status === 'requested') return 'Payment requested';
  return 'Unpaid';
}

export function ThemeList({ spId }: { spId: string }) {
  const { state } = useStore();
  const themes = useMemo(() => {
    const map = new Map<string, number>();
    for (const visit of state.visits) {
      if (visit.spId !== spId || !visit.feedback) continue;
      for (const theme of visit.feedback.themes) map.set(theme, (map.get(theme) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [state.visits, spId]);
  if (!themes.length) return <p className="muted">No feedback themes yet.</p>;
  const max = themes[0][1];
  return (
    <div className="stack">
      {themes.map(([theme, count]) => (
        <div key={theme}>
          <div className="theme-top">
            <span>{theme}</span>
            <span>
              {count} {count === 1 ? 'visit' : 'visits'}
            </span>
          </div>
          <div className="bar" aria-hidden>
            <span style={{ width: `${(count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FeedbackEditor({ visit }: { visit: Visit }) {
  const { saveFeedback, state } = useStore();
  const toast = useToast();
  const [rating, setRating] = useState(visit.feedback?.rating ?? 0);
  const [comment, setComment] = useState(visit.feedback?.comment ?? '');
  const [themes, setThemes] = useState<string[]>(visit.feedback?.themes ?? []);
  const [custom, setCustom] = useState('');
  if (state.persona !== 'customer' || visit.clientId !== ALEX_ID) {
    if (!visit.feedback) return <p className="muted">No feedback on this visit yet.</p>;
    return (
      <div className="stack">
        <Stars value={visit.feedback.rating} />
        <p style={{ margin: 0 }}>{visit.feedback.comment}</p>
        <div className="cluster">
          {visit.feedback.themes.map((theme) => (
            <span className="chip" key={theme}>
              {theme}
            </span>
          ))}
        </div>
      </div>
    );
  }
  const toggle = (theme: string) => {
    setThemes((current) => (current.includes(theme) ? current.filter((item) => item !== theme) : [...current, theme]));
  };
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (!rating) {
          toast('Pick a star rating first.');
          return;
        }
        const merged = [...new Set([...themes, ...extractThemes(comment)])];
        saveFeedback(visit.id, { rating, comment: comment.trim(), themes: merged });
        setThemes(merged);
        toast('Feedback saved');
      }}
    >
      <Stars value={rating} onChange={setRating} />
      <Field label="Comment">
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          onBlur={() => setThemes((current) => [...new Set([...current, ...extractThemes(comment)])])}
          placeholder="What should the next visit remember?"
        />
      </Field>
      <div className="cluster">
        {THEME_SUGGESTIONS.map((theme) => (
          <button type="button" key={theme} className={`chip-button${themes.includes(theme) ? ' chip-on' : ''}`} onClick={() => toggle(theme)}>
            {theme}
          </button>
        ))}
      </div>
      <div className="cluster">
        <input
          className="inline-input"
          value={custom}
          placeholder="Add a theme"
          onChange={(event) => setCustom(event.target.value)}
          aria-label="Add a theme"
        />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            const theme = custom.trim();
            if (!theme) return;
            setThemes((current) => (current.includes(theme) ? current : [...current, theme]));
            setCustom('');
          }}
        >
          Add theme
        </button>
      </div>
      <button className="btn" type="submit">
        {visit.feedback ? 'Update feedback' : 'Save feedback'}
      </button>
    </form>
  );
}

export function ProposalCard({ message }: { message: Message }) {
  const { state, acceptSlot, declineProposal, proposeSlots } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const proposal = message.proposal;
  if (!proposal) return null;
  const thread = state.threads.find((row) => row.id === message.threadId);
  const provider = thread ? providerById(thread.spId) : undefined;
  const chosen = proposal.chosen != null ? proposal.slots[proposal.chosen] : undefined;

  if (proposal.status === 'accepted') {
    return (
      <div className="proposal accepted">
        <strong>On the calendar{chosen ? ` · ${formatRange(chosen.start, chosen.end)}` : ''}</strong>
        <div className="cluster">
          {proposal.visitId ? (
            <Link className="btn btn-small" to={`/visits/${proposal.visitId}`}>
              Open the visit
            </Link>
          ) : null}
          {chosen && provider ? (
            <a
              className="btn btn-small btn-ghost"
              href={googleCalendarUrl({
                title: `${provider.service} with ${provider.name}`,
                start: chosen.start,
                end: chosen.end,
                details: 'Booked in Homebook.',
                location: `${clients[0].address}, ${clients[0].cityLine}`,
              })}
              target="_blank"
              rel="noreferrer"
            >
              Add to Google Calendar
            </a>
          ) : null}
        </div>
      </div>
    );
  }
  if (proposal.status === 'declined') {
    return <div className="proposal">Declined. The calendar was left as it was.</div>;
  }

  const visits = state.visits.filter((visit) => visit.spId === thread?.spId);
  const spTurn = state.persona === 'provider' && thread?.spId === state.activeSpId;
  const customerTurn = state.persona === 'customer' && proposal.status === 'proposed';
  const waiting = state.persona === 'customer' && proposal.status === 'pending';

  return (
    <div className="proposal">
      <strong>
        {proposal.kind === 'reschedule' ? 'Reschedule' : 'Booking request'} · {proposal.status === 'pending' ? 'waiting on a reply' : 'times offered'}
      </strong>
      {proposal.slots.length ? (
        <div className="stack">
          {proposal.slots.map((slot, index) => {
            const described = describeSlot(visits, clients, { ...slot, clientId: ALEX_ID }, proposal.visitId);
            const showDecision =
              customerTurn || (spTurn && proposal.status === 'pending' && proposal.kind === 'booking');
            return (
              <div key={`${slot.start}-${index}`} className="card" style={{ padding: 10 }}>
                <div className="split">
                  <span>{formatRange(slot.start, slot.end)}</span>
                  {described.state === 'conflict' || described.state === 'booked' ? <span className="chip">Tight</span> : null}
                </div>
                {described.reason && described.state !== 'open' ? <p className="muted">{described.reason}</p> : null}
                {showDecision && described.state === 'open' ? (
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => {
                      const result = acceptSlot(message.id, index);
                      if (!result.ok) toast(result.reason);
                      else {
                        toast('Time accepted');
                        navigate(`/visits/${result.visitId}`);
                      }
                    }}
                  >
                    Accept {formatRange(slot.start, slot.end)}
                  </button>
                ) : null}
                {showDecision && described.state !== 'open' ? (
                  <p className="muted">This time can’t be accepted. Offer a different one.</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted">No alternate times yet.</p>
      )}
      {waiting ? <p className="muted">Waiting for {provider?.name ?? 'them'} to accept or send other times.</p> : null}
      {spTurn && provider ? <ProposeTimes providerId={provider.id} ignoreVisitId={proposal.visitId} onSend={(slots) => {
        if (proposeSlots(message.id, slots)) toast('Other times sent');
      }} /> : null}
      {spTurn || customerTurn || waiting ? (
        <button type="button" className="btn btn-small btn-ghost" onClick={() => declineProposal(message.id)}>
          Decline
        </button>
      ) : null}
    </div>
  );
}

function ProposeTimes({
  providerId,
  ignoreVisitId,
  onSend,
}: {
  providerId: string;
  ignoreVisitId?: string;
  onSend: (slots: { start: string; end: string }[]) => void;
}) {
  const provider = providerById(providerId);
  const { state } = useStore();
  const [picked, setPicked] = useState<string[]>([]);
  const toast = useToast();
  if (!provider) return null;
  const visits = state.visits.filter((visit) => visit.spId === provider.id);
  const options = upcomingDays(7)
    .flatMap((day) => slotsOnDay(provider, day))
    .filter((slot) => describeSlot(visits, clients, { ...slot, clientId: ALEX_ID }, ignoreVisitId).state === 'open')
    .slice(0, 8);
  if (!options.length) return <p className="muted">No open times in the next week. The day view shows why the calendar is tight.</p>;
  const toggle = (key: string, on: boolean) => {
    setPicked((current) => (on ? current.filter((item) => item !== key) : [...current, key].slice(0, 3)));
  };
  return (
    <div className="stack">
      <span className="field-label">Propose other times</span>
      {options.map((slot) => {
        const key = slot.start;
        const on = picked.includes(key);
        return (
          <label key={key} className="cluster">
            <input
              className="check"
              type="checkbox"
              checked={on}
              onChange={() => toggle(key, on)}
            />
            {formatRange(slot.start, slot.end)}
          </label>
        );
      })}
      <button
        type="button"
        className="btn btn-small"
        onClick={() => {
          const slots = options.filter((slot) => picked.includes(slot.start));
          if (!slots.length) {
            toast('Pick at least one time to send.');
            return;
          }
          onSend(slots);
        }}
      >
        Send these times
      </button>
    </div>
  );
}

export function SaveOffer({ message }: { message: Message }) {
  const { state, saveInstructionFromMessage, dismissOffer } = useStore();
  const toast = useToast();
  const hit = detectInstruction(message.body, { hasProposal: Boolean(message.proposal) });
  const [title, setTitle] = useState(() => titleFromInstruction(message.body));
  const [category, setCategory] = useState<CategoryId>(() => guessCategory(message.body));
  if (state.persona !== 'customer') return null;
  if (message.from !== 'customer' || message.savedAsKbItemId || state.dismissedOffers.includes(message.id) || !hit.match) return null;
  const preview = classify(category, `${title}\n${message.body}`);
  return (
    <form
      className="offer"
      onSubmit={(event) => {
        event.preventDefault();
        const id = saveInstructionFromMessage(message.id, { title, category });
        if (id) toast('Instruction saved to knowledge base', { href: `/knowledge/${id}`, action: 'View' });
      }}
    >
      <strong>Save this instruction?</strong>
      <p className="muted" style={{ margin: 0 }}>
        It looks like an instruction because {hit.reasons.join(' and ')}. It will be tagged {audienceLabel(preview.audience).toLowerCase()}.
      </p>
      <Field label="Title">
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Category">
        <select value={category} onChange={(event) => setCategory(event.target.value as CategoryId)}>
          {CATEGORIES.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="cluster">
        <AudienceTags audience={preview.audience} />
      </div>
      <p className="faint" style={{ margin: 0 }}>{preview.why}</p>
      <div className="cluster">
        <button className="btn btn-small" type="submit">
          Save instruction
        </button>
        <button className="btn btn-small btn-ghost" type="button" onClick={() => dismissOffer(message.id)}>
          Not an instruction
        </button>
      </div>
    </form>
  );
}

export function ThreadView({ threadId }: { threadId: string }) {
  const { state, sendMessage } = useStore();
  const toast = useToast();
  const [text, setText] = useState('');
  const thread = state.threads.find((row) => row.id === threadId);
  const provider = thread ? providerById(thread.spId) : undefined;
  const messages = state.messages
    .filter((message) => message.threadId === threadId)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  if (!thread || !provider) return <p>That conversation isn’t in the demo.</p>;
  if (state.persona === 'provider' && thread.spId !== state.activeSpId) {
    return (
      <div className="notice">
        This thread belongs to {provider.name}. Switch persona to {provider.name.split(' ')[0]} to reply as them.
      </div>
    );
  }
  const hint = state.persona === 'customer' ? detectInstruction(text) : { match: false, reasons: [] as string[] };
  return (
    <div className="stack-lg">
      <div className="person">
        <Avatar name={provider.name} color={provider.color} large />
        <div>
          <h1 className="page-title" style={{ fontSize: 32 }}>{provider.name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {kindLabel(provider.kind)} · {provider.active ? 'Active' : 'Past provider'}
          </p>
        </div>
      </div>
      <div className="stack">
        {messages.map((message) => {
          const mine = message.from === state.persona || (state.persona === 'provider' && message.from === 'provider');
          const saved = message.savedAsKbItemId ? state.items.find((item) => item.id === message.savedAsKbItemId) : undefined;
          return (
            <div key={message.id} id={`msg-${message.id}`} className="stack">
              <div className={`bubble ${mine ? 'mine' : ''}`}>
                {message.body}
                <span className="meta">{message.from === 'customer' ? 'Alex' : provider.name.split(' ')[0]}</span>
              </div>
              {saved ? (
                <Link to={`/knowledge/${saved.id}`} className="chip">
                  Knowledge base · {saved.title}
                </Link>
              ) : null}
              <ProposalCard message={message} />
              <SaveOffer message={message} />
            </div>
          );
        })}
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          const id = sendMessage(threadId, text);
          if (!id) return;
          setText('');
          toast('Message sent');
        }}
      >
        <Field label={state.persona === 'customer' ? `Message ${provider.name.split(' ')[0]}` : 'Reply to Alex'}>
          <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Write a message" />
        </Field>
        {hint.match ? (
          <p className="hint">This sounds like an instruction because {hint.reasons.join(' and ')}. You can file it in the house notes after you send.</p>
        ) : null}
        <button className="btn" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}

export function VisitSummary({ visit }: { visit: Visit }) {
  const provider = providerById(visit.spId);
  const client = clients.find((row) => row.id === visit.clientId);
  if (!provider || !client) return null;
  return (
    <Link to={`/visits/${visit.id}`} className="card card-link">
      <div className="split">
        <strong>{formatRange(visit.start, visit.end)}</strong>
        <span className="chip">{visit.status === 'scheduled' ? 'Scheduled' : visit.status === 'completed' ? 'Completed' : 'Cancelled'}</span>
      </div>
      <div className="person" style={{ marginTop: 8 }}>
        <Avatar name={provider.name} color={provider.color} />
        <span>
          {provider.name} · {provider.service}
          <span className="muted" style={{ display: 'block' }}>
            {client.shortName} · {client.neighborhood} · {money(visit.amount)} · {labelPay(visit.paymentStatus)}
          </span>
        </span>
      </div>
    </Link>
  );
}

export function itemBody(item: KbItem) {
  return <Paragraphs text={item.body} />;
}
