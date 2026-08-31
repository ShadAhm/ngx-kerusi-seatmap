import { KerusiState, KerusiStateDelta, SeatStatus } from './kerusi-state.model.js';

/**
 * Live-availability lifecycle: applying deltas in order, noticing when the
 * stream has lost a message, and letting a lapsed hold fall back to available.
 *
 * These are pure functions over an immutable {@link KerusiState}. A framework
 * binding may wrap them in whatever reactive primitive it prefers — see
 * `KerusiStateStore` in `ngx-kerusi-seatmap` for the Angular signal-backed
 * version — but nothing here needs one.
 */

/** What happened when a delta was offered to the store. */
export type DeltaOutcome =
  /** Merged into the state. */
  | 'applied'
  /** `updatedAt` is at or before the current state's; discarded (§5.2). */
  | 'stale'
  /** Identical `updatedAt` to the last applied delta; discarded. */
  | 'duplicate'
  /**
   * The transport's sequence skipped ahead: messages were lost. Applied
   * best-effort, but the consumer SHOULD re-fetch a full state (§5.2).
   */
  | 'gap'
  /** The delta names a different session or map; discarded. */
  | 'scope-mismatch';

export interface DeltaApplication {
  /** The state after the attempt — unchanged when the delta was discarded. */
  state: KerusiState;
  outcome: DeltaOutcome;
  /** Human-readable explanation, for logging a discard. */
  detail?: string;
}

/**
 * Reads a monotonic sequence number off a delta, when the transport supplies
 * one. Returns `undefined` when it does not — see {@link applyStateDeltaOrdered}
 * for why that matters.
 */
export type SequenceReader = (delta: KerusiStateDelta) => number | undefined;

/** Default: a numeric `metadata.seq`, the conventional place to put one. */
export const DEFAULT_SEQUENCE_READER: SequenceReader = (delta) => {
  const seq = (delta as { metadata?: Record<string, unknown> }).metadata?.['seq'];
  return typeof seq === 'number' ? seq : undefined;
};

/**
 * Applies a delta with the §5.2 ordering rules enforced.
 *
 * Three things are checked, in order:
 *
 *  1. **Scope.** A delta whose `sessionId`/`mapId` disagrees with the base state
 *     belongs to a different event and is discarded.
 *  2. **Ordering.** `updatedAt` is REQUIRED to be strictly increasing per
 *     session/map, so a delta at or before the state's timestamp is stale.
 *  3. **Gaps.** Reported only when `sequenceOf` yields a number and it skips
 *     ahead of the last one seen. This is a deliberate limitation:
 *     `updatedAt` is guaranteed strictly increasing but *not* contiguous, so
 *     "delta N+2 arrived after N" is indistinguishable from "N+1 never
 *     existed". Gap detection therefore needs a sequence the transport
 *     provides. A gap still applies the delta — showing slightly-wrong
 *     availability beats showing none while the consumer re-fetches.
 */
export function applyStateDeltaOrdered(
  base: KerusiState,
  delta: KerusiStateDelta,
  opts: { sequenceOf?: SequenceReader; lastSequence?: number } = {},
): DeltaApplication {
  const scope = scopeMismatch(base, delta);
  if (scope) {
    return { state: base, outcome: 'scope-mismatch', detail: scope };
  }

  if (delta.updatedAt === base.updatedAt) {
    return {
      state: base,
      outcome: 'duplicate',
      detail: `Delta updatedAt "${delta.updatedAt}" equals the current state's; ignored.`,
    };
  }
  if (delta.updatedAt < base.updatedAt) {
    return {
      state: base,
      outcome: 'stale',
      detail:
        `Delta updatedAt "${delta.updatedAt}" precedes the current state's ` +
        `"${base.updatedAt}"; discarded (§5.2).`,
    };
  }

  const state: KerusiState = {
    ...base,
    updatedAt: delta.updatedAt,
    seats: { ...base.seats, ...delta.changes },
  };

  const sequenceOf = opts.sequenceOf ?? DEFAULT_SEQUENCE_READER;
  const seq = sequenceOf(delta);
  if (seq !== undefined && opts.lastSequence !== undefined && seq > opts.lastSequence + 1) {
    return {
      state,
      outcome: 'gap',
      detail:
        `Delta sequence ${seq} follows ${opts.lastSequence}: ` +
        `${seq - opts.lastSequence - 1} message(s) were lost. Re-fetch a full ` +
        'KerusiState (§5.2).',
    };
  }

  return { state, outcome: 'applied' };
}

/** Why the delta does not belong to this state, or `undefined` when it does. */
function scopeMismatch(base: KerusiState, delta: KerusiStateDelta): string | undefined {
  if (base.sessionId !== undefined && delta.sessionId !== undefined) {
    return base.sessionId === delta.sessionId
      ? undefined
      : `Delta targets session "${delta.sessionId}", state is "${base.sessionId}".`;
  }
  if (base.mapId !== undefined && delta.mapId !== undefined) {
    return base.mapId === delta.mapId
      ? undefined
      : `Delta targets map "${delta.mapId}", state is "${base.mapId}".`;
  }
  // One side is scoped by session and the other by map: they cannot be
  // compared, so accept rather than invent a mismatch.
  return undefined;
}

/**
 * Reverts every seat whose hold has lapsed to `"available"` (§5.1). Returns the
 * same state object when nothing changed, so a signal reading it does not fire.
 *
 * A `held` seat with no `holdExpires` never lapses — the spec makes the field
 * optional, and an absent expiry means the hold is managed elsewhere.
 */
export function expireHolds(state: KerusiState, now: string | Date = new Date()): KerusiState {
  const nowMs = typeof now === 'string' ? Date.parse(now) : now.getTime();
  let changed = false;
  const seats: Record<string, SeatStatus> = {};

  for (const [seatId, status] of Object.entries(state.seats ?? {})) {
    if (status.status === 'held' && status.holdExpires && Date.parse(status.holdExpires) <= nowMs) {
      seats[seatId] = { status: 'available' };
      changed = true;
    } else {
      seats[seatId] = status;
    }
  }

  return changed ? { ...state, seats } : state;
}

/** A seat currently held, with how long is left on it. */
export interface HeldSeat {
  seatId: string;
  expiresAt: string;
  /** Milliseconds until expiry; negative once lapsed. */
  msRemaining: number;
}

/**
 * Every currently-held seat, soonest to expire first.
 *
 * A binding renders these as countdowns; the arithmetic is the same wherever
 * it runs, so it lives here rather than in each store. Seats held without a
 * `holdExpires` are omitted — there is no countdown to show.
 */
export function heldSeats(
  state: KerusiState,
  now: string | Date = new Date(),
): readonly HeldSeat[] {
  const nowMs = typeof now === 'string' ? Date.parse(now) : now.getTime();
  return Object.entries(state.seats ?? {})
    .filter(([, s]) => s.status === 'held' && !!s.holdExpires)
    .map(([seatId, s]) => ({
      seatId,
      expiresAt: s.holdExpires!,
      msRemaining: Date.parse(s.holdExpires!) - nowMs,
    }))
    .sort((a, b) => a.msRemaining - b.msRemaining);
}
