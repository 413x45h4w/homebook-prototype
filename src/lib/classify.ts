import {
  type Audience,
  type CategoryId,
  audienceLabel,
  categoryMeta,
  joinKinds,
} from './types';

export interface KeywordHit {
  id: string;
  topic: string;
  sample: string;
  audience: Audience[];
}

export interface Classification {
  audience: Audience[];
  why: string;
  signals: string[];
}

interface KeywordRule {
  id: string;
  re: RegExp;
  audience: Audience[];
  topic: string;
}

const KEYWORDS: KeywordRule[] = [
  {
    id: 'access',
    re: /\b(door codes?|lockbox|doorman|buzzer|spare key|building code)\b/i,
    audience: ['all'],
    topic: 'how to get in',
  },
  {
    id: 'wifi',
    re: /\b(wi-?fi|ssid|network password)\b/i,
    audience: ['all'],
    topic: 'the Wi-Fi',
  },
  {
    id: 'dog',
    re: /\b(dog|leash|harness|kibble|puppy|miso|pet|apoquel)\b/i,
    audience: ['dog_walker', 'pet_sitter'],
    topic: 'the dog',
  },
  {
    id: 'feed',
    re: /\b(feed|feeding|kibble)\b/i,
    audience: ['dog_walker', 'pet_sitter'],
    topic: 'feeding',
  },
  {
    id: 'laundry',
    re: /\b(laundry|detergent|dryer|washing machine|hamper|tumble)\b/i,
    audience: ['cleaner'],
    topic: 'laundry',
  },
  {
    id: 'clean',
    re: /\b(vacuum|mop|dust|scrub|cleaning|trash|recycling|dishwasher)\b/i,
    audience: ['cleaner'],
    topic: 'cleaning',
  },
  {
    id: 'plant',
    re: /\b(plant|fiddle|succulent)\b/i,
    audience: ['cleaner'],
    topic: 'the plants',
  },
  {
    id: 'piano',
    re: /\b(piano|metronome|sheet music|scales|bach|chopin)\b/i,
    audience: ['piano_teacher'],
    topic: 'the piano',
  },
  {
    id: 'plumb',
    re: /\b(plumb\w*|faucet|drain|leak|pipe)\b/i,
    audience: ['plumber'],
    topic: 'plumbing',
  },
  {
    id: 'handy',
    re: /\b(handyman|drill|picture hook)\b/i,
    audience: ['handyman'],
    topic: 'a repair',
  },
  {
    id: 'baby',
    re: /\b(babysit\w*|toddler|crib|bedtime)\b/i,
    audience: ['babysitter'],
    topic: 'childcare',
  },
];

const UNIVERSAL = new Set<CategoryId>(['apartment_access', 'wifi', 'emergency', 'do_not_touch']);

const CATEGORY_AUDIENCE: Record<CategoryId, Audience[]> = {
  apartment_access: ['all'],
  wifi: ['all'],
  emergency: ['all'],
  do_not_touch: ['all'],
  pets: ['dog_walker', 'pet_sitter'],
  laundry: ['cleaner'],
  kitchen: ['cleaner'],
  plants: ['cleaner'],
  supplies: ['cleaner'],
  piano: ['piano_teacher'],
  general: ['all'],
};

const CATEGORY_WHY: Record<CategoryId, string> = {
  apartment_access: 'Everyone who comes in has to get through the door, so apartment access goes to all providers.',
  wifi: 'Anyone working in the apartment may need the network, so Wi-Fi goes to all providers.',
  emergency: 'If something goes wrong, every provider needs the same phone numbers.',
  do_not_touch: 'House rules and off-limits spots apply to every person who comes inside.',
  pets: 'This is about the dog, so it goes to the dog walker and the pet sitter — not to a cleaner or a piano teacher.',
  laundry: 'This is laundry, so it goes to the cleaner and not to a dog walker or piano teacher.',
  kitchen: 'Kitchen work is part of the clean, so it goes to the cleaner.',
  plants: 'Plant care rides along with the cleaner’s visit.',
  supplies: 'Where the supplies live matters to the cleaner.',
  piano: 'This is about the piano, so it goes to the piano teacher.',
  general: 'Nothing in the wording limits it to one trade, so every provider who works in the apartment receives it.',
};

function unique(list: Audience[]): Audience[] {
  return [...new Set(list)];
}

export function keywordHits(text: string): KeywordHit[] {
  const hits: KeywordHit[] = [];
  for (const rule of KEYWORDS) {
    const match = text.match(rule.re);
    if (!match) continue;
    hits.push({
      id: rule.id,
      topic: rule.topic,
      sample: match[0],
      audience: rule.audience,
    });
  }
  return hits;
}

