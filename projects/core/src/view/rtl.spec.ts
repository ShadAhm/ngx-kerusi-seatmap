import { describe, expect, it } from 'vitest';
import { isRtlLocale, RTL_LANGUAGES } from './rtl.js';

describe('isRtlLocale', () => {
  it('recognises the right-to-left language subtags', () => {
    for (const tag of RTL_LANGUAGES) {
      expect(isRtlLocale(tag)).toBe(true);
    }
  });

  it('reads only the primary subtag', () => {
    expect(isRtlLocale('ar-EG')).toBe(true);
    expect(isRtlLocale('en-AE')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isRtlLocale('AR')).toBe(true);
    expect(isRtlLocale('He-IL')).toBe(true);
  });

  it('treats an unknown or empty locale as left-to-right', () => {
    expect(isRtlLocale('en')).toBe(false);
    expect(isRtlLocale('ms-MY')).toBe(false);
    expect(isRtlLocale('')).toBe(false);
  });
});
