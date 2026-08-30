import { KerusiMap, KerusiSession, KerusiState, Seat } from '@kerusiweb/core';

/**
 * Two carriages of an intercity train, each its own `Section`.
 *
 * Carriage A is airline-style rows; carriage B is table bays, where four seats
 * face each other around a table. The table is an `Element` spanning the row
 * between the facing pairs — a fixture that has to be drawn but cannot be
 * booked, which is exactly what §4.4 elements are for.
 */

/** An airline-style row: columns 1,2 | aisle | 4,5. */
function airlineRow(carriage: string, n: number, type: string): Seat[] {
  const cols = [1, 2, 4, 5];
  const letters = ['A', 'B', 'C', 'D'];
  return cols.map((col, i) => ({
    id: `${carriage}${n}${letters[i]}`,
    label: letters[i],
    row: `${carriage}${n}`,
    col,
    type,
    attributes: i === 0 || i === 3 ? ['window'] : ['aisle'],
  }));
}

/**
 * One half of a table bay: two seats either side of the aisle, sharing a table
 * with the bay opposite. `forward` seats face the direction of travel.
 */
function bayRow(carriage: string, n: number, type: string, forward: boolean): Seat[] {
  const cols = [1, 2, 4, 5];
  const letters = ['A', 'B', 'C', 'D'];
  return cols.map((col, i) => ({
    id: `${carriage}${n}${letters[i]}`,
    label: letters[i],
    row: `${carriage}${n}`,
    col,
    type,
    attributes: [
      i === 0 || i === 3 ? 'window' : 'aisle',
      'table',
      forward ? 'forward-facing' : 'rear-facing',
    ],
  }));
}

export const TRAIN_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'ets-platinum-set-7',
  name: 'ETS Platinum — Set 7',
  domain: 'train',
  locale: 'en',
  legend: [
    {
      id: 'standard',
      label: { en: 'Standard', ms: 'Biasa' },
      color: '#4f7f8f',
      defaultPriceTier: 'std',
    },
    {
      id: 'table',
      label: { en: 'Table bay', ms: 'Meja' },
      color: '#7f5f8f',
      defaultPriceTier: 'table',
    },
    {
      id: 'accessible',
      label: { en: 'Accessible', ms: 'Boleh Diakses' },
      color: '#c78a2e',
      defaultPriceTier: 'std',
    },
  ],
  priceTiers: [
    { id: 'std', label: 'Standard', price: { amount: 7900, currency: 'MYR' } },
    { id: 'table', label: 'Table bay', price: { amount: 9900, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'carriage-a',
      index: 1,
      label: { en: 'Carriage A', ms: 'Gerabak A' },
      layout: 'grid',
      rows: Array.from({ length: 5 }, (_, i) => ({
        id: `A${i + 1}`,
        label: `${i + 1}`,
        index: i,
      })),
      elements: [
        { id: 'a-door', kind: 'exit', label: 'Door', row: 'A1', col: 7 },
        { id: 'a-wc', kind: 'lavatory', label: 'WC', row: 'A5', col: 7 },
      ],
      seats: [
        ...airlineRow('A', 1, 'standard'),
        ...airlineRow('A', 2, 'standard'),
        ...airlineRow('A', 3, 'standard'),
        // Row 4 holds the accessible bay and its companion seat.
        {
          id: 'A4A',
          label: 'A',
          row: 'A4',
          col: 1,
          type: 'accessible',
          attributes: ['window'],
          companions: ['A4B'],
          accessibility: {
            wheelchairAccessible: true,
            transferArmrest: 'right',
            aisleChairCompatible: true,
            companionRequired: true,
          },
        },
        {
          id: 'A4B',
          label: 'B',
          row: 'A4',
          col: 2,
          type: 'accessible',
          attributes: ['aisle'],
          companions: ['A4A'],
          accessibility: { transferArmrest: 'both' },
        },
        { id: 'A4C', label: 'C', row: 'A4', col: 4, type: 'standard', attributes: ['aisle'] },
        { id: 'A4D', label: 'D', row: 'A4', col: 5, type: 'standard', attributes: ['window'] },
        ...airlineRow('A', 5, 'standard'),
      ],
    },
    {
      id: 'carriage-b',
      index: 2,
      label: { en: 'Carriage B — table bays', ms: 'Gerabak B — Meja' },
      layout: 'grid',
      // Seat rows and the empty rows between them, interleaved: each facing
      // pair is separated by a seatless row the table occupies (§4.2.2). A
      // table is a whole row of space here, not a fraction of one — §4.4.1
      // makes a grid span a positive integer count of cells, and §4.2.2 leaves
      // "what a row is worth in pixels" to the renderer.
      rows: [
        { id: 'B1', label: '1', index: 0 },
        { id: 'table-row-1', index: 1 },
        { id: 'B2', label: '2', index: 2 },
        { id: 'B3', label: '3', index: 3 },
        { id: 'table-row-2', index: 4 },
        { id: 'B4', label: '4', index: 5 },
        { id: 'B5', label: '5', index: 6 },
        { id: 'table-row-3', index: 7 },
        { id: 'B6', label: '6', index: 8 },
      ],
      elements: [
        // A table sits between each facing pair, spanning both sides of the aisle.
        { id: 'table-1', kind: 'table', label: 'Table', row: 'table-row-1', col: 1, width: 5 },
        { id: 'table-2', kind: 'table', label: 'Table', row: 'table-row-2', col: 1, width: 5 },
        { id: 'table-3', kind: 'table', label: 'Table', row: 'table-row-3', col: 1, width: 5 },
        { id: 'b-door', kind: 'exit', label: 'Door', row: 'B6', col: 7 },
      ],
      seats: [
        ...bayRow('B', 1, 'table', true),
        ...bayRow('B', 2, 'table', false),
        ...bayRow('B', 3, 'table', true),
        ...bayRow('B', 4, 'table', false),
        ...bayRow('B', 5, 'table', true),
        ...bayRow('B', 6, 'table', false),
      ],
    },
  ],
};

export const TRAIN_SESSION: KerusiSession = {
  kerusi: '1.0',
  id: 'ets9422-2026-08-21',
  mapId: 'ets-platinum-set-7',
  label: 'ETS9422 KL Sentral → Ipoh, 21 Aug 2026',
  startsAt: '2026-08-21T07:40:00+08:00',
};

export const TRAIN_STATE: KerusiState = {
  kerusi: '1.0',
  sessionId: 'ets9422-2026-08-21',
  updatedAt: '2026-08-19T20:00:00+08:00',
  seats: {
    A1A: { status: 'booked' },
    A1B: { status: 'booked' },
    A2C: { status: 'booked' },
    A3D: { status: 'held', holdExpires: '2026-08-19T20:08:00+08:00' },
    A5A: { status: 'booked' },
    B1A: { status: 'booked' },
    B1B: { status: 'booked' },
    B2A: { status: 'booked' },
    B2B: { status: 'booked' },
    B4C: { status: 'blocked' },
    B4D: { status: 'blocked' },
  },
};
