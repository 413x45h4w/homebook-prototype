import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, useToast } from '../components/ui';
import { useStore } from '../lib/store';
import { TRADES, tradeFromKind, type ProviderDraft } from '../lib/providers';
import type { PreferredContact, TradeId } from '../lib/types';

export function ProviderFormPage() {
  const { spId = '' } = useParams();
  const isNew = !spId || spId === 'new';
  const { state, saveProvider } = useStore();
  const existing = isNew ? undefined : state.providers.find((provider) => provider.id === spId);
  const navigate = useNavigate();
  const toast = useToast();
  const [draft, setDraft] = useState<ProviderDraft>(() => ({
    id: existing?.id,
    name: existing?.name ?? '',
    company: existing?.company ?? '',
    trade: existing?.trade ?? (existing ? tradeFromKind(existing.kind) : ''),
    phone: existing?.phone ?? '',
    email: existing?.email ?? '',
    website: existing?.website ?? '',
    serviceArea: existing?.serviceArea ?? '',
    preferredContact: existing?.preferredContact ?? 'phone',
    notes: existing?.notes || existing?.bio || '',
  }));

  if (!isNew && !existing) return <PageHeader title="That provider isn’t in the file" />;

  const set = (patch: Partial<ProviderDraft>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="People"
        title={isNew ? 'Add a provider' : `Edit ${existing?.name}`}
        lede="Name, trade, and how to reach them. The new person shows up in the people list, search, and the calendar."
        back={{ to: isNew ? '/providers' : `/providers/${spId}`, label: isNew ? 'People' : existing?.name ?? 'Provider' }}
      />
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          const result = saveProvider(draft);
          if (!result.ok) {
            toast(result.reason);
            return;
          }
          toast(isNew ? 'Provider added' : 'Provider updated');
          navigate(`/providers/${result.id}`);
        }}
      >
        <label className="field">
          <span className="field-label">Name</span>
          <input value={draft.name} onChange={(event) => set({ name: event.target.value })} required />
        </label>
        <label className="field">
          <span className="field-label">Company</span>
          <input value={draft.company} onChange={(event) => set({ company: event.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Trade</span>
          <select value={draft.trade} onChange={(event) => set({ trade: event.target.value as TradeId | '' })} required>
            <option value="">Choose a trade</option>
            {TRADES.map((trade) => (
              <option key={trade.id} value={trade.id}>{trade.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Phone</span>
          <input value={draft.phone} inputMode="tel" onChange={(event) => set({ phone: event.target.value })} placeholder="917-555-0100" />
        </label>
        <label className="field">
          <span className="field-label">Email</span>
          <input type="email" value={draft.email} onChange={(event) => set({ email: event.target.value })} placeholder="name@company.com" />
        </label>
        <label className="field">
          <span className="field-label">Website</span>
          <input value={draft.website} onChange={(event) => set({ website: event.target.value })} placeholder="company.com" />
        </label>
        <label className="field">
          <span className="field-label">Address or service area</span>
          <input value={draft.serviceArea} onChange={(event) => set({ serviceArea: event.target.value })} placeholder="Chelsea and nearby" />
        </label>
        <label className="field">
          <span className="field-label">Preferred contact</span>
          <select value={draft.preferredContact} onChange={(event) => set({ preferredContact: event.target.value as PreferredContact })}>
            <option value="phone">Phone</option>
            <option value="email">Email</option>
            <option value="text">Text</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Notes</span>
          <textarea value={draft.notes} onChange={(event) => set({ notes: event.target.value })} />
        </label>
        <button className="btn" type="submit">{isNew ? 'Add provider' : 'Save changes'}</button>
      </form>
    </div>
  );
}
