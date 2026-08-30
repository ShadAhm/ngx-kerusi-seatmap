/**
 * A single conformance finding against a Kerusi document.
 *
 * The validator collects these rather than throwing at the first fault, so a
 * caller can show every problem in a document at once. `validateKerusiMap` and
 * friends still throw on the first `error`, preserving the pre-1.0 behavior.
 */
export interface KerusiViolation {
  /** Short slug of the violated rule, e.g. "seat-type-reference". Stable. */
  rule: string;
  /** Human-readable explanation, citing the spec section where one applies. */
  message: string;
  /** The id (seat, section, element, tier, ...) that triggered it, if any. */
  id?: string;
  /**
   * `error` — a MUST-level violation; the document is invalid.
   * `warning` — a SHOULD-level or advisory finding; the document still renders.
   */
  severity: ViolationSeverity;
  /** Where in the document it occurred, e.g. `sections[1].seats[7]`. */
  path?: string;
}

export type ViolationSeverity = 'error' | 'warning';

/** Builds an `error` violation. */
export function error(
  rule: string,
  message: string,
  opts: { id?: string; path?: string } = {},
): KerusiViolation {
  return { rule, message, severity: 'error', ...opts };
}

/** Builds a `warning` violation. */
export function warning(
  rule: string,
  message: string,
  opts: { id?: string; path?: string } = {},
): KerusiViolation {
  return { rule, message, severity: 'warning', ...opts };
}

/** The subset of violations that make a document invalid. */
export function errorsOf(violations: readonly KerusiViolation[]): readonly KerusiViolation[] {
  return violations.filter((v) => v.severity === 'error');
}
