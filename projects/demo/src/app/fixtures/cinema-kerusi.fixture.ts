import { KerusiMap, KerusiState, Seat } from '@kerusiweb/core';

// An "everything" cinema expressed in the Kerusi Seat Map & Availability
// Format. It exercises the capabilities the plain grid demo cannot show:
// non-bookable elements (screen + exits), freeform x/y placement with per-seat
// rotation (the fan curve), multiple seat types and price tiers, companion
// (couple) seats, accessible seats, aisles as simple absences, and the full
// availability vocabulary. The demo feeds it through `buildRenderModel` — the
// same path any Kerusi document would take.

const STANDARD_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const LOVE_ROW = 'H';

/** Slots per row, including the two skipped for aisles. */
const SLOTS = 16;
/** Slot indices left empty to form the two aisles (§4.3.2: no filler objects). */
const AISLE_SLOTS = new Set([3, 12]);

const HALF_WIDTH = 33.75; // horizontal spread either side of center (x = 50) — tuned so seat pitch matches the row pitch, keeping seats close with no gaps
const FIRST_ROW_Y = 22; // first row, at its outer ends
const ROW_STEP = 8; // vertical gap between rows
const CURVE_DEPTH = 6; // how much further from the screen a row's center sits
const LOVE_ROW_Y = 82;

/**
 * A virtual focal point above the screen that every seat turns to face. It sits
 * well beyond the screen itself so the fan stays subtle (~22° at the front
 * corners) rather than splaying the front row outward.
 */
const FOCAL_Y = -70;

/** Normalized offset of a slot within its row: -1 (far left) .. +1 (far right). */
function offsetOf(slot: number): number {
  return (slot - (SLOTS - 1) / 2) / ((SLOTS - 1) / 2);
}

function xOf(slot: number): number {
  return round(50 + offsetOf(slot) * HALF_WIDTH);
}

/**
 * Seats arc *around* the screen: a row's center is its furthest point and the
 * ends wrap back toward the screen, so the row is concave toward the front.
 */
function yOf(slot: number, baseY: number): number {
  const t = offsetOf(slot);
  return round(baseY + CURVE_DEPTH * (1 - t * t));
}

/** Degrees to turn a seat so it faces {@link FOCAL_Y} above the screen. */
function rotationOf(x: number, y: number): number {
  return round((Math.atan2(50 - x, y - FOCAL_Y) * 180) / Math.PI);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function seatAt(id: string, label: string, row: string, slot: number, baseY: number) {
  const x = xOf(slot);
  const y = yOf(slot, baseY);
  return { id, label, row, x, y, rotation: rotationOf(x, y) };
}

/** One arc of standard seats, with accessible spaces at the ends of row G. */
function standardRow(row: string, rowIndex: number): Seat[] {
  const baseY = FIRST_ROW_Y + rowIndex * ROW_STEP;
  const isBackRow = rowIndex === STANDARD_ROWS.length - 1;
  const seats: Seat[] = [];
  let seatNumber = 0;

  for (let slot = 0; slot < SLOTS; slot++) {
    if (AISLE_SLOTS.has(slot)) {
      continue; // the aisle is simply an absent seat
    }
    seatNumber++;
    const accessible = isBackRow && (slot === 0 || slot === SLOTS - 1);
    seats.push({
      ...seatAt(`${row}${seatNumber}`, `${seatNumber}`, row, slot, baseY),
      type: accessible ? 'wheelchair' : 'standard',
      ...(accessible ? { attributes: ['wheelchair', 'aisle'] } : {}),
    });
  }

  return seats;
}

/** Three couple recliners at the back, each pair linked by `companions`. */
function loveSeatRow(): Seat[] {
  const pairs: [number, number][] = [
    [3, 4],
    [7, 8],
    [11, 12],
  ];

  return pairs.flatMap(([leftSlot, rightSlot], pairIndex) => {
    const leftNumber = pairIndex * 2 + 1;
    const rightNumber = leftNumber + 1;
    const leftId = `${LOVE_ROW}${leftNumber}`;
    const rightId = `${LOVE_ROW}${rightNumber}`;
    return [
      {
        ...seatAt(leftId, `${leftNumber}`, LOVE_ROW, leftSlot, LOVE_ROW_Y),
        type: 'recliner-couple',
        companions: [rightId],
      },
      {
        ...seatAt(rightId, `${rightNumber}`, LOVE_ROW, rightSlot, LOVE_ROW_Y),
        type: 'recliner-couple',
        companions: [leftId],
      },
    ];
  });
}

export const CINEMA_KERUSI_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'demo-cinema-hallA',
  name: 'Hall A — curved auditorium',
  domain: 'cinema',
  locale: 'en',
  legend: [
    { id: 'standard', label: 'Standard', defaultPriceTier: 'regular' },
    { id: 'wheelchair', label: 'Accessible', defaultPriceTier: 'accessible' },
    { id: 'recliner-couple', label: 'Couple Recliner', defaultPriceTier: 'premium' },
  ],
  priceTiers: [
    { id: 'regular', label: 'Regular', price: { amount: 1500, currency: 'MYR' } },
    { id: 'accessible', label: 'Accessible', price: { amount: 1000, currency: 'MYR' } },
    { id: 'premium', label: 'Premium', price: { amount: 4500, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'main',
      label: 'Main floor',
      layout: 'freeform',
      aspectRatio: '16:9',
      rows: [
        ...STANDARD_ROWS.map((id, index) => ({ id, label: id, index })),
        { id: LOVE_ROW, label: 'H (Love Seats)', index: STANDARD_ROWS.length },
      ],
      elements: [
        { id: 'screen', kind: 'screen', label: 'SCREEN', x: 50, y: 5, width: 74, height: 5 },
        { id: 'exit-left', kind: 'exit', label: 'EXIT', x: 6, y: 95, width: 9, height: 4 },
        { id: 'exit-right', kind: 'exit', label: 'EXIT', x: 94, y: 95, width: 9, height: 4 },
      ],
      seats: [...STANDARD_ROWS.flatMap((row, index) => standardRow(row, index)), ...loveSeatRow()],
    },
  ],
};

// Sparse availability — everything not listed defaults to available (§5.1).
// A mix of booked, held, and blocked so every state is visible at once.
export const CINEMA_KERUSI_STATE: KerusiState = {
  kerusi: '1.0',
  mapId: 'demo-cinema-hallA',
  updatedAt: '2026-08-17T09:14:00Z',
  seats: {
    // sold
    C6: { status: 'booked' },
    C7: { status: 'booked' },
    C8: { status: 'booked' },
    D7: { status: 'booked' },
    D8: { status: 'booked' },
    E5: { status: 'booked' },
    E6: { status: 'booked' },
    // a couple recliner sold as a unit
    H3: { status: 'booked' },
    H4: { status: 'booked' },
    // in someone else's cart right now
    F9: { status: 'held', holdExpires: '2026-08-17T09:24:00Z' },
    F10: { status: 'held', holdExpires: '2026-08-17T09:24:00Z' },
    // withheld by the venue (broken seats / restricted view)
    A1: { status: 'blocked' },
    A14: { status: 'blocked' },
    B2: { status: 'blocked' },
  },
};
