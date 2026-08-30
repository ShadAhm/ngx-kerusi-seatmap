import { KerusiMap, Money, Seat } from './kerusi-map.model.js';

/**
 * Resolves the price of a seat following the precedence order in spec §4.9,
 * stopping at the first match:
 *
 *   1. `Seat.price` — a literal override.
 *   2. The `PriceTier` referenced by `Seat.priceTier`.
 *   3. The `PriceTier` referenced by `SeatType.defaultPriceTier` (via `Seat.type`).
 *   4. None of the above — the seat is unpriced. This is a valid, terminal
 *      state (general admission, free events).
 *
 * Returns `undefined` for an unpriced seat. This function does not validate
 * that referenced ids resolve — use {@link validateKerusiMap} for that; here an
 * unresolvable reference simply falls through to the next step.
 */
export function resolveSeatPrice(seat: Seat, map: KerusiMap): Money | undefined {
  // 1. Literal override.
  if (seat.price) {
    return seat.price;
  }

  // 2. Explicit price tier on the seat.
  if (seat.priceTier) {
    const tier = findPriceTier(map, seat.priceTier);
    if (tier) {
      return tier.price;
    }
  }

  // 3. Default price tier of the seat's type.
  const seatType = map.legend.find((t) => t.id === seat.type);
  if (seatType?.defaultPriceTier) {
    const tier = findPriceTier(map, seatType.defaultPriceTier);
    if (tier) {
      return tier.price;
    }
  }

  // 4. Unpriced.
  return undefined;
}

function findPriceTier(map: KerusiMap, id: string) {
  return map.priceTiers?.find((t) => t.id === id);
}

/**
 * The price of a named tier, for rendering a legend or a price key. Returns
 * `undefined` when the tier does not resolve.
 */
export function resolveTierPrice(map: KerusiMap, tierId: string | undefined): Money | undefined {
  return tierId ? findPriceTier(map, tierId)?.price : undefined;
}
