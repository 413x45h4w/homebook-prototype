import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { KbCard } from '../components/blocks';
import { NotFound, PageHeader, Paragraphs, useToast } from '../components/ui';
import { alex } from '../data/load';
import { asset } from '../lib/links';
import { effective, splitPacket } from '../lib/packet';
import { useStore } from '../lib/store';
import { formatDay } from '../lib/time';
import { CATEGORIES, SP_KINDS, audienceLabel, categoryMeta, kindMeta, type SpKind } from '../lib/types';

function isKind(value: string | null): value is SpKind {
  return SP_KINDS.some((kind) => kind.id === value);
}

export function PacketPage() {
  const { kind: raw } = useParams();
  const { state } = useStore();
  if (!raw || !isKind(raw)) return <NotFound />;
  const meta = kindMeta(raw);
  const packet = splitPacket(state.items, raw);
  const prior = state.sentPackets.filter((row) => row.kind === raw);
  const currentIds = new Set([...packet.specific, ...packet.universal].map((item) => item.id));
  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Handoff"
        title={`What a ${meta.label.toLowerCase()} receives`}
        lede={`This is the packet for any new ${meta.label.toLowerCase()}. It gathers every note Alex has given that kind of work, including notes first written to someone else, plus anything the whole household shares.`}
      >
        <Link to={`/share?kind=${raw}`} className="btn">
          Share with new provider
        </Link>
      </PageHeader>
      {prior.map((sent) => {
        const added = [...currentIds].filter((id) => !sent.itemIds.includes(id));
        const titles = added
          .map((id) => state.items.find((item) => item.id === id)?.title)
          .filter(Boolean);
        return (
          <div className="notice" key={sent.id}>
            <strong>{sent.recipientName}</strong> was sent an earlier packet on {formatDay(sent.createdAt)}.
            {titles.length ? ` Added since: ${titles.join(', ')}. A new ${meta.label.toLowerCase()} gets those too.` : ' Nothing new has been added since.'}
          </div>
        );
      })}
      <section className="stack">
        <h2 style={{ margin: 0 }}>
          For {meta.plural} · {packet.specific.length}
        </h2>
        {packet.specific.length ? packet.specific.map((item) => <KbCard key={item.id} item={item} />) : <p className="empty">Nothing is tagged only for {meta.plural}.</p>}
      </section>
      <section className="stack">
        <h2 style={{ margin: 0 }}>For every provider · {packet.universal.length}</h2>
        <p className="muted">Door, Wi-Fi, emergencies, and house rules. These ride along with every handoff.</p>
        {packet.universal.map((item) => (
          <KbCard key={item.id} item={item} />
        ))}
      </section>
    </div>
  );
}

export function SharePage() {
  const { state, sendPacket } = useStore();
  const [params] = useSearchParams();
  const initial = isKind(params.get('kind')) ? (params.get('kind') as SpKind) : 'dog_walker';
  const [kind, setKind] = useState<SpKind>(initial);
  const [name, setName] = useState('Casey Nguyen');
  const [note, setNote] = useState('Starting next week. Miso pulls toward the river.');
  const [sentId, setSentId] = useState<string | null>(null);
  const toast = useToast();
  const packet = splitPacket(state.items, kind);
  const items = [...packet.specific, ...packet.universal];
  const sent = state.sentPackets.find((row) => row.id === sentId);

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Portability"
        title="Share with new provider"
        lede="Pick the kind of work. Homebook builds the handoff from every relevant note and photo, then “sends” it inside this demo."
      />
      <div className="cluster">
        {SP_KINDS.map((row) => (
          <button key={row.id} type="button" className={`chip-button${kind === row.id ? ' chip-on' : ''}`} onClick={() => setKind(row.id)}>
            {row.label}
          </button>
        ))}
      </div>
      <section className="card stack">
        <h2 style={{ margin: 0 }}>
          Preview · {items.length} notes
        </h2>
        <p className="muted">
          {packet.specific.length} for {kindMeta(kind).plural}, {packet.universal.length} for everyone.
        </p>
        {items.map((item) => (
          <div key={item.id}>
            <strong>{item.title}</strong>
            <div className="faint">{categoryMeta(item.category).label}</div>
          </div>
        ))}
      </section>
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) {
            toast('Name the new provider first.');
            return;
          }
          const id = sendPacket({ kind, recipientName: name, note, itemIds: items.map((item) => item.id) });
          setSentId(id);
          toast(`Packet sent to ${name.trim()}`);
        }}
      >
        <label className="field">
          <span className="field-label">New provider</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Note to include</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <button className="btn" type="submit">
          Send packet
        </button>
      </form>
      {sent ? (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Sent to {sent.recipientName}</h2>
          <p>
            {kindMeta(sent.kind).label} · {sent.itemIds.length} notes · {formatDay(sent.createdAt)}
          </p>
          <p className="muted">{sent.note || 'No extra note.'}</p>
          <Link to={`/packet/${sent.kind}`} className="btn btn-ghost">
            View the live packet
          </Link>
        </section>
      ) : null}
      <section className="stack">
        <h2 style={{ margin: 0 }}>Already shared</h2>
        {state.sentPackets.map((row) => (
          <div className="card" key={row.id}>
            <strong>{row.recipientName}</strong>
            <div className="muted">
              {kindMeta(row.kind).label} · {row.itemIds.length} notes · {formatDay(row.createdAt)}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export function ExportPage() {
  const { state } = useStore();
  const payload = useMemo(
    () => ({
      exportedAt: new Date().toISOString(),
      household: {
        name: alex.name,
        address: `${alex.address}, ${alex.cityLine}`,
      },
      items: state.items.map((item) => {
        const info = effective(item);
        return {
          id: item.id,
          title: item.title,
          body: item.body,
          category: item.category,
          audience: info.audience,
          why: info.why,
          images: item.images,
          createdAt: item.createdAt,
        };
      }),
    }),
    [state.items],
  );

  const download = () => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'homebook-alex.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Export"
        title="Take the house file with you"
        lede="Download the knowledge base as JSON, or print this page. Photos that came with the demo are included; photos you added are embedded."
      >
        <button type="button" className="btn no-print" onClick={download}>
          Download JSON
        </button>
        <button type="button" className="btn btn-ghost no-print" onClick={() => window.print()}>
          Print
        </button>
      </PageHeader>
      <article className="sheet stack">
        <p className="muted">
          {alex.name} · {alex.address} · {alex.cityLine}
        </p>
        {CATEGORIES.map((category) => {
          const rows = state.items.filter((item) => item.category === category.id);
          if (!rows.length) return null;
          return (
            <section key={category.id} className="stack">
              <h2>{category.label}</h2>
              {rows.map((item) => {
                const info = effective(item);
                return (
                  <section className="card" key={item.id}>
                    <h3 style={{ marginTop: 0 }}>{item.title}</h3>
                    <p className="faint">{audienceLabel(info.audience)}</p>
                    <Paragraphs text={item.body} />
                    <p className="muted">{info.why}</p>
                    {item.images.map((image) => (
                      <figure key={image.id}>
                        <img src={asset(image.src)} alt={image.caption || item.title} />
                        {image.caption ? <figcaption>{image.caption}</figcaption> : null}
                      </figure>
                    ))}
                  </section>
                );
              })}
            </section>
          );
        })}
      </article>
    </div>
  );
}
