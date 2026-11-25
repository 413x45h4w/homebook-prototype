import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface ToastItem {
  id: string;
  message: string;
  href?: string;
  action?: string;
}

type ToastFn = (message: string, extra?: { href?: string; action?: string }) => void;

const ToastContext = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const push: ToastFn = (message, extra) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((current) => [...current, { id, message, ...extra }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4600);
  };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toasts.map((toast) => (
          <div className="toast" key={toast.id} role="status">
            <span>{toast.message}</span>
            {toast.href && toast.action ? (
              <Link to={toast.href} onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>
                {toast.action}
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Homebook` : 'Homebook';
  }, [title]);
}

export function PageHeader({
  title,
  kicker,
  lede,
  back,
  children,
}: {
  title: string;
  kicker?: string;
  lede?: string;
  back?: { to: string; label: string };
  children?: ReactNode;
}) {
  usePageTitle(title);
  return (
    <header className="page-head">
      <div>
        {back ? (
          <Link to={back.to} className="kicker">
            ← {back.label}
          </Link>
        ) : kicker ? (
          <p className="kicker">{kicker}</p>
        ) : null}
        <h1 className="page-title">{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
      </div>
      {children ? <div className="cluster">{children}</div> : null}
    </header>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.classList.add('modal-open');
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function Stars({ value, onChange, label = 'Rating' }: { value: number; onChange?: (n: number) => void; label?: string }) {
  return (
    <span className="stars" role={onChange ? 'radiogroup' : 'img'} aria-label={onChange ? label : `${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button
            type="button"
            key={n}
            className={n <= value ? 'on' : ''}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => onChange(n)}
          >
            {n <= value ? '★' : '☆'}
          </button>
        ) : (
          <span key={n} className={n <= value ? 'on' : ''}>
            {n <= value ? '★' : '☆'}
          </span>
        ),
      )}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function Paragraphs({ text }: { text: string }) {
  return (
    <div className="prose">
      {text.split(/\n\n+/).map((paragraph) => (
        <p key={paragraph.slice(0, 48)}>{paragraph}</p>
      ))}
    </div>
  );
}

export function Avatar({ name, color, large = false }: { name: string; color: string; large?: boolean }) {
  const letters = name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <span className={large ? 'avatar lg' : 'avatar'} style={{ background: color }} aria-hidden>
      {letters}
    </span>
  );
}

export function NotFound() {
  usePageTitle('Not found');
  return (
    <div className="stack">
      <PageHeader title="That page isn’t in the demo" lede="The house file is still here." />
      <Link to="/" className="btn">
        Back home
      </Link>
    </div>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'));
  return parts.map((part, index) =>
    part.toLowerCase() === q.toLowerCase() ? <mark key={`${part}-${index}`}>{part}</mark> : <span key={`${part}-${index}`}>{part}</span>,
  );
}
