import { KerusiMap, LocalizedText, Money } from './kerusi-map.model.js';

/**
 * Label and money resolution for Kerusi documents.
 *
 * The standard lets `Section.label` and `SeatType.label` be either a plain
 * string or a BCP-47 locale map (§4.1, §4.7), and states amounts in minor units
 * (§4.8). Both need resolving before anything can be rendered or announced.
 */

/** The default when a map declares no `locale` (§4). */
export const DEFAULT_LOCALE = 'en';

/** The locale a map renders in: an explicit override, else the map's, else "en". */
export function resolveMapLocale(map: KerusiMap | undefined, override?: string): string {
  return override ?? map?.locale ?? DEFAULT_LOCALE;
}

/**
 * Resolves a `string | Record<string, string>` label for the given locale.
 *
 * A plain string is returned as-is. A locale map is matched, in order, against:
 * the exact tag, progressively shorter prefixes of it (`ms-MY` → `ms`), the
 * fallback locale and its prefixes, and finally the first key in insertion
 * order — so a map that localizes into languages the caller didn't ask for
 * still renders something rather than nothing. Tag matching is
 * case-insensitive.
 *
 * Returns `undefined` for an absent or empty label, so callers can fall back to
 * an id.
 */
export function resolveLocalizedText(
  value: LocalizedText | undefined,
  locale: string,
  fallbackLocale: string = DEFAULT_LOCALE,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }

  const byLowerKey = new Map<string, string>();
  for (const [key, text] of Object.entries(value)) {
    // First key wins, so insertion order decides between "en" and "EN".
    if (!byLowerKey.has(key.toLowerCase())) {
      byLowerKey.set(key.toLowerCase(), text);
    }
  }

  for (const candidate of [...tagChain(locale), ...tagChain(fallbackLocale)]) {
    const hit = byLowerKey.get(candidate);
    if (hit !== undefined) {
      return hit;
    }
  }

  const first = Object.values(value)[0];
  return first ?? undefined;
}

/**
 * A BCP-47 tag and its progressively shorter prefixes, lowercased:
 * `"zh-Hant-TW"` → `["zh-hant-tw", "zh-hant", "zh"]`.
 */
function tagChain(tag: string): string[] {
  const parts = tag.toLowerCase().split('-').filter(Boolean);
  const chain: string[] = [];
  for (let i = parts.length; i > 0; i--) {
    chain.push(parts.slice(0, i).join('-'));
  }
  return chain;
}

/**
 * The number of minor-unit digits for an ISO 4217 code — 2 for MYR/USD, 0 for
 * JPY, 3 for KWD/BHD. Read from `Intl` rather than hardcoded, because
 * `Money.amount` is in minor units and dividing everything by 100 renders JPY
 * 100× too small and KWD 10× too large (§4.8).
 */
export function minorUnitDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    // An unknown or malformed code: assume the common case rather than throw.
    return 2;
  }
}

/** A `Money` as a major-unit number, e.g. `{ amount: 4500, currency: 'MYR' }` → `45`. */
export function toMajorUnits(money: Money): number {
  return money.amount / 10 ** minorUnitDigits(money.currency);
}

/**
 * Formats a `Money` for display, e.g. `RM 45.00`, `¥1,200`, `KD 12.500`.
 * Falls back to `"<amount> <currency>"` when the runtime rejects the code.
 */
export function formatMoney(money: Money | undefined, locale: string = DEFAULT_LOCALE): string {
  if (!money) {
    return '';
  }
  const major = toMajorUnits(money);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: money.currency,
    }).format(major);
  } catch {
    return `${major} ${money.currency}`;
  }
}

/** Sums money of one currency. Returns `undefined` for an empty list. */
export function sumMoney(amounts: readonly Money[]): Money | undefined {
  if (amounts.length === 0) {
    return undefined;
  }
  return {
    amount: amounts.reduce((sum, m) => sum + m.amount, 0),
    currency: amounts[0].currency,
  };
}
