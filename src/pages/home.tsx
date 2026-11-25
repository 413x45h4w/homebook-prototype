import { Link, Navigate, useNavigate } from 'react-router-dom';
import { alex, providerById } from '../data/load';
import { countPhotos, splitPacket, themesFor } from '../lib/packet';
import { useStore } from '../lib/store';
import { formatRange, greeting } from '../lib/time';
import { CATEGORIES, kindLabel } from '../lib/types';

export function HomeSwitch() {
  const { state } = useStore();
  if (state.persona === 'provider') return <Navigate to="/sp" replace />;
  return <CustomerHome />;
}

export function CustomerHome() {
  const { state, setPersona } = useStore();
  const navigate = useNavigate();
  const upcoming = state.visits
    .filter((visit) => visit.clientId === alex.id && visit.status === 'scheduled' && +new Date(visit.end) >= Date.now() - 60 * 60_000)
    .sort((a, b) => +new Date(a.start) - +new Date(b.start))
    .slice(0, 3);
  const dog = splitPacket(state.items, 'dog_walker');
  const themes = themesFor(state.visits, 'sp-maria');
  return (
    <div className="stack-lg">
      <section className="card hero">
        <p className="kicker" style={{ color: '#d7ecdf' }}>
          {greeting()}
        </p>
        <h1 className="page-title">Alex, the house remembers.</h1>
        <p className="lede">
          {alex.address}, {alex.neighborhood}. Instructions you give one cleaner, walker, or teacher stay with the next person who does that job.
        </p>
        <div className="cluster" style={{ marginTop: 14 }}>
          <Link to="/share" className="btn" style={{ background: '#f6f1e7', color: '#1f4d3c' }}>
            Share with new provider
          </Link>
          <Link to="/knowledge/new" className="btn btn-ghost">
            Add a note
          </Link>
        </div>
      </section>
      <section className="grid-2">
        <div className="stack">
          <h2 style={{ margin: 0 }}>Coming up</h2>
          {upcoming.length === 0 ? <p className="muted">Nothing on the calendar. Book Maria, Jordan, or Lena.</p> : null}
          {upcoming.map((visit) => {
            const provider = providerById(visit.spId);
            return (
              <Link key={visit.id} to={`/visits/${visit.id}`} className="card card-link">
                <strong>{formatRange(visit.start, visit.end)}</strong>
                <div className="muted">
                  {provider?.name} · {provider?.service}
                </div>
              </Link>
            );
          })}
          <Link to="/visits" className="btn btn-ghost">
            All visits
          </Link>
        </div>
        <div className="card stack">
          <h2 style={{ margin: 0 }}>The house file</h2>
          <p className="muted" style={{ margin: 0 }}>
            {state.items.length} notes · {countPhotos(state.items)} photos
          </p>
          <div className="cluster">
            {CATEGORIES.filter((category) =>
              ['apartment_access', 'pets', 'laundry', 'kitchen', 'plants', 'piano'].includes(category.id),
            ).map((category) => (
              <Link key={category.id} to={`/knowledge?category=${category.id}`} className={`chip cat-${category.id}`}>
                {category.label}
              </Link>
            ))}
          </div>
          <Link to="/knowledge" className="btn btn-soft">
            Open the knowledge base
          </Link>
        </div>
      </section>
      <section className="grid-cards">
        <div className="card stack">
          <h2 style={{ margin: 0 }}>What a new dog walker receives</h2>
          <p className="muted">
            {dog.specific.length} dog notes, including ones first written to Sam, plus {dog.universal.length} that every provider gets.
          </p>
          <Link to="/packet/dog_walker" className="btn">
            Open the dog-walker packet
          </Link>
        </div>
        <div className="card stack">
          <h2 style={{ margin: 0 }}>Feedback, in themes</h2>
          <p className="muted" style={{ margin: 0 }}>
            {themes.length
              ? themes
                  .slice(0, 2)
                  .map((theme) => `${theme.theme} · ${theme.count}×`)
                  .join(' · ')
              : 'No themes yet'}{' '}
            from Maria’s visits.
          </p>
          <Link to="/providers/sp-maria" className="btn btn-ghost">
            See Maria’s timeline
          </Link>
        </div>
      </section>
      <section className="card stack">
        <h2 style={{ margin: 0 }}>Try the demo</h2>
        <div className="stack">
          <Link to="/knowledge/kb-laundry">Open the laundry note and read why Jordan never sees it.</Link>
          <Link to="/knowledge/kb-quiet">Open quiet hours — it mentions the vacuum and still goes to everyone.</Link>
          <Link to="/messages/thread-jordan?message=msg-jordan-4">Save the unfiled instruction in Jordan’s thread.</Link>
          <Link to="/book/sp-maria">Book Maria on an open morning.</Link>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => {
              setPersona('provider', 'sp-jordan');
              navigate('/sp');
            }}
          >
            See Jordan’s day on the map
          </button>
        </div>
        <p className="faint" style={{ margin: 0 }}>
          Providers in this apartment: {['sp-maria', 'sp-jordan', 'sp-sam', 'sp-lena'].map((id) => providerById(id)?.name).filter(Boolean).join(', ')}. Switch persona is always in the header. {kindLabel('cleaner')} is Maria.
        </p>
      </section>
    </div>
  );
}
