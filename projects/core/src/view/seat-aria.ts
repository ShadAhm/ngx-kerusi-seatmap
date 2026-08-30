import { formatMoney } from '../kerusi/kerusi-locale.js';
import { RenderSeat } from '../render/render-model.js';
import { DisallowedReason } from './selection.js';

/**
 * What a screen reader says about a seat.
 *
 * The pre-1.0 renderer drew seats as bare clickable `<g>` elements with no
 * accessible name at all, so everything the document knew about a seat — its
 * type, its price, whether it was even bookable, and every §4.3.4 accessibility
 * property — was invisible to anyone not looking at the picture.
 *
 * Selection state is deliberately absent from the label: it rides on
 * `aria-pressed`, and repeating it here would make every toggle announce twice.
 */

/** Strings a caller may translate. Defaults are English. */
export interface SeatAriaStrings {
  rowSeat: (row: string, seat: string) => string;
  seatOnly: (seat: string) => string;
  noPrice: string;
  available: string;
  booked: string;
  held: string;
  heldUntil: (time: string) => string;
  blocked: string;
  wheelchairAccessible: string;
  transferArmrest: (side: string) => string;
  aisleChairCompatible: string;
  companionRequired: string;
  /** How a selection total is announced. */
  selectionSummary: (count: number, total: string) => string;
  selectionEmpty: string;
  disallowed: Record<DisallowedReason, string>;
}

export const DEFAULT_SEAT_ARIA_STRINGS: SeatAriaStrings = {
  rowSeat: (row, seat) => `Row ${row}, seat ${seat}`,
  seatOnly: (seat) => `Seat ${seat}`,
  noPrice: 'no price',
  available: 'available',
  booked: 'booked, unavailable',
  held: 'on hold, unavailable',
  heldUntil: (time) => `on hold until ${time}, unavailable`,
  blocked: 'blocked by the venue, unavailable',
  wheelchairAccessible: 'wheelchair accessible',
  transferArmrest: (side) => `transfer armrest ${side}`,
  aisleChairCompatible: 'aisle chair compatible',
  companionRequired: 'companion seat required',
  selectionSummary: (count, total) =>
    `${count} ${count === 1 ? 'seat' : 'seats'} selected${total ? `, ${total} total` : ''}`,
  selectionEmpty: 'No seats selected',
  disallowed: {
    booked: 'is already booked',
    held: 'is held by another customer',
    blocked: 'is blocked by the venue',
    'not-selectable': 'cannot be selected',
    'max-selection': 'would exceed the seat limit',
    'companion-unavailable': 'must be booked with a seat that is unavailable',
  },
};

/**
 * Builds a seat's accessible name, in the order a listener needs it: where the
 * seat is, what kind it is, what it costs, whether it can be had, what
 * accessibility it offers, and finally its descriptive tags.
 */
export function seatAriaLabel(
  seat: RenderSeat,
  locale: string,
  strings: SeatAriaStrings = DEFAULT_SEAT_ARIA_STRINGS,
): string {
  const parts: string[] = [];

  parts.push(
    seat.rowLabel ? strings.rowSeat(seat.rowLabel, seat.label) : strings.seatOnly(seat.label),
  );

  if (seat.typeLabel && seat.typeLabel !== seat.type.id) {
    parts.push(seat.typeLabel);
  } else if (seat.type.id) {
    parts.push(seat.type.id);
  }

  parts.push(seat.price ? formatMoney(seat.price, locale) : strings.noPrice);
  parts.push(statusPhrase(seat, locale, strings));
  parts.push(...accessibilityPhrases(seat, strings));

  if (seat.attributes.length > 0) {
    parts.push(seat.attributes.join(', '));
  }

  return parts.filter(Boolean).join(', ') + '.';
}

function statusPhrase(seat: RenderSeat, locale: string, strings: SeatAriaStrings): string {
  switch (seat.status) {
    case 'booked':
      return strings.booked;
    case 'blocked':
      return strings.blocked;
    case 'held':
      return seat.holdExpires
        ? strings.heldUntil(formatTime(seat.holdExpires, locale))
        : strings.held;
    default:
      return strings.available;
  }
}

/** Every §4.3.4 property the seat declares, as phrases. */
function accessibilityPhrases(seat: RenderSeat, strings: SeatAriaStrings): string[] {
  const a11y = seat.accessibility;
  if (!a11y) {
    return [];
  }

  const phrases: string[] = [];
  if (a11y.wheelchairAccessible) {
    phrases.push(strings.wheelchairAccessible);
  }
  if (a11y.transferArmrest) {
    phrases.push(strings.transferArmrest(a11y.transferArmrest));
  }
  if (a11y.aisleChairCompatible) {
    phrases.push(strings.aisleChairCompatible);
  }
  if (a11y.companionRequired) {
    phrases.push(strings.companionRequired);
  }
  return phrases;
}

/** A hold expiry as a local clock time; falls back to the raw value. */
export function formatTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  try {
    return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(date);
  } catch {
    return date.toISOString();
  }
}

/** The live-region announcement when a seat cannot be selected. */
export function disallowedAnnouncement(
  seat: RenderSeat,
  reason: DisallowedReason,
  strings: SeatAriaStrings = DEFAULT_SEAT_ARIA_STRINGS,
): string {
  const where = seat.rowLabel
    ? strings.rowSeat(seat.rowLabel, seat.label)
    : strings.seatOnly(seat.label);
  return `${where} ${strings.disallowed[reason]}.`;
}
