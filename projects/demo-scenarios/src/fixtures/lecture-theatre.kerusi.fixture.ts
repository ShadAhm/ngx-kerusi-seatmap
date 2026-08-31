import { KerusiMap, KerusiState, Seat } from '@kerusiweb/core';

/**
 * An end-stage lecture theatre in `freeform` mode: rows are concentric arcs
 * around a focal point just above the screen, each seat rotated to face it.
 * Because seat pitch (not seat count) stays constant along an arc, a row
 * further from the screen has a longer arc at the same radius step and so
 * holds more seats — the fan widens toward the back, the way a real raked
 * lecture theatre does.
 *
 * Exercises: freeform positioning, per-seat `rotation` derived from real
 * polar geometry (not a hand-tuned curve), and an accessible pair at each
 * end of the back row.
 */

/**
 * `Seat.x`/`y` are percent of the section box, and that box is 16:9 — wider
 * than it is tall. A circle plotted directly in percent space would render
 * as an ellipse, squashed by the same 16:9 factor, and every seat pitch
 * along a row would come out short of what it was designed to be. So the
 * geometry below works in absolute viewBox units (matching `seatSize`, which
 * is also absolute) and only converts to percent at the end, once per axis.
 */
const FREEFORM_BASIS = 1000;
const ASPECT_RATIO = 16 / 9;
const SCALE_X = FREEFORM_BASIS / 100;
const SCALE_Y = FREEFORM_BASIS / ASPECT_RATIO / 100;

/** The point every row curves around, just above the screen. */
const FOCAL_X = 500;
const FOCAL_Y = 40;

/** Half the angle a row sweeps, either side of straight down from the focal point. */
const HALF_ANGLE = 60;

/** Row-to-row distance from the focal point, and how much seat pitch that's
 * worth against the 26-unit seat box (§ scenarios.ts `seatSize: 26`) — loose
 * enough that a row reads as individual seats, not a packed bench. */
const FIRST_RADIUS = 130;
const ROW_STEP = 56;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * One arc of seats at a fixed radius, evenly spaced by angle and rotated to
 * face the focal point.
 */
function row(rowId: string, rowIndex: number, count: number, type: string): Seat[] {
  const radius = FIRST_RADIUS + rowIndex * ROW_STEP;
  const seats: Seat[] = [];
  for (let i = 0; i < count; i++) {
    // -1 at the left edge, +1 at the right.
    const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
    const angleDeg = t * HALF_ANGLE;
    const angleRad = (angleDeg * Math.PI) / 180;
    seats.push({
      id: `${rowId}${i + 1}`,
      label: `${i + 1}`,
      row: rowId,
      x: round((FOCAL_X + radius * Math.sin(angleRad)) / SCALE_X),
      y: round((FOCAL_Y + radius * Math.cos(angleRad)) / SCALE_Y),
      // Cancels the seat's own angle around the focal point, so it faces
      // straight at it regardless of where along the arc it sits.
      rotation: round(-angleDeg),
      type,
    });
  }
  return seats;
}

// The back row's two aisle seats are wheelchair-accessible, each with its
// required companion seat beside it (§4.3.4/§4.6).
const backRow = row('F', 5, 23, 'standard');
backRow[0] = {
  ...backRow[0],
  type: 'accessible',
  companions: ['F2'],
  attributes: ['aisle'],
  accessibility: {
    wheelchairAccessible: true,
    transferArmrest: 'right',
    aisleChairCompatible: true,
    companionRequired: true,
  },
};
backRow[1] = { ...backRow[1], companions: ['F1'] };
backRow[21] = { ...backRow[21], companions: ['F23'] };
backRow[22] = {
  ...backRow[22],
  type: 'accessible',
  companions: ['F22'],
  attributes: ['aisle'],
  accessibility: {
    wheelchairAccessible: true,
    transferArmrest: 'left',
    aisleChairCompatible: true,
    companionRequired: true,
  },
};

export const LECTURE_THEATRE_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'feng-lt1',
  name: 'Faculty of Engineering — Lecture Theatre 1',
  domain: 'theatre',
  locale: 'en',
  legend: [
    {
      id: 'standard',
      label: { en: 'Standard', ms: 'Biasa' },
      color: '#3a6f8f',
      defaultPriceTier: 'standard',
    },
    {
      id: 'accessible',
      label: { en: 'Accessible', ms: 'Boleh Diakses' },
      color: '#c78a2e',
      defaultPriceTier: 'standard',
    },
  ],
  priceTiers: [{ id: 'standard', label: 'Standard', price: { amount: 0, currency: 'MYR' } }],
  sections: [
    {
      id: 'main',
      label: 'Lecture Theatre 1',
      layout: 'freeform',
      aspectRatio: '16:9',
      rows: [
        { id: 'A', label: 'A', index: 0 },
        { id: 'B', label: 'B', index: 1 },
        { id: 'C', label: 'C', index: 2 },
        { id: 'D', label: 'D', index: 3 },
        { id: 'E', label: 'E', index: 4 },
        { id: 'F', label: 'F', index: 5 },
      ],
      elements: [
        {
          id: 'screen',
          kind: 'screen',
          label: 'PROJECTION SCREEN',
          x: 50,
          y: 2,
          width: 40,
          height: 4,
        },
        { id: 'exit-left', kind: 'exit', label: 'EXIT', x: 9, y: 46, width: 7, height: 4 },
        { id: 'exit-right', kind: 'exit', label: 'EXIT', x: 91, y: 46, width: 7, height: 4 },
      ],
      seats: [
        ...row('A', 0, 8, 'standard'),
        ...row('B', 1, 11, 'standard'),
        ...row('C', 2, 14, 'standard'),
        ...row('D', 3, 17, 'standard'),
        ...row('E', 4, 20, 'standard'),
        ...backRow,
      ],
    },
  ],
};

export const LECTURE_THEATRE_STATE: KerusiState = {
  kerusi: '1.0',
  mapId: 'feng-lt1',
  updatedAt: '2026-08-20T09:00:00+08:00',
  // Sparse (§5.1): every seat not listed here is available.
  seats: {
    C6: { status: 'booked' },
    C7: { status: 'booked' },
    C8: { status: 'booked' },
    D9: { status: 'booked' },
    D10: { status: 'booked' },
    D11: { status: 'held', holdExpires: '2026-08-20T09:20:00+08:00' },
    D12: { status: 'held', holdExpires: '2026-08-20T09:20:00+08:00' },
    E4: { status: 'blocked' },
    E17: { status: 'blocked' },
    A1: { status: 'booked' },
    A8: { status: 'booked' },
  },
};
