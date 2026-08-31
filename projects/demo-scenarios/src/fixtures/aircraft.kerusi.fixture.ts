import { KerusiMap, KerusiSession, KerusiState, Seat } from '@kerusiweb/core';

/**
 * A narrow-body cabin in `grid` mode: two classes as separate sections, an
 * aisle expressed as a skipped column, exit rows, and lavatory and galley
 * elements placed in the cell grid.
 *
 * Exercises: grid positioning, multiple sections, grid-addressed elements,
 * `attributes` (window / aisle / exit-row / extra-legroom), and — the reason
 * this fixture exists — the §4.3.4 `accessibility` object on real seats.
 */

/** 2-2 business rows: columns 1,2 | aisle | 4,5. */
function businessRow(row: string): Seat[] {
  const cols = [1, 2, 4, 5];
  const letters = ['A', 'C', 'D', 'F'];
  return cols.map((col, i) => ({
    id: `${row}${letters[i]}`,
    label: letters[i],
    row,
    col,
    type: 'business',
    attributes: i === 0 || i === 3 ? ['window'] : ['aisle'],
  }));
}

/** 3-3 economy rows: columns 1,2,3 | aisle | 5,6,7. */
function economyRow(row: string, options: { exitRow?: boolean } = {}): Seat[] {
  const cols = [1, 2, 3, 5, 6, 7];
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  return cols.map((col, i) => {
    const attributes: string[] = [];
    if (i === 0 || i === 5) {
      attributes.push('window');
    }
    if (i === 2 || i === 3) {
      attributes.push('aisle');
    }
    if (options.exitRow) {
      attributes.push('exit-row', 'extra-legroom');
    }
    return {
      id: `${row}${letters[i]}`,
      label: letters[i],
      row,
      col,
      type: options.exitRow ? 'economy-plus' : 'economy',
      attributes,
    };
  });
}

export const AIRCRAFT_MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'mh-738-v2',
  name: 'Boeing 737-800',
  domain: 'flight',
  locale: 'en',
  legend: [
    {
      id: 'business',
      label: { en: 'Business', ms: 'Perniagaan' },
      color: '#2f6f9f',
      defaultPriceTier: 'biz',
    },
    {
      id: 'economy-plus',
      label: { en: 'Economy Plus', ms: 'Ekonomi Plus' },
      color: '#3f8f76',
      defaultPriceTier: 'plus',
    },
    {
      id: 'economy',
      label: { en: 'Economy', ms: 'Ekonomi' },
      color: '#5f9f52',
      defaultPriceTier: 'eco',
    },
    {
      id: 'accessible',
      label: { en: 'Accessible', ms: 'Boleh Diakses' },
      color: '#c78a2e',
      defaultPriceTier: 'eco',
    },
  ],
  priceTiers: [
    { id: 'biz', label: 'Business', price: { amount: 128000, currency: 'MYR' } },
    { id: 'plus', label: 'Economy Plus', price: { amount: 21000, currency: 'MYR' } },
    { id: 'eco', label: 'Economy', price: { amount: 14000, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'business',
      index: 1,
      label: { en: 'Business cabin', ms: 'Kabin Perniagaan' },
      layout: 'grid',
      rows: [
        { id: '1', label: '1', index: 0 },
        { id: '2', label: '2', index: 1 },
        { id: '3', label: '3', index: 2 },
      ],
      elements: [
        { id: 'galley-fwd', kind: 'galley', label: 'Galley', row: '1', col: 7, width: 2 },
        { id: 'lav-fwd', kind: 'lavatory', label: 'WC', row: '3', col: 7, width: 2 },
      ],
      seats: [...businessRow('1'), ...businessRow('2'), ...businessRow('3')],
    },
    {
      id: 'economy',
      index: 2,
      label: { en: 'Economy cabin', ms: 'Kabin Ekonomi' },
      layout: 'grid',
      rows: [
        { id: '10', label: '10', index: 0 },
        { id: '11', label: '11', index: 1 },
        { id: '12', label: '12', index: 2 },
        { id: '13', label: '13', index: 3 },
        { id: '14', label: '14', index: 4 },
        { id: '15', label: '15', index: 5 },
        { id: '16', label: '16', index: 6 },
      ],
      elements: [
        // The exit rows: doors either side of row 12.
        { id: 'exit-l', kind: 'exit', label: 'EXIT', row: '12', col: 0 },
        { id: 'exit-r', kind: 'exit', label: 'EXIT', row: '12', col: 8 },
        { id: 'lav-aft-l', kind: 'lavatory', label: 'WC', row: '16', col: 0 },
        { id: 'lav-aft-r', kind: 'lavatory', label: 'WC', row: '16', col: 8 },
      ],
      seats: [
        ...economyRow('10'),
        ...economyRow('11'),
        ...economyRow('12', { exitRow: true }),
        ...economyRow('13', { exitRow: true }),
        ...economyRow('14'),
        // Row 15 carries the accessible pair: an aisle seat with a lifting
        // armrest and the companion seat it must be booked with (§4.3.4/§4.6).
        {
          id: '15A',
          label: 'A',
          row: '15',
          col: 1,
          type: 'economy',
          attributes: ['window'],
        },
        {
          id: '15B',
          label: 'B',
          row: '15',
          col: 2,
          type: 'accessible',
          companions: ['15C'],
          accessibility: { companionRequired: true },
        },
        {
          id: '15C',
          label: 'C',
          row: '15',
          col: 3,
          type: 'accessible',
          attributes: ['aisle'],
          companions: ['15B'],
          accessibility: {
            wheelchairAccessible: true,
            transferArmrest: 'left',
            aisleChairCompatible: true,
            companionRequired: true,
          },
        },
        {
          id: '15D',
          label: 'D',
          row: '15',
          col: 5,
          type: 'accessible',
          attributes: ['aisle'],
          accessibility: {
            wheelchairAccessible: true,
            transferArmrest: 'right',
            aisleChairCompatible: true,
          },
        },
        { id: '15E', label: 'E', row: '15', col: 6, type: 'economy' },
        { id: '15F', label: 'F', row: '15', col: 7, type: 'economy', attributes: ['window'] },
        ...economyRow('16'),
      ],
    },
  ],
};

export const AIRCRAFT_SESSION: KerusiSession = {
  kerusi: '1.0',
  id: 'mh1234-2026-08-20',
  mapId: 'mh-738-v2',
  label: 'MH1234 KUL → SIN, 20 Aug 2026',
  startsAt: '2026-08-20T08:15:00+08:00',
};

export const AIRCRAFT_STATE: KerusiState = {
  kerusi: '1.0',
  sessionId: 'mh1234-2026-08-20',
  updatedAt: '2026-08-19T22:10:00+08:00',
  seats: {
    '1A': { status: 'booked' },
    '1C': { status: 'booked' },
    '2D': { status: 'booked' },
    '10A': { status: 'booked' },
    '10B': { status: 'booked' },
    '11F': { status: 'booked' },
    '12A': { status: 'held', holdExpires: '2026-08-19T22:25:00+08:00' },
    '13C': { status: 'booked' },
    '14D': { status: 'booked' },
    '16A': { status: 'blocked' },
    '16B': { status: 'blocked' },
    '16C': { status: 'blocked' },
  },
};
