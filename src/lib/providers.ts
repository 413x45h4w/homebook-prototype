import type { PreferredContact, Provider, SpKind, TradeId } from './types';

export const TRADES: { id: TradeId; label: string }[] = [
  { id: 'plumber', label: 'Plumber' },
  { id: 'electrician', label: 'Electrician' },
  { id: 'hvac', label: 'HVAC' },
  { id: 'cleaner', label: 'Cleaner' },
  { id: 'handyman', label: 'Handyman' },
  { id: 'other', label: 'Other' },
];

const COLORS = ['#1f4d3c', '#1c3d66', '#b85a2a', '#6b3f69', '#3d5a4c', '#8a5a12'];

export function tradeFromKind(kind: SpKind): TradeId {
  if (kind === 'plumber' || kind === 'electrician' || kind === 'hvac' || kind === 'cleaner' || kind === 'handyman') return kind;
  return 'other';
}

export function kindForTrade(trade: TradeId): SpKind {
  if (trade === 'plumber' || trade === 'electrician' || trade === 'hvac' || trade === 'cleaner' || trade === 'handyman' || trade === 'other') {
    return trade;
  }
  return 'other';
}

export function tradeLabel(trade: TradeId): string {
  return TRADES.find((row) => row.id === trade)?.label ?? 'Other';
}

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function phoneOk(value: string): boolean {
  if (!value.trim()) return true;
  const count = phoneDigits(value).length;
  return count >= 7 && count <= 15;
}

export function emailOk(value: string): boolean {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function websiteHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function telHref(value: string): string {
  const digits = phoneDigits(value);
  return digits ? `tel:${digits}` : '';
}

export function mailHref(value: string): string {
  const email = value.trim();
  return email ? `mailto:${email}` : '';
}

export function normalizeProvider(raw: Provider): Provider {
  const trade = raw.trade ?? tradeFromKind(raw.kind);
  const email = raw.email?.trim() || (raw.zelle?.includes('@') ? raw.zelle : '');
  return {
    ...raw,
    trade,
    kind: raw.kind || kindForTrade(trade),
    company: raw.company?.trim() ?? '',
    email,
    website: raw.website?.trim() ?? '',
    serviceArea: raw.serviceArea?.trim() ?? '',
    preferredContact: raw.preferredContact ?? 'phone',
    notes: raw.notes?.trim() ?? '',
    phone: raw.phone?.trim() ?? '',
  };
}

export interface ProviderDraft {
  id?: string;
  name: string;
  company: string;
  trade: TradeId | '';
  phone: string;
  email: string;
  website: string;
  serviceArea: string;
  preferredContact: PreferredContact;
  notes: string;
}

export function validateProvider(draft: ProviderDraft, now = new Date()): { ok: true; provider: Provider } | { ok: false; reason: string } {
  const name = draft.name.replace(/\s+/g, ' ').trim();
  if (name.length < 2) return { ok: false, reason: 'Add the provider’s name.' };
  if (!draft.trade) return { ok: false, reason: 'Choose a trade.' };
  if (!phoneOk(draft.phone)) return { ok: false, reason: 'That phone number looks short. Use at least 7 digits.' };
  if (!emailOk(draft.email)) return { ok: false, reason: 'That email doesn’t look right.' };
  const trade = draft.trade;
  const id = draft.id || `sp-${name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12)}-${now.getTime().toString(36)}`;
  let index = 0;
  for (const ch of name) index = (index + ch.charCodeAt(0)) % COLORS.length;
  const color = COLORS[index] ?? COLORS[0];
  return {
    ok: true,
    provider: normalizeProvider({
      id,
      name,
      kind: kindForTrade(trade),
      service: tradeLabel(trade),
      bio: draft.notes.trim() || `${tradeLabel(trade)} for the apartment.`,
      rate: 0,
      durationMin: 60,
      venmo: '',
      zelle: draft.email.trim(),
      phone: draft.phone.trim(),
      active: true,
      bookable: true,
      color,
      slotTemplates: [{ days: [1, 2, 3, 4, 5], start: '09:00', end: '12:00' }],
      trade,
      company: draft.company.trim(),
      email: draft.email.trim(),
      website: draft.website.trim(),
      serviceArea: draft.serviceArea.trim(),
      preferredContact: draft.preferredContact,
      notes: draft.notes.trim(),
    }),
  };
}

export function providerSearchText(provider: Provider): string {
  return [provider.name, provider.company, provider.trade, provider.service, provider.phone, provider.email, provider.serviceArea, provider.notes, provider.bio]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
