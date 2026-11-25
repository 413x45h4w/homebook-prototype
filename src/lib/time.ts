export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function atDay(offset: number, time: string): Date {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() + offset);
  return withTime(d, time);
}

export function withTime(day: Date, time: string): Date {
  const [hh, mm] = time.split(':').map(Number);
  const d = new Date(day);
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d;
}

/** `which` 0 is the next occurrence of that weekday, including today. */
export function nextWeekday(dow: number, which: number, time: string): Date {
  const d = startOfDay(new Date());
  const delta = (dow - d.getDay() + 7) % 7 + which * 7;
  d.setDate(d.getDate() + delta);
  return withTime(d, time);
}

export function sameDay(a: Date | string, b: Date | string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function upcomingDays(count: number): Date[] {
  const start = startOfDay(new Date());
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

export function formatTime(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function formatDay(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

export function formatLongDay(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso));
}

export function formatRange(start: string, end: string): string {
  return `${formatDay(start)} · ${formatTime(start)}–${formatTime(end)}`;
}

export function formatDayTime(iso: string): string {
  return `${formatDay(iso)} · ${formatTime(iso)}`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function money(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export function toGoogleStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}