function specific(hits: KeywordHit[]): KeywordHit[] {
  return hits.filter((hit) => !hit.audience.includes('all'));
}

/**
 * Guess which service-provider kinds should receive a note.
 * Category is the main signal. Keywords explain the guess and, on a
 * general note, can narrow it. Universal categories (access, Wi-Fi,
 * emergency, do-not-touch) stay with everyone even if the wording
 * mentions a dog or a vacuum.
 */
export function classify(category: CategoryId, text: string): Classification {
  const hits = keywordHits(text);
  const extra = specific(hits);
  const signals = [
    `Category · ${categoryMeta(category).label}`,
    ...hits.map((hit) => `Keyword · “${hit.sample}” → ${hit.topic}`),
  ];

  if (UNIVERSAL.has(category)) {
    const aside = extra.length
      ? ` It mentions ${extra.map((hit) => hit.topic).join(' and ')}, and that still doesn’t narrow who needs it.`
      : '';
    return { audience: ['all'], why: `${CATEGORY_WHY[category]}${aside}`, signals };
  }

  if (category === 'general') {
    const universalHit = hits.find((hit) => hit.audience.includes('all'));
    if (universalHit && extra.length) {
      return {
        audience: ['all'],
        why: `It mentions ${universalHit.topic}, which every provider needs, so the whole note stays shared. It also mentions ${extra.map((hit) => hit.topic).join(' and ')}.`,
        signals,
      };
    }
    if (extra.length) {
      const audience = unique(extra.flatMap((hit) => hit.audience));
      return {
        audience,
        why: `The note isn’t filed under one room, but it mentions ${extra.map((hit) => hit.topic).join(' and ')}, so it goes to ${joinKinds(audience)}.`,
        signals,
      };
    }
    return { audience: ['all'], why: CATEGORY_WHY.general, signals };
  }

  const audience = [...CATEGORY_AUDIENCE[category]];
  if (category === 'supplies') {
    for (const hit of extra) {
      for (const kind of hit.audience) {
        if ((kind === 'plumber' || kind === 'handyman' || kind === 'babysitter') && !audience.includes(kind)) {
          audience.push(kind);
        }
      }
    }
  }

  const pulled = extra.filter((hit) => hit.audience.some((kind) => kind !== 'all' && !audience.includes(kind)));
  let why = CATEGORY_WHY[category];
  if (category === 'supplies' && audience.some((kind) => kind !== 'cleaner')) {
    const added = audience.filter((kind) => kind !== 'cleaner');
    const topics = extra
      .filter((hit) => hit.audience.some((kind) => kind === 'plumber' || kind === 'handyman' || kind === 'babysitter'))
      .map((hit) => hit.topic);
    if (topics.length) {
      why += ` It also mentions ${topics.join(' and ')}, so ${joinKinds(added)} ${added.length === 1 ? 'is' : 'are'} included too.`;
    }
  } else if (pulled.length) {
    why += ` The word “${pulled[0].sample}” shows up, and it still doesn’t add ${joinKinds(pulled[0].audience)} because the category is ${categoryMeta(category).label.toLowerCase()}.`;
  }

  return { audience, why, signals };
}

export function guessCategory(text: string): CategoryId {
  const rules: [RegExp, CategoryId][] = [
    [/\b(door code|lockbox|doorman|buzzer|spare key)\b/i, 'apartment_access'],
    [/\b(wi-?fi|ssid)\b/i, 'wifi'],
    [/\b(emergency|hospital|super)\b/i, 'emergency'],
    [/\b(piano|scales|bach|chopin|metronome)\b/i, 'piano'],
    [/\b(leash|harness|kibble|dog|miso|puppy|apoquel|feed|feeding)\b/i, 'pets'],
    [/\b(laundry|detergent|dryer|hamper|tumble)\b/i, 'laundry'],
    [/\b(espresso|dishwasher|kitchen|compost)\b/i, 'kitchen'],
    [/\b(plant|fiddle|succulent)\b/i, 'plants'],
    [/\b(vacuum|caddy|closet|supplies)\b/i, 'supplies'],
    [/\b(don't touch|do not touch|off limits)\b/i, 'do_not_touch'],
    [/\b(faucet|drain|leak|plumber)\b/i, 'general'],
  ];
  for (const [re, category] of rules) {
    if (re.test(text)) return category;
  }
  return 'general';
}

export function titleFromInstruction(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 72) return clean;
  const slice = clean.slice(0, 72);
  const cut = slice.lastIndexOf(' ');
  return `${(cut > 40 ? slice.slice(0, cut) : slice).replace(/[.,;:]$/, '')}…`;
}

export function describeAudience(audience: Audience[]): string {
  return audienceLabel(audience);
}
