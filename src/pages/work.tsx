import { useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { KbCard, PaymentBox, VisitSummary } from '../components/blocks';
import { DayMap } from '../components/MapView';
import { PageHeader } from '../components/ui';
import { clientById, clients, providerById } from '../data/load';
import { googleMapsDirUrl } from '../lib/links';
import { splitPacket } from '../lib/packet';
import { dayLegs } from '../lib/schedule';
import { useStore } from '../lib/store';
import { addDays, formatRange, formatTime, money, sameDay, startOfDay } from '../lib/time';
import { GOOGLE_DISTANCE_MATRIX, URBAN_KMH } from '../lib/travel';
import { kindLabel } from '../lib/types';

export function SpGate({ children }: { children: ReactNode }) {
  const { state } = useStore();
  if (state.persona !== 'provider') return <Navigate to="/" replace />;
  return children;
}

export function SpToday() {
  const { state } = useStore();
  const provider = providerById(state.activeSpId);
  const [day, setDay] = useState(() => startOfDay(new Date()));
  if (!provider) return <PageHeader title="Pick a provider" />;
  const visits = state.visits
    .filter((visit) => visit.spId === provider.id && visit.status !== 'cancelled' && sameDay(visit.start, day))
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));
  const legs = dayLegs(visits, clients);
  const points = visits.map((visit) => {
    const client = clientById(visit.clientId)!;
    const arrivesTight = legs.some((leg) => leg.toId === visit.id && leg.conflict);
    return {
      id: visit.id,
      lat: client.lat,
      lng: client.lng,
      title: `${client.name} · ${formatTime(visit.start)}`,
      address: `${client.address}, ${client.neighborhood}`,
      conflict: arrivesTight,
    };
  });
  const route = googleMapsDirUrl(points);
  return (
    <div className="stack-lg">
      <PageHeader
        kicker={kindLabel(provider.kind)}
        title={dayLabel(day)}
        lede={`${provider.name} · ${visits.length} stop${visits.length === 1 ? '' : 's'}. Travel time is an estimate, and the day flags a gap that doesn’t fit.`}
      >
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setDay((current) => addDays(current, -1))}>
          Previous day
        </button>
        <button type="button" className="btn btn-small" onClick={() => setDay(startOfDay(new Date()))}>
          Today
        </button>
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setDay((current) => addDays(current, 1))}>
          Next day
        </button>
      </PageHeader>
      {!provider.active ? <div className="notice">Sam is a past provider. This is a historical day, not a live route.</div> : null}
      <div className="day-layout">
        <div className="stack">
          {visits.length === 0 ? <p className="empty">No stops this day. Try another day, or open the week.</p> : null}
          {visits.map((visit, index) => {
            const client = clientById(visit.clientId)!;
            const leg = legs.find((row) => row.toId === visit.id);
            return (
              <div key={visit.id} className="stack">
                {leg ? <div className={leg.conflict ? 'leg leg-bad' : 'leg'}>{leg.summary}</div> : null}
                <Link to={`/visits/${visit.id}`} className="card card-link job">
                  <span className={leg?.conflict ? 'job-num bad' : 'job-num'}>{index + 1}</span>
                  <span>
                    <strong>
                      {formatTime(visit.start)}–{formatTime(visit.end)} · {client.name}
                    </strong>
                    <span className="muted" style={{ display: 'block' }}>
                      {client.address} · {client.neighborhood} · {money(visit.amount)}
                    </span>
                  </span>
                </Link>
              </div>
            );
          })}
          {points.length ? (
            <a className="btn" href={route} target="_blank" rel="noreferrer">
              Open route in Google Maps
            </a>
          ) : null}
        </div>
        <div className="card map-card stack">
          <DayMap points={points} />
          <p className="faint" style={{ margin: 0 }}>
            Map tiles © OpenStreetMap. Travel is not live traffic: straight-line distance × {URBAN_KMH} km/h, plus 5 minutes to get in the
            building. A Google Maps Distance Matrix call ({GOOGLE_DISTANCE_MATRIX.endpoint}, mode {GOOGLE_DISTANCE_MATRIX.mode}) would
            replace `estimateTravel` in src/lib/travel.ts.
          </p>
        </div>
      </div>
    </div>
  );
}

function dayLabel(day: Date) {
  const today = startOfDay(new Date());
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  const pretty = day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (diff === 0) return `Today · ${pretty}`;
  if (diff === 1) return `Tomorrow · ${pretty}`;
  if (diff === -1) return `Yesterday · ${pretty}`;
  return pretty;
}

