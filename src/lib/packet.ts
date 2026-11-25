import { classify, type Classification } from './classify';
import { CATEGORIES, type Audience, type CategoryId, type KbItem, type SpKind, type Visit, audienceLabel } from './types';

export function itemText(item: KbItem): string {
  return [item.title, item.body, ...item.images.map((image) => image.caption)].filter(Boolean).join('\n');
}

export function effective(item: KbItem): Classification & { mode: 'auto' | 'override' } {
  const auto = classify(item.category, itemText(item));
  if (item.audienceMode === 'override') {
    const audience: Audience[] = item.audience.includes('all') || item.audience.length === 0 ? ['all'] : item.audience;
    return {
      audience,
      why: `You set these tags yourself. The guess was ${audienceLabel(auto.audience)}. ${auto.why}`,
      signals: [...auto.signals, 'Override · chosen by hand'],
      mode: 'override',
    };
  }
  return { ...auto, mode: 'auto' };
}

export function isRelevant(item: KbItem, kind: SpKind): boolean {
  const audience = effective(item).audience;
  return audience.includes('all') || audience.includes(kind);
}

function byCategory(list: KbItem[]): KbItem[] {
  return [...list].sort((a, b) => {
    const ai = CATEGORIES.findIndex((category) => category.id === a.category);
    const bi = CATEGORIES.findIndex((category) => category.id === b.category);
    return ai - bi || a.title.localeCompare(b.title);
  });
}

export function splitPacket(items: KbItem[], kind: SpKind) {
  const relevant = items.filter((item) => isRelevant(item, kind));
  return {
    specific: byCategory(relevant.filter((item) => !effective(item).audience.includes('all'))),
    universal: byCategory(relevant.filter((item) => effective(item).audience.includes('all'))),
  };
}

export function themesFor(visits: Visit[], spId: string) {
  const map = new Map<string, { theme: string; count: number; visitIds: string[] }>();
  const dated = visits
    .filter((visit) => visit.spId === spId && visit.feedback)
    .sort((a, b) => +new Date(b.start) - +new Date(a.start));
  for (const visit of dated) {
    for (const theme of visit.feedback?.themes ?? []) {
      const row = map.get(theme) ?? { theme, count: 0, visitIds: [] };
      row.count += 1;
      row.visitIds.push(visit.id);
      map.set(theme, row);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));
}

export function averageRating(visits: Visit[], spId: string): number | null {
  const ratings = visits.filter((visit) => visit.spId === spId && visit.feedback).map((visit) => visit.feedback!.rating);
  if (!ratings.length) return null;
  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
}

const THEME_PATTERNS: [RegExp, string][] = [
  [/under the bed|under bed/i, 'Missed under the bed'],
  [/plant|fiddle/i, 'Great with plants'],
  [/espresso|kitchen/i, 'Careful in the kitchen'],
  [/blind/i, 'Left the place as asked'],
  [/came home|pleased|happy/i, 'Miso came back happy'],
  [/pill|apoquel|saucer/i, 'Forgot the evening pill'],
  [/harness/i, 'Used the harness'],
  [/rush/i, 'Felt rushed'],
  [/wrong amount|past one cup|was sick/i, 'Fed the wrong amount'],
  [/bach|invention/i, 'Patient with the Bach'],
  [/minutes over|ran long|ran about/i, 'Ran long'],
];

export function extractThemes(comment: string): string[] {
  return THEME_PATTERNS.filter(([pattern]) => pattern.test(comment)).map(([, theme]) => theme);
}

export function countPhotos(items: KbItem[]): number {
  return items.reduce((sum, item) => sum + item.images.length, 0);
}

export function itemsInCategory(items: KbItem[], category: CategoryId): KbItem[] {
  return items.filter((item) => item.category === category);
}
