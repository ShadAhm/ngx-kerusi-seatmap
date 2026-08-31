/**
 * Which locales are written right-to-left.
 *
 * A binding needs this to decide whether to mirror a grid section and swap the
 * left/right arrow keys, and it would be written identically in every one —
 * so it belongs here rather than in any of them.
 */

/** BCP-47 language subtags written right-to-left. */
export const RTL_LANGUAGES: ReadonlySet<string> = new Set([
  'ar',
  'he',
  'fa',
  'ur',
  'ps',
  'dv',
  'yi',
  'ku',
  'sd',
]);

/**
 * True when the locale's language subtag is written right-to-left.
 *
 * Only the primary subtag is consulted, so `ar-EG` and `AR` both resolve the
 * same way as `ar`.
 */
export function isRtlLocale(locale: string): boolean {
  return RTL_LANGUAGES.has(locale.toLowerCase().split('-')[0]!);
}
