import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../lib/store';
import { liveCaptionsAvailable, speechRecognitionCtor } from '../lib/speech';
import { feedbackSheetFrame } from '../lib/feedbackSheet';
import { buildTicketInsert } from '../lib/feedbackSync';
import { loadReviewQueue, migrateLocalTickets, readOutbox, readTesterName, retryOutbox, reviewerStatus, submitToSupabase, writeTesterName } from '../lib/feedbackRemote';
import type { FeedbackSeverity, FeedbackType } from '../lib/tickets';
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
  const toast = useToast();
  const [pending, setPending] = useState(0);
  const [queued, setQueued] = useState(() => readOutbox().length);
  const [testerName, setTesterName] = useState(() => readTesterName());
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [type, setType] = useState<FeedbackType>('bug');
  const [severity, setSeverity] = useState<FeedbackSeverity | ''>('');
  const [dictating, setDictating] = useState(false);
  const [sheet, setSheet] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const textId = useId();
  const titleId = useId();

  useEffect(() => {
    writeTesterName(testerName);
  }, [testerName]);

  useEffect(() => {
    let stop = false;
    const sendQueued = async () => {
      const earlier = await migrateLocalTickets();
      if (stop) return;
      if (earlier.sent > 0) {
        const message = `Sent ${earlier.sent} earlier feedback notes`;
        setNotice(message);
        toast(message);
      } else if (earlier.queued > 0) {
        setNotice('Queued, will send');
      }
      const result = await retryOutbox();
      if (stop) return;
      setQueued(result.left);
      if (earlier.sent === 0 && result.sent > 0) setNotice(result.left ? `Sent ${result.sent}. ${result.left} still queued.` : 'Sent');
    };
    void sendQueued();
    const timer = window.setInterval(() => {
      if (readOutbox().length) void sendQueued();
    }, 20000);
    window.addEventListener('online', sendQueued);
    return () => {
      stop = true;
      window.clearInterval(timer);
      window.removeEventListener('online', sendQueued);
    };
  }, []);

  useEffect(() => {
    let stop = false;
    const countPending = async () => {
      const who = await reviewerStatus();
      if (stop || !who.reviewer) {
        if (!stop) setPending(0);
        return;
      }
      const queue = await loadReviewQueue();
      if (!stop && !queue.error) setPending(queue.tickets.filter((ticket) => ticket.status === 'pending').length);
    };
    void countPending();
    const timer = window.setInterval(() => void countPending(), 20000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const vv = window.visualViewport;
      const frame = feedbackSheetFrame({
        width: window.innerWidth,
        visualHeight: vv?.height ?? window.innerHeight,
        visualOffsetTop: vv?.offsetTop ?? 0,
      });
      const useSheet = open && frame.mode === 'sheet';
      setSheet(useSheet);
      if (!useSheet) {
        root.style.removeProperty('--vv-top');
        root.style.removeProperty('--vv-height');
        return;
      }
      root.style.setProperty('--vv-top', `${frame.top}px`);
      root.style.setProperty('--vv-height', `${frame.height}px`);
    };
    apply();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    return () => {
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-height');
    };
  }, [open]);

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

  const submit = async () => {
    const built = buildTicketInsert({
      text,
      type,
      severity: severity || undefined,
      testerName,
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
    if (!built.ok) {
      setNotice(built.reason);
      toast(built.reason);
      return;
    }
    const result = await submitToSupabase(built.row);
    setQueued(readOutbox().length);
    if (result.status === 'sent') {
      setNotice('Sent');
      toast('Sent');
      setText('');
      setSeverity('');
    } else {
      const message = `Queued, will send. ${result.error ?? 'Supabase is unreachable.'}`;
      setNotice(message);
      toast('Queued, will send');
    }
  };

  return (
    <div className={`app-feedback${open ? ' is-open' : ''}${sheet ? ' is-sheet' : ''}`}>
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
          <div className="app-feedback-scroll">
            <p className="faint" style={{ margin: 0 }}>
              About {flow.flow} · {flow.step}
              {flow.screen ? ` · ${flow.screen}` : ''}. This is about Homebook itself, not a cleaner or walker. No account needed.
            </p>
            {notice ? (
              <p className={notice.startsWith('Queued') ? 'notice notice-warn' : 'notice'} role="status">
                {notice.startsWith('Queued') ? notice : notice === 'Sent' ? 'Sent' : notice}
              </p>
            ) : null}
            {queued > 0 ? <p className="faint">Queued, will send · {queued}</p> : null}
            <label className="field">
              <span className="field-label">Your name, if you want</span>
              <input value={testerName} maxLength={100} onChange={(event) => setTesterName(event.target.value)} placeholder="Remembered on this device" />
            </label>
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
            <Link to="/review" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Review tickets{pending ? ` (${pending})` : ''}
            </Link>
          </div>
          <label className="field app-feedback-note" htmlFor={textId}>
            <span className="field-label">What should change?</span>
            <textarea id={textId} value={text} onChange={(event) => setText(event.target.value)} placeholder="A bug, a rough step, an idea…" />
          </label>
          {liveCaptionsAvailable() ? (
            <button type="button" className="btn btn-small btn-ghost" onClick={dictate}>
              {dictating ? 'Listening…' : 'Dictate'}
            </button>
          ) : null}
          <button type="button" className="btn app-feedback-send" onClick={submit}>
            Send feedback
          </button>
        </div>
      ) : null}
    </div>
  );
}
