import { toGoogleStamp } from './time';
import type { LatLng } from './types';

export function googleCalendarUrl(input: {
  title: string;
  start: string;
  end: string;
  details: string;
  location: string;
}): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${toGoogleStamp(input.start)}/${toGoogleStamp(input.end)}`,
    details: input.details,
    location: input.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function googleMapsDirUrl(points: (LatLng & { address?: string })[]): string {
  if (points.length === 0) return 'https://www.google.com/maps';
  if (points.length === 1) {
    const p = points[0];
    const params = new URLSearchParams({
      api: '1',
      query: p.address ? p.address : `${p.lat},${p.lng}`,
    });
    return `https://www.google.com/maps/search/?${params.toString()}`;
  }
  const origin = points[0];
  const destination = points[points.length - 1];
  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    travelmode: 'transit',
  });
  const middle = points.slice(1, -1);
  if (middle.length) {
    params.set('waypoints', middle.map((p) => `${p.lat},${p.lng}`).join('|'));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** venmo.com/<handle>?txn=pay&amount=..&note=.. */
export function venmoUrl(handle: string, amount: number, note: string): string {
  const params = new URLSearchParams({
    txn: 'pay',
    amount: amount.toFixed(2),
    note,
  });
  return `https://venmo.com/${handle}?${params.toString()}`;
}

export function asset(src: string): string {
  if (!src) return src;
  if (src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('http')) return src;
  return `${import.meta.env.BASE_URL}${src.replace(/^\//, '')}`;
}
