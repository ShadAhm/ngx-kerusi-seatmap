import { KerusiMap, KerusiState, Seat } from 'ngx-kerusi-seatmap';

/**
 * A stadium bowl in `mixed` mode — the only mode in which a seat may carry both
 * addressing methods (§4.5).
 *
 * The stands wrap the pitch, so each seat needs `x`/`y` to sit on its arc and
 * an angle to face inward. But "the next seat along" still has to mean
 * something for a keyboard or a screen reader, and that is exactly what `col`
 * is for (§4.3.1): coordinates place the seat, `col` orders it.
 */

/**
 * A block of seats along a straight or angled stand.
 *
 * @param angle Degrees the stand is rotated about the pitch center.
 * @param radius Distance from the center, 0–50 (percent of the section).
 */
function stand(
  prefix: string,
  rows: number,
  seatsPerRow: number,
  angle: number,
  radius: number,
  type: string,
): Seat[] {
  const seats: Seat[] = [];
  const rad = (angle * Math.PI) / 180;
  // Unit vectors: `along` runs down the stand, `out` runs away from the pitch.
  const along = { x: Math.cos(rad), y: Math.sin(rad) };
  const out = { x: -Math.sin(rad), y: Math.cos(rad) };

  for (let r = 0; r < rows; r++) {
    // Later rows sit further from the pitch, not closer to it.
    const depth = radius - r * 4;
    for (let c = 0; c < seatsPerRow; c++) {
      const offset = (c - (seatsPerRow - 1) / 2) * 4.2;
      seats.push({
        id: `${prefix}-${r + 1}-${c + 1}`,
        label: `${c + 1}`,
        row: `${prefix}-${r + 1}`,
        // `col` is the adjacency ordinal, not a screen position.
        col: c + 1,
        x: 50 + along.x * offset + out.x * depth,
        y: 50 + along.y * offset + out.y * depth,
        rotation: angle + 180,
        type,
      });
    }
  }
  return seats;
}

export const STADIUM_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'stadium-bukit-jalil',
  name: 'Stadium Nasional Bukit Jalil',
  domain: 'stadium',
  locale: 'en',
  legend: [
    {
      id: 'main',
      label: { en: 'Main Stand', ms: 'Pentas Utama' },
      color: '#8f3a3a',
      defaultPriceTier: 'cat1',
    },
    {
      id: 'side',
      label: { en: 'Side Stand', ms: 'Pentas Tepi' },
      color: '#3a5f8f',
      defaultPriceTier: 'cat2',
    },
    {
      id: 'end',
      label: { en: 'End Stand', ms: 'Pentas Hujung' },
      color: '#3a8f5f',
      defaultPriceTier: 'cat3',
    },
  ],
  priceTiers: [
    { id: 'cat1', label: 'Category 1', price: { amount: 25000, currency: 'MYR' } },
    { id: 'cat2', label: 'Category 2', price: { amount: 15000, currency: 'MYR' } },
    { id: 'cat3', label: 'Category 3', price: { amount: 8000, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'bowl',
      index: 1,
      label: { en: 'Bowl', ms: 'Mangkuk' },
      layout: 'mixed',
      aspectRatio: '3:2',
      elements: [
        { id: 'pitch', kind: 'pitch', label: 'PITCH', x: 50, y: 50, width: 34, height: 40 },
        { id: 'gate-n', kind: 'exit', label: 'Gate N', x: 50, y: 3, width: 9, height: 4 },
        { id: 'gate-s', kind: 'exit', label: 'Gate S', x: 50, y: 97, width: 9, height: 4 },
      ],
      seats: [
        // North side, facing down toward the pitch.
        ...stand('N', 3, 14, 0, -28, 'main'),
        // South side, facing up.
        ...stand('S', 3, 14, 180, -28, 'side'),
        // East and west ends, rotated a quarter turn.
        ...stand('E', 2, 9, 90, -30, 'end'),
        ...stand('W', 2, 9, 270, -30, 'end'),
      ],
    },
  ],
};

export const STADIUM_STATE: KerusiState = {
  kerusi: '1.0',
  mapId: 'stadium-bukit-jalil',
  updatedAt: '2026-08-19T12:00:00+08:00',
  seats: {
    'N-1-6': { status: 'booked' },
    'N-1-7': { status: 'booked' },
    'N-1-8': { status: 'booked' },
    'N-1-9': { status: 'booked' },
    'N-2-7': { status: 'booked' },
    'N-2-8': { status: 'held', holdExpires: '2026-08-19T12:10:00+08:00' },
    'S-1-3': { status: 'booked' },
    'S-2-11': { status: 'booked' },
    'E-1-1': { status: 'blocked' },
    'E-1-9': { status: 'blocked' },
    'W-1-5': { status: 'booked' },
  },
};
