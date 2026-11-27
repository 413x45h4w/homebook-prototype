import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../lib/store';
import { liveCaptionsAvailable, speechRecognitionCtor } from '../lib/speech';
import { addAppTicket, pendingTicketCount, useAppTickets } from '../lib/ticketStore';
import { createTicket, type FeedbackSeverity, type FeedbackType } from '../lib/tickets';
import { useResolvedFlow } from '../lib/useFlowStep';
import { useToast } from './ui';

const TYPES: { id: FeedbackType; label: string }[] = [
  { id: 'bug', label: 'Bug' },
  { id: 'idea', label: 'Idea' },
  { id: 'confusing', label: 'Confusing' },
  { id: 'other', label: 'Other' },
];

export function AppFeedback() {
  const flow = useResolvedFlow();
  const location = useLocation();
  const { state } = useStore();
  const tickets = useAppTickets();
  const toast = useToast();
  const pending = pendingTicketCount(tickets);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [type, setType] = useState<FeedbackType>('bug');
  const [severity, setSeverity] = useState<FeedbackSeverity | ''>('');
  const [dictating, setDictating] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const textId = useId();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const field = panelRef.current?.querySelector('textarea');
    field?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

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
    const base = text.trim() ? `${text.trim()} ` : '';
    recognition.onresult = (event) => {
      let spoken = '';
      for (let index = 0; index < event.results.length; index += 1) {
        spoken += event.results[index][0]?.transcript ?? '';
      }
      setText(`${base}${spoken}`.replace(/\s+/g, ' ').trim());
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

  const submit = () => {
    const result = createTicket({
      text,
      type,
      severity: severity || undefined,
      context: {
        route: `${location.pathname}${location.search}`,
        flow: flow.flow,
        step: flow.step,
        screen: flow.screen,
        routeFlow: flow.routeFlow,
        routeStep: flow.routeStep,
        routeScreen: flow.routeScreen,
        overlay: flow.overlay,
        role: state.persona,
        activeSpId: state.activeSpId,
        entityIds: flow.entityIds,
        viewport: `${window.innerWidth}×${window.innerHeight}`,
        device: navigator.userAgent,
        appVersion: __APP_VERSION__,
        commit: __APP_COMMIT__,
      },
    });
    if (!result.ok) {
      toast(result.reason);
      return;
    }
    addAppTicket(result.ticket);
    setText('');
    setSeverity('');
    setOpen(false);
    toast('Feedback saved for review');
  };

  return (
    <div className="app-feedback">
      <button
        type="button"
        className="app-feedback-tab"
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Feedback</span>
        {pending > 0 ? <span className="app-feedback-count">{pending}</span> : null}
      </button>
      {open ? (
        <div className="app-feedback-panel" ref={panelRef} role="dialog" aria-labelledby={titleId}>
          <div className="split">
            <h2 id={titleId} style={{ margin: 0, fontSize: 22 }}>
              Feedback for the app
            </h2>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          <p className="faint" style={{ margin: 0 }}>
            About {flow.flow} · {flow.step}
            {flow.screen ? ` · ${flow.screen}` : ''}. This is about Homebook itself, not a cleaner or walker.
          </p>
          <label className="field" htmlFor={textId}>
            <span className="field-label">What should change?</span>
            <textarea id={textId} value={text} onChange={(event) => setText(event.target.value)} placeholder="A bug, a rough step, an idea…" />
          </label>
          {liveCaptionsAvailable() ? (
            <button type="button" className="btn btn-small btn-ghost" onClick={dictate}>
              {dictating ? 'Listening…' : 'Dictate'}
            </button>
          ) : null}
          <fieldset className="type-set">
            <legend className="field-label">Type</legend>
            <div className="cluster">
              {TYPES.map((item) => (
                <label key={item.id} className={`chip-button${type === item.id ? ' chip-on' : ''}`}>
                  <input type="radio" name="app-feedback-type" value={item.id} checked={type === item.id} onChange={() => setType(item.id)} />
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span className="field-label">Severity, if you want</span>
            <select value={severity} onChange={(event) => setSeverity(event.target.value as FeedbackSeverity | '')}>
              <option value="">No severity</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <button type="button" className="btn" onClick={submit}>
            Send feedback
          </button>
          <Link to="/review" className="btn btn-ghost" onClick={() => setOpen(false)}>
            Review tickets{pending ? ` (${pending})` : ''}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