export function SpSchedule() {
  const { state } = useStore();
  const provider = providerById(state.activeSpId);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(startOfDay(new Date()), index)), []);
  if (!provider) return null;
  return (
    <div className="stack-lg">
      <PageHeader kicker="Week" title={`${provider.name.split(' ')[0]}’s next seven days`} lede="A red edge means the travel buffer between two stops doesn’t fit." />
      <div className="week">
        {days.map((day) => {
          const visits = state.visits
            .filter((visit) => visit.spId === provider.id && visit.status !== 'cancelled' && sameDay(visit.start, day))
            .sort((a, b) => +new Date(a.start) - +new Date(b.start));
          const conflict = dayLegs(visits, clients).some((leg) => leg.conflict);
          return (
            <section key={day.toISOString()} className="day-col" style={conflict ? { borderColor: '#e4b7b0' } : undefined}>
              <strong>{day.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</strong>
              {conflict ? <span className="chip">Travel conflict</span> : null}
              {visits.length === 0 ? <span className="faint">Open</span> : null}
              {visits.map((visit) => {
                const client = clientById(visit.clientId);
                return (
                  <Link key={visit.id} to={`/visits/${visit.id}`} className="slot">
                    <div>{formatTime(visit.start)}</div>
                    <div className="faint">{client?.shortName}</div>
                  </Link>
                );
              })}
            </section>
          );
        })}
      </div>
      <Link to="/visits" className="btn btn-ghost">
        All jobs
      </Link>
    </div>
  );
}

export function SpClients() {
  const { state } = useStore();
  const ids = [...new Set(state.visits.filter((visit) => visit.spId === state.activeSpId).map((visit) => visit.clientId))];
  return (
    <div className="stack-lg">
      <PageHeader kicker="Clients" title="Households on your route" lede="Alex has the full knowledge base. Everyone else has an access note so the map still has somewhere to go." />
      {ids.map((id) => {
        const client = clientById(id);
        if (!client) return null;
        const count = state.visits.filter((visit) => visit.spId === state.activeSpId && visit.clientId === id).length;
        return (
          <Link key={id} to={`/sp/clients/${id}`} className="card card-link">
            <strong>{client.name}</strong>
            <div className="muted">
              {client.neighborhood} · {count} visits in the demo
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export function SpClient() {
  const { clientId = '' } = useParams();
  const { state } = useStore();
  const provider = providerById(state.activeSpId);
  const client = clientById(clientId);
  if (!provider || !client) return <PageHeader title="That client isn’t on this route" />;
  const packet = client.fullKnowledgeBase ? splitPacket(state.items, provider.kind) : null;
  const visits = state.visits
    .filter((visit) => visit.spId === provider.id && visit.clientId === client.id)
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));
  return (
    <div className="stack-lg">
      <PageHeader
        kicker={client.neighborhood}
        title={client.name}
        lede={`${client.address}, ${client.cityLine}`}
        back={{ to: '/sp/clients', label: 'Clients' }}
      />
      <a className="btn" href={googleMapsDirUrl([client])} target="_blank" rel="noreferrer">
        Open in Google Maps
      </a>
      {packet ? (
        <section className="stack">
          <h2 style={{ margin: 0 }}>Packet for this visit</h2>
          <p className="muted">
            {packet.specific.length} {kindLabel(provider.kind).toLowerCase()} notes and {packet.universal.length} for every provider.
          </p>
          {[...packet.specific, ...packet.universal].map((item) => (
            <KbCard key={item.id} item={item} />
          ))}
        </section>
      ) : (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Access note</h2>
          <p>{client.accessNote}</p>
          <p className="muted">A full household file is in the demo for Alex Chen.</p>
        </div>
      )}
      <section className="stack">
        <h2 style={{ margin: 0 }}>Visits</h2>
        {visits.map((visit) => (
          <VisitSummary key={visit.id} visit={visit} />
        ))}
      </section>
    </div>
  );
}

export function SpPayments() {
  const { state } = useStore();
  const provider = providerById(state.activeSpId);
  const visits = state.visits
    .filter((visit) => visit.spId === state.activeSpId && visit.status !== 'cancelled')
    .sort((a, b) => +new Date(b.start) - +new Date(a.start));
  const unpaid = visits.filter((visit) => visit.paymentStatus !== 'paid');
  const paid = visits.filter((visit) => visit.paymentStatus === 'paid');
  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Payments"
        title={provider ? `${provider.name.split(' ')[0]}’s payments` : 'Payments'}
        lede="Request payment opens a Venmo link and shows the Zelle address. Paid and unpaid are tracked only in this browser."
      />
      <section className="stack">
        <h2 style={{ margin: 0 }}>Open</h2>
        {unpaid.map((visit) => (
          <div key={visit.id} className="stack">
            <div className="muted">{formatRange(visit.start, visit.end)} · {clientById(visit.clientId)?.name}</div>
            <PaymentBox visit={visit} />
          </div>
        ))}
        {unpaid.length === 0 ? <p className="empty">Nothing waiting on payment.</p> : null}
      </section>
      <section className="stack">
        <h2 style={{ margin: 0 }}>Paid</h2>
        {paid.map((visit) => (
          <div key={visit.id} className="card split">
            <span>
              {formatRange(visit.start, visit.end)} · {clientById(visit.clientId)?.shortName}
            </span>
            <span>{money(visit.amount)} · Paid</span>
          </div>
        ))}
      </section>
    </div>
  );
}
