import { describe, expect, it } from 'vitest';
import { emailOk, phoneOk, validateProvider, websiteHref } from './providers';

describe('provider contacts', () => {
  it('accepts a lightly valid phone and email and rejects the obvious misses', () => {
    expect(phoneOk('917-555-0164')).toBe(true);
    expect(phoneOk('')).toBe(true);
    expect(phoneOk('555')).toBe(false);
    expect(emailOk('maria@example.com')).toBe(true);
    expect(emailOk('maria@')).toBe(false);
    expect(websiteHref('example.com')).toBe('https://example.com');
  });

  it('builds a provider that can be listed and assigned', () => {
    const built = validateProvider({
      name: '  Rita Santos ',
      company: 'Santos Plumbing',
      trade: 'plumber',
      phone: '(212) 555-0199',
      email: 'rita@santos.example',
      website: 'santos.example',
      serviceArea: 'Chelsea',
      preferredContact: 'phone',
      notes: 'Knows the building stack.',
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.provider.kind).toBe('plumber');
    expect(built.provider.trade).toBe('plumber');
    expect(built.provider.bookable).toBe(true);
    expect(built.provider.name).toBe('Rita Santos');
    expect(validateProvider({ name: 'A', company: '', trade: 'plumber', phone: '', email: '', website: '', serviceArea: '', preferredContact: 'phone', notes: '' }).ok).toBe(false);
  });
});
