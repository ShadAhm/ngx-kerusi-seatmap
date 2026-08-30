import { Money } from '../kerusi/kerusi-map.model.js';
import { sumMoney } from '../kerusi/kerusi-locale.js';
import { RenderMap, RenderSeat } from '../render/render-model.js';

/**
 * Seat selection, as a pure reducer over a set of seat ids.
 *
 * The pre-1.0 component mutated `SeatNode.selected` in place, which forced
 * every caller to re-set its rows signal after each click just to make change
 * detection notice. Here the selection is a plain `readonly string[]` the
 * component owns as a `model()`, and this module never touches a `RenderSeat`.
 */

/** Why a seat could not be picked. */
export type DisallowedReason =
  /** The seat is sold. */
  | 'booked'
  /** Someone else has it mid-checkout. */
  | 'held'
  /** The venue withheld it. */
  | 'blocked'
  /** Selectable statuses or the caller's predicate excluded it. */
  | 'not-selectable'
  /** Taking it would exceed `maxSelection`. */
  | 'max-selection'
  /** A seat it must be booked with is unavailable (§4.6). */
  | 'companion-unavailable';

export type SelectionOutcomeKind = 'select' | 'deselect' | 'disallowed';

export interface SelectionOutcome {
  kind: SelectionOutcomeKind;
  /** The selection after the attempt — unchanged when disallowed. */
  selection: readonly string[];
  /** Set when `kind` is `"disallowed"`. */
  reason?: DisallowedReason;
  /**
   * Every seat whose membership changed, including companions pulled in or
   * dropped alongside the seat that was clicked.
   */
  changed: readonly string[];
}

export interface SelectionContext {
  seatsById: ReadonlyMap<string, RenderSeat>;
  /**
   * `auto` (default) selects and deselects a seat's whole companion closure
   * together; `independent` treats every seat separately, leaving the pairing
   * rule to the application.
   */
  companionMode?: 'auto' | 'independent';
  /** Cap on how many seats may be selected at once. */
  maxSelection?: number;
}

/**
 * Toggles a seat, returning the resulting selection.
 *
 * With `companionMode: 'auto'`, the unit of selection is the seat's *companion
 * closure* — the transitive set of seats it must be booked with (§4.6). A love
 * seat is picked and dropped as a pair, `maxSelection` counts the pair, and a
 * pair whose other half is already sold cannot be picked at all.
 */
export function toggleSeatSelection(
  selection: readonly string[],
  seatId: string,
  ctx: SelectionContext,
): SelectionOutcome {
  const seat = ctx.seatsById.get(seatId);
  const unchanged: SelectionOutcome = { kind: 'disallowed', selection, changed: [] };

  if (!seat) {
    return { ...unchanged, reason: 'not-selectable' };
  }

  const current = new Set(selection);
  const group =
    ctx.companionMode === 'independent' ? [seat.id] : companionClosure(seat.id, ctx.seatsById);

  // Deselecting never needs permission — drop the whole group.
  if (current.has(seat.id)) {
    const next = selection.filter((id) => !group.includes(id));
    return {
      kind: 'deselect',
      selection: next,
      changed: group.filter((id) => current.has(id)),
    };
  }

  if (!seat.selectable) {
    return { ...unchanged, reason: reasonFor(seat) };
  }

  // Every seat in the closure must be takeable, or none of them is.
  const blocked = group
    .map((id) => ctx.seatsById.get(id))
    .find((member) => member && !member.selectable && !current.has(member.id));
  if (blocked) {
    return { ...unchanged, reason: 'companion-unavailable' };
  }

  const additions = group.filter((id) => !current.has(id));
  if (ctx.maxSelection !== undefined && current.size + additions.length > ctx.maxSelection) {
    return { ...unchanged, reason: 'max-selection' };
  }

  return {
    kind: 'select',
    selection: [...selection, ...additions],
    changed: additions,
  };
}

/**
 * Every seat transitively linked to this one by `companions`, including itself.
 *
 * §4.6 requires the relation to be symmetric, so a breadth-first walk closes
 * over the whole bay — a three-seat family pod is one unit, not three pairs.
 * An id that does not resolve is skipped rather than throwing; the validator is
 * where a dangling companion is reported.
 */
export function companionClosure(
  seatId: string,
  seatsById: ReadonlyMap<string, RenderSeat>,
): string[] {
  const seen = new Set<string>([seatId]);
  const queue = [seatId];

  while (queue.length > 0) {
    const current = seatsById.get(queue.shift()!);
    for (const companionId of current?.companions ?? []) {
      if (!seen.has(companionId) && seatsById.has(companionId)) {
        seen.add(companionId);
        queue.push(companionId);
      }
    }
  }

  return [...seen];
}

/** The reason an unselectable seat gives, preferring its availability status. */
function reasonFor(seat: RenderSeat): DisallowedReason {
  switch (seat.status) {
    case 'booked':
    case 'held':
    case 'blocked':
      return seat.status;
    default:
      return 'not-selectable';
  }
}

export interface SelectionSummary {
  /** The selected seats, in the map's render order. */
  seats: readonly RenderSeat[];
  /** The total, when every selected seat is priced. */
  total?: Money;
  /** How many selected seats carry no price — a valid state (§4.9). */
  unpriced: number;
}

/**
 * Summarizes a selection: the seats, their total, and how many were unpriced.
 *
 * Exported instead of shipping a cart component — a cart carries far too many
 * product opinions for a rendering library. The total respects the currency's
 * minor-unit exponent via `formatMoney`; it is returned as `Money`, in minor
 * units, so no precision is lost on the way out.
 */
export function summarizeSelection(map: RenderMap, selection: readonly string[]): SelectionSummary {
  const selected = new Set(selection);
  const seats = [...map.seatsById.values()].filter((seat) => selected.has(seat.id));
  const prices = seats.map((s) => s.price).filter((p): p is Money => p !== undefined);

  return {
    seats,
    total: sumMoney(prices),
    unpriced: seats.length - prices.length,
  };
}
