import { describe, expect, it } from 'vitest';
import { KerusiMap } from './kerusi-map.model.js';
import {
  formatMoney,
  minorUnitDigits,
  resolveLocalizedText,
  resolveMapLocale,
  sumMoney,
  toMajorUnits,
} from './kerusi-locale.js';

describe('resolveLocalizedText', () => {
  const labels = { en: 'Orchestra', 'ms-MY': 'Orkestra', ja: 'オーケストラ' };

  it('returns a plain string unchanged', () => {
    expect(resolveLocalizedText('Balcony', 'ms')).toBe('Balcony');
  });

  it('matches an exact tag', () => {
    expect(resolveLocalizedText(labels, 'ms-MY')).toBe('Orkestra');
  });

  it('matches a shorter tag against a longer key and vice versa', () => {
    expect(resolveLocalizedText({ ms: 'Orkestra' }, 'ms-MY')).toBe('Orkestra');
    expect(resolveLocalizedText(labels, 'ja-JP')).toBe('オーケストラ');
  });

  it('is case-insensitive about tags', () => {
    expect(resolveLocalizedText({ 'PT-BR': 'Plateia' }, 'pt-br')).toBe('Plateia');
  });

  it('falls back to the fallback locale, then to the first key', () => {
    expect(resolveLocalizedText(labels, 'fr')).toBe('Orchestra');
    expect(resolveLocalizedText({ ms: 'Orkestra', ja: 'x' }, 'fr')).toBe('Orkestra');
  });

  it('returns undefined for an absent label so callers can fall back to an id', () => {
    expect(resolveLocalizedText(undefined, 'en')).toBeUndefined();
    expect(resolveLocalizedText({}, 'en')).toBeUndefined();
  });
});

describe('resolveMapLocale', () => {
  const map = { kerusi: '1.0', id: 'm', locale: 'ms-MY', legend: [], sections: [] } as KerusiMap;

  it('prefers an explicit override, then the map, then "en"', () => {
    expect(resolveMapLocale(map, 'ja')).toBe('ja');
    expect(resolveMapLocale(map)).toBe('ms-MY');
    expect(resolveMapLocale({ ...map, locale: undefined })).toBe('en');
    expect(resolveMapLocale(undefined)).toBe('en');
  });
});

describe('money in minor units (§4.8)', () => {
  it('reads the minor-unit exponent per currency rather than assuming 2', () => {
    expect(minorUnitDigits('MYR')).toBe(2);
    expect(minorUnitDigits('USD')).toBe(2);
    expect(minorUnitDigits('JPY')).toBe(0);
    expect(minorUnitDigits('KWD')).toBe(3);
  });

  it('converts to major units accordingly', () => {
    expect(toMajorUnits({ amount: 4500, currency: 'MYR' })).toBe(45);
    // Dividing by 100 unconditionally would render this as ¥12.
    expect(toMajorUnits({ amount: 1200, currency: 'JPY' })).toBe(1200);
    expect(toMajorUnits({ amount: 12500, currency: 'KWD' })).toBe(12.5);
  });

  it('formats with the currency symbol for the given locale', () => {
    expect(formatMoney({ amount: 4500, currency: 'MYR' }, 'en')).toMatch(/45\.00/);
    expect(formatMoney({ amount: 1200, currency: 'JPY' }, 'en')).toMatch(/1,200/);
    expect(formatMoney({ amount: 12500, currency: 'KWD' }, 'en')).toMatch(/12\.500/);
  });

  it('degrades gracefully for an unknown currency code', () => {
    expect(minorUnitDigits('XXXXX')).toBe(2);
    expect(formatMoney({ amount: 100, currency: 'XXXXX' })).toBe('1 XXXXX');
  });

  it('returns an empty string for no money at all', () => {
    expect(formatMoney(undefined)).toBe('');
  });

  it('sums a single-currency list', () => {
    expect(
      sumMoney([
        { amount: 1500, currency: 'MYR' },
        { amount: 4500, currency: 'MYR' },
      ]),
    ).toEqual({ amount: 6000, currency: 'MYR' });
    expect(sumMoney([])).toBeUndefined();
  });
});
