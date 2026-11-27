import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { alex, providerById, providers } from '../data/load';
import { notificationsFor, useStore } from '../lib/store';
import type { Persona } from '../lib/types';
import { kindLabel } from '../lib/types';
import { AppFeedback } from './AppFeedback';
import { Avatar, Modal } from './ui';
import { FlowProvider, useOverlayStep } from '../lib/useFlowStep';

const CUSTOMER_NAV = [
  { to: '/', label: 'Home', glyph: '⌂', end: true },
  { to: '/knowledge', label: 'File', glyph: '☰' },
  { to: '/messages', label: 'Inbox', glyph: '✉' },
  { to: '/visits', label: 'Visits', glyph: '▦' },
  { to: '/providers', label: 'People', glyph: '☺' },
];

const PROVIDER_NAV = [
  { to: '/sp', label: 'Today', glyph: '◎', end: true },
  { to: '/sp/schedule', label: 'Week', glyph: '▦' },
  { to: '/messages', label: 'Inbox', glyph: '✉' },
  { to: '/sp/clients', label: 'Clients', glyph: '☺' },
  { to: '/sp/payments', label: 'Pay', glyph: '$' },
];

export function Shell() {
  return (
    <FlowProvider>
      <ShellFrame />
    </FlowProvider>
  );
}

function ShellFrame() {
  const { state, setPersona, reset } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  useOverlayStep(personaOpen ? 'switch-persona' : resetOpen ? 'reset-demo' : null);
  const unread = notificationsFor(state).filter((note) => !note.read).length;
  const provider = providerById(state.activeSpId);
  const nav = state.persona === 'provider' ? PROVIDER_NAV : CUSTOMER_NAV;
  const home = state.persona === 'provider' ? '/sp' : '/';

  const choose = (persona: Persona, spId?: string) => {
    setPersona(persona, spId);
    setPersonaOpen(false);
    navigate(persona === 'provider' ? '/sp' : '/');
  };

  return (
    <div className={state.persona === 'provider' ? 'app app-provider' : 'app app-customer'}>
      <aside className="sidebar">
        <Link to={home} className="brand">
          <Logo />
          <span>
            <span className="brand-name">Homebook</span>
            <span className="brand-sub">
              {state.persona === 'provider' ? provider?.name : `${alex.neighborhood} · Apt 4B`}
            </span>
          </span>
        </Link>
        <nav className="side-scroll" aria-label="Primary">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => sideClass(isActive, item.to, location.pathname, state.persona)}>
              {item.label}
            </NavLink>
          ))}
          {state.persona === 'customer' ? (
            <>
              <div className="side-label">House file</div>
              <NavLink to="/share" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
                Share with new provider
              </NavLink>
              <NavLink to="/export" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
                Export / print
              </NavLink>
              <NavLink to="/packet/dog_walker" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
                Dog walker packet
              </NavLink>
              <NavLink to="/packet/cleaner" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
                Cleaner packet
              </NavLink>
              <NavLink to="/packet/piano_teacher" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
                Piano packet
              </NavLink>
              <NavLink to="/review" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
                App feedback
              </NavLink>
            </>
          ) : (
            <>
              <div className="side-label">Before the job</div>
              <NavLink to="/sp/clients/client-alex" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
                Alex’s packet
              </NavLink>
              <NavLink to="/review" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
                App feedback
              </NavLink>
            </>
          )}
        </nav>
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <Link to={home} className="brand">
            <Logo />
            <span className="brand-name">Homebook</span>
          </Link>
          <form
            className="search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const q = String(data.get('q') ?? '');
              navigate(`/search?q=${encodeURIComponent(q)}`);
            }}
          >
            <input name="q" placeholder="Search notes and messages" aria-label="Search notes and messages" />
          </form>
          <div className="tools">
            <Link to="/notifications" className="icon-btn" aria-label={unread ? `${unread} unread notifications` : 'Notifications'}>
              <span aria-hidden>🔔</span>
              {unread > 0 ? <span className="badge">{unread}</span> : null}
            </Link>
            <button type="button" className="btn btn-small" onClick={() => setPersonaOpen(true)}>
              Switch persona
            </button>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setResetOpen(true)}>
              Reset demo data
            </button>
            <span className="persona-pill">
              {state.persona === 'customer' ? 'Alex · Customer' : `${provider?.name.split(' ')[0]} · ${provider ? kindLabel(provider.kind) : 'Provider'}`}
            </span>
          </div>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Primary">
        {nav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `bn-link${navOn(isActive, item.to, location.pathname, state.persona) ? ' active' : ''}`}>
            <span className="glyph" aria-hidden>
              {item.glyph}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      {personaOpen ? (
        <Modal title="Switch persona" onClose={() => setPersonaOpen(false)}>
          <p className="kicker">Switch persona</p>
          <h2>Who are you viewing as?</h2>
          <div className="stack">
            <button type="button" className="card person" onClick={() => choose('customer')}>
              <Avatar name={alex.name} color="#1f4d3c" />
              <span>
                <strong>{alex.name}</strong>
                <span className="muted" style={{ display: 'block' }}>
                  Customer · {alex.address}
                </span>
              </span>
              {state.persona === 'customer' ? <span className="chip">Current</span> : null}
            </button>
            {providers.map((person) => (
              <button type="button" className="card person" key={person.id} onClick={() => choose('provider', person.id)}>
                <Avatar name={person.name} color={person.color} />
                <span>
                  <strong>{person.name}</strong>
                  <span className="muted" style={{ display: 'block' }}>
                    {kindLabel(person.kind)}
                    {person.active ? '' : ' · past'}
                  </span>
                </span>
                {state.persona === 'provider' && state.activeSpId === person.id ? <span className="chip">Current</span> : null}
              </button>
            ))}
          </div>
        </Modal>
      ) : null}
      {resetOpen ? (
        <Modal title="Reset demo data" onClose={() => setResetOpen(false)}>
          <h2>Reset demo data?</h2>
          <p className="muted">
            This clears notes, messages, bookings, and photos you’ve added in this browser and restores Alex’s apartment. App feedback tickets are kept.
          </p>
          <div className="cluster">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                reset();
                setResetOpen(false);
                navigate('/');
              }}
            >
              Reset demo data
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setResetOpen(false)}>
              Keep my changes
            </button>
          </div>
        </Modal>
      ) : null}
      <AppFeedback />
    </div>
  );
}

function sideClass(isActive: boolean, to: string, path: string, persona: Persona) {
  return `side-link${navOn(isActive, to, path, persona) ? ' active' : ''}`;
}

function navOn(isActive: boolean, to: string, path: string, persona: Persona) {
  if (to === '/visits' && persona === 'customer') return path.startsWith('/visits');
  if (to === '/sp' && persona === 'provider') return path === '/sp' || path.startsWith('/visits');
  if (to === '/sp/schedule' && persona === 'provider') return path.startsWith('/sp/schedule');
  if (to === '/providers') return path.startsWith('/providers') || path.startsWith('/book');
  if (to === '/knowledge') return path.startsWith('/knowledge') || path.startsWith('/packet');
  return isActive;
}

function Logo() {
  return (
    <span className="brand-mark" aria-hidden>
      <svg width="18" height="18" viewBox="0 0 32 32">
        <path d="M4 14.5 16 5l12 9.5V27H4Z" fill="currentColor" />
      </svg>
    </span>
  );
}
