export const SP_KINDS = [
  { id: 'cleaner', label: 'Cleaner', plural: 'cleaners' },
  { id: 'dog_walker', label: 'Dog walker', plural: 'dog walkers' },
  { id: 'pet_sitter', label: 'Pet sitter', plural: 'pet sitters' },
  { id: 'piano_teacher', label: 'Piano teacher', plural: 'piano teachers' },
  { id: 'plumber', label: 'Plumber', plural: 'plumbers' },
  { id: 'handyman', label: 'Handyman', plural: 'handymen' },
  { id: 'babysitter', label: 'Babysitter', plural: 'babysitters' },
] as const;

export type SpKind = (typeof SP_KINDS)[number]['id'];
export type Audience = SpKind | 'all';

export const CATEGORIES = [
  { id: 'apartment_access', label: 'Apartment access', blurb: 'Door, keys, doorman' },
  { id: 'pets', label: 'Pets', blurb: 'Miso, walks, feeding' },
  { id: 'laundry', label: 'Laundry', blurb: 'Wash and fold' },
  { id: 'kitchen', label: 'Kitchen', blurb: 'Dishes and espresso' },
  { id: 'plants', label: 'Plants', blurb: 'Watering' },
  { id: 'do_not_touch', label: 'Do-not-touch', blurb: 'Off limits and house rules' },
  { id: 'supplies', label: 'Supplies location', blurb: 'Where things live' },
  { id: 'wifi', label: 'Wi-Fi', blurb: 'Network' },
  { id: 'emergency', label: 'Emergency contacts', blurb: 'Who to call' },
  { id: 'piano', label: 'Piano', blurb: 'The instrument and lessons' },
  { id: 'general', label: 'General', blurb: 'The rest of the house' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export type Persona = 'customer' | 'provider';
export type VisitStatus = 'scheduled' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'requested' | 'paid';
export type ProposalKind = 'booking' | 'reschedule';
export type ProposalStatus = 'pending' | 'proposed' | 'accepted' | 'declined';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Client {
  id: string;
  name: string;
  shortName: string;
  address: string;
  neighborhood: string;
  cityLine: string;
  lat: number;
  lng: number;
  phone: string;
  accessNote: string;
  fullKnowledgeBase: boolean;
}

export interface SlotTemplate {
  days: number[];
  start: string;
  end: string;
}

export interface Provider {
  id: string;
  name: string;
  kind: SpKind;
  service: string;
  bio: string;
  rate: number;
  durationMin: number;
  venmo: string;
  zelle: string;
  phone: string;
  active: boolean;
  bookable: boolean;
  color: string;
  slotTemplates: SlotTemplate[];
}

export interface KbImage {
  id: string;
  src: string;
  caption: string;
}

export interface KbSource {
  messageId: string;
  threadId: string;
  spId: string;
}

export interface KbItem {
  id: string;
  title: string;
  body: string;
  category: CategoryId;
  audienceMode: 'auto' | 'override';
  audience: Audience[];
  images: KbImage[];
  createdAt: string;
  source?: KbSource;
}

export interface TimeSlot {
  start: string;
  end: string;
}

export interface Proposal {
  kind: ProposalKind;
  status: ProposalStatus;
  visitId?: string;
  slots: TimeSlot[];
  chosen?: number;
}

export interface Message {
  id: string;
  threadId: string;
  from: 'customer' | 'provider';
  body: string;
  createdAt: string;
  savedAsKbItemId?: string;
  proposal?: Proposal;
}

export interface Thread {
  id: string;
  spId: string;
  clientId: string;
}

export interface Feedback {
  rating: number;
  comment: string;
  themes: string[];
  createdAt: string;
}

export interface Visit {
  id: string;
  spId: string;
  clientId: string;
  start: string;
  end: string;
  status: VisitStatus;
  paymentStatus: PaymentStatus;
  amount: number;
  feedback?: Feedback;
}

export interface AppNotification {
  id: string;
  persona: Persona;
  spId?: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  href: string;
}

export interface SentPacket {
  id: string;
  kind: SpKind;
  recipientName: string;
  note: string;
  itemIds: string[];
  createdAt: string;
}

export interface State {
  version: number;
  persona: Persona;
  activeSpId: string;
  items: KbItem[];
  threads: Thread[];
  messages: Message[];
  visits: Visit[];
  notifications: AppNotification[];
  sentPackets: SentPacket[];
  dismissedOffers: string[];
  voiceNotes: VoiceFeedback[];
}

export interface VoiceFeedback {
  id: string;
  kind: 'voice';
  spId: string;
  visitId?: string;
  createdAt: string;
  transcript: string;
  rating?: number;
  category?: CategoryId;
  audioId: string;
  mimeType: string;
  durationSec?: number;
  source: 'recording' | 'upload';
}

export const THEME_SUGGESTIONS = [
  'Missed under the bed',
  'Great with plants',
  'Careful in the kitchen',
  'Left the place as asked',
  'Miso came back happy',
  'Forgot the evening pill',
  'Used the harness',
  'Felt rushed',
  'Fed the wrong amount',
  'Patient with the Bach',
  'Ran long',
];

export function kindMeta(id: SpKind) {
  return SP_KINDS.find((k) => k.id === id)!;
}

export function kindLabel(id: Audience): string {
  if (id === 'all') return 'All providers';
  return kindMeta(id).label;
}

export function audienceLabel(audience: Audience[]): string {
  if (audience.length === 0 || audience.includes('all')) return 'All providers';
  return audience.map((id) => kindLabel(id)).join(' · ');
}

export function categoryMeta(id: CategoryId) {
  return CATEGORIES.find((c) => c.id === id)!;
}

export function joinKinds(audience: Audience[]): string {
  const labels = audience.filter((id) => id !== 'all').map((id) => kindLabel(id).toLowerCase());
  if (labels.length === 0) return 'every provider';
  if (labels.length === 1) return `the ${labels[0]}`;
  if (labels.length === 2) return `the ${labels[0]} and the ${labels[1]}`;
  return `the ${labels.slice(0, -1).join(', ')}, and the ${labels[labels.length - 1]}`;
}
