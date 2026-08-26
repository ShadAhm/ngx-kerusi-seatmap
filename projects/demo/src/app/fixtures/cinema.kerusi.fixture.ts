import { KerusiMap, KerusiSession, KerusiState } from 'ngx-kerusi-seatmap';

/**
 * A cinema hall in `grid` mode: straight rows split by two aisles into a
 * left wing, a center block, and a right wing — the classic printed seating
 * chart, not a curved auditorium. The back row is love seats, linked in
 * symmetric `companions` pairs so they book together.
 *
 * Exercises: grid positioning, multiple sections-worth of column reuse via
 * skipped aisle columns, a screen addressed by col with a percentage `y`
 * sitting it in the headroom the grid reserves above row A, price tiers,
 * companions, and all four availability states.
 */

/** A 12-seat standard row: two-seat wings at cols 1–2 / 13–14, an 8-seat
 * center block at cols 4–11, aisles at the skipped columns either side. */
function standardRow(row: string, type: string): KerusiMap['sections'][number]['seats'] {
  const cols = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14];
  return cols.map((col, i) => ({
    id: `${row}${i + 1}`,
    label: `${i + 1}`,
    row,
    col,
    type,
  }));
}

export const CINEMA_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'gsc-hall-3',
  name: 'GSC Mid Valley — Hall 3',
  domain: 'cinema',
  locale: 'en',
  legend: [
    {
      id: 'standard',
      label: { en: 'Standard', ms: 'Biasa' },
      color: '#3a8f63',
      defaultPriceTier: 'regular',
    },
    {
      id: 'premium',
      label: { en: 'Premium', ms: 'Premium' },
      color: '#2f6f9f',
      defaultPriceTier: 'premium',
    },
    {
      id: 'sofa',
      label: { en: 'Love seat', ms: 'Kerusi Berdua' },
      color: '#9a5fa8',
      defaultPriceTier: 'sofa',
    },
    {
      id: 'wheelchair',
      label: { en: 'Wheelchair space', ms: 'Ruang Kerusi Roda' },
      color: '#c78a2e',
      defaultPriceTier: 'regular',
    },
  ],
  priceTiers: [
    { id: 'regular', label: 'Regular', price: { amount: 1800, currency: 'MYR' } },
    { id: 'premium', label: 'Premium', price: { amount: 2600, currency: 'MYR' } },
    { id: 'sofa', label: 'Love seat', price: { amount: 5200, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'house',
      label: { en: 'Hall 3', ms: 'Dewan 3' },
      layout: 'grid',
      rows: [
        { id: 'A', label: 'A', index: 0 },
        { id: 'B', label: 'B', index: 1 },
        { id: 'C', label: 'C', index: 2 },
        { id: 'D', label: 'D', index: 3 },
        { id: 'E', label: 'E', index: 4 },
        { id: 'L', label: 'L', index: 5 },
      ],
      elements: [
        {
          id: 'screen',
          kind: 'screen',
          label: 'SCREEN',
          // `col` places it on the grid horizontally, same as a seat. There is
          // no seatless row to anchor it to vertically (§4.2 — rows are
          // seat-derived), so `y` — a percentage of the section canvas, since
          // no `row` is given — sits it near the top, inside the band the
          // scenario's `headroomRows` reserves above row A. `width`/`height`
          // stay cell-span units regardless (§ computeGridLayout); the arc
          // bulges a further `height * 1.6` toward the seats (§ screenPath).
          col: 1,
          y: 9,
          width: 14,
          height: 0.55,
        },
        { id: 'exit-left', kind: 'exit', label: 'EXIT', row: 'L', col: 0 },
        { id: 'exit-right', kind: 'exit', label: 'EXIT', row: 'L', col: 15 },
      ],
      seats: [
        ...standardRow('A', 'standard'),
        ...standardRow('B', 'standard'),
        ...standardRow('C', 'premium'),
        ...standardRow('D', 'premium'),
        // Row E leaves a wheelchair bay at each end, with its companion seat.
        {
          id: 'E1',
          label: '1',
          row: 'E',
          col: 1,
          type: 'wheelchair',
          companions: ['E2'],
          attributes: ['aisle'],
          accessibility: {
            wheelchairAccessible: true,
            transferArmrest: 'right',
            aisleChairCompatible: true,
            companionRequired: true,
          },
        },
        { id: 'E2', label: '2', row: 'E', col: 2, type: 'premium', companions: ['E1'] },
        { id: 'E3', label: '3', row: 'E', col: 4, type: 'premium' },
        { id: 'E4', label: '4', row: 'E', col: 5, type: 'premium' },
        { id: 'E5', label: '5', row: 'E', col: 6, type: 'premium' },
        { id: 'E6', label: '6', row: 'E', col: 7, type: 'premium' },
        { id: 'E7', label: '7', row: 'E', col: 8, type: 'premium' },
        { id: 'E8', label: '8', row: 'E', col: 10, type: 'premium', companions: ['E9'] },
        {
          id: 'E9',
          label: '9',
          row: 'E',
          col: 11,
          type: 'wheelchair',
          companions: ['E8'],
          attributes: ['aisle'],
          accessibility: {
            wheelchairAccessible: true,
            transferArmrest: 'left',
            aisleChairCompatible: true,
            companionRequired: true,
          },
        },
        // Love seats: three symmetric pairs, an aisle gap between each pair.
        { id: 'L1', label: '1', row: 'L', col: 4, type: 'sofa', companions: ['L2'] },
        { id: 'L2', label: '2', row: 'L', col: 5, type: 'sofa', companions: ['L1'] },
        { id: 'L3', label: '3', row: 'L', col: 7, type: 'sofa', companions: ['L4'] },
        { id: 'L4', label: '4', row: 'L', col: 8, type: 'sofa', companions: ['L3'] },
        { id: 'L5', label: '5', row: 'L', col: 10, type: 'sofa', companions: ['L6'] },
        { id: 'L6', label: '6', row: 'L', col: 11, type: 'sofa', companions: ['L5'] },
      ],
    },
  ],
};

export const CINEMA_SESSION: KerusiSession = {
  kerusi: '1.0',
  id: 'gsc-hall-3-2026-08-19-1930',
  mapId: 'gsc-hall-3',
  label: 'Dune: Part Three — 7:30pm',
  startsAt: '2026-08-19T19:30:00+08:00',
};

export const CINEMA_STATE: KerusiState = {
  kerusi: '1.0',
  sessionId: 'gsc-hall-3-2026-08-19-1930',
  updatedAt: '2026-08-19T18:42:00+08:00',
  // Sparse (§5.1): every seat not listed here is available.
  seats: {
    C4: { status: 'booked' },
    C5: { status: 'booked' },
    C6: { status: 'booked' },
    D6: { status: 'booked' },
    D7: { status: 'booked' },
    B3: { status: 'held', holdExpires: '2026-08-19T18:52:00+08:00' },
    B4: { status: 'held', holdExpires: '2026-08-19T18:52:00+08:00' },
    L3: { status: 'booked' },
    L4: { status: 'booked' },
    A1: { status: 'blocked' },
    A10: { status: 'blocked' },
  },
};
