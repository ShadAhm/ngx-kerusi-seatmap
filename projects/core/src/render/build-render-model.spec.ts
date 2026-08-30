import { describe, expect, it } from 'vitest';
import { KerusiMap } from '../kerusi/kerusi-map.model.js';
import { KerusiState } from '../kerusi/kerusi-state.model.js';
import {
  BUS_MAP,
  CINEMA_GRID_MAP,
  CINEMA_MAP,
  CINEMA_STATE_BY_MAP,
} from '../kerusi/kerusi-examples.fixture.js';
import { buildRenderModel } from './build-render-model.js';

/** A map with a grid balcony and a freeform stalls — the multi-section case. */
const MIXED_VENUE: KerusiMap = {
  kerusi: '1.0',
  id: 'venue',
  name: 'Dewan Filharmonik',
  locale: 'ms-MY',
  legend: [
    { id: 'standard', label: { en: 'Standard', 'ms-MY': 'Biasa' }, color: '#3a8f63' },
    { id: 'premium', label: { en: 'Premium' }, defaultPriceTier: 'top' },
  ],
  priceTiers: [
    { id: 'base', price: { amount: 5000, currency: 'MYR' } },
    { id: 'top', price: { amount: 12000, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'balcony',
      index: 2,
      label: { en: 'Balcony', 'ms-MY': 'Balkoni' },
      layout: 'grid',
      rows: [
        { id: 'B', label: 'Row B', index: 1 },
        { id: 'A', label: 'Row A', index: 0 },
      ],
      seats: [
        { id: 'B3', row: 'B', col: 3, type: 'standard', priceTier: 'base' },
        { id: 'A1', row: 'A', col: 1, type: 'standard', priceTier: 'base' },
        { id: 'B1', row: 'B', col: 1, type: 'standard', priceTier: 'base' },
      ],
      elements: [{ id: 'exit-b', kind: 'exit', label: 'Exit', row: 'B', col: 5 }],
    },
    {
      id: 'stalls',
      index: 1,
      label: { en: 'Stalls', 'ms-MY': 'Tempat Duduk Bawah' },
      layout: 'freeform',
      aspectRatio: '16:9',
      seats: [
        { id: 'S1', x: 40, y: 60, rotation: -6, type: 'premium' },
        { id: 'S2', x: 50, y: 62, type: 'premium' },
      ],
      elements: [{ id: 'stage', kind: 'stage', label: 'Stage', x: 50, y: 8, width: 60, height: 6 }],
    },
  ],
};

describe('buildRenderModel — sections survive as render units', () => {
  it('orders sections by Section.index, not declaration order', () => {
    const model = buildRenderModel(MIXED_VENUE);
    expect(model.sections.map((s) => s.id)).toEqual(['stalls', 'balcony']);
  });

  it('gives each section its OWN layout mode and aspect ratio', () => {
    // The pre-1.0 adapter collapsed a whole map to one mode and kept only the
    // last freeform section's ratio.
    const model = buildRenderModel(MIXED_VENUE);
    const [stalls, balcony] = model.sections;
    expect(stalls.layoutMode).toBe('freeform');
    expect(stalls.aspectRatio).toBe('16:9');
    expect(balcony.layoutMode).toBe('grid');
    expect(balcony.aspectRatio).toBe('1:1');
  });

  it('infers a section mode when layout is omitted', () => {
    const model = buildRenderModel(BUS_MAP);
    expect(model.sections[0].layoutMode).toBe('grid');
  });

  it('renders only the requested sections, in the requested order', () => {
    const model = buildRenderModel(MIXED_VENUE, undefined, {
      sectionIds: ['balcony', 'stalls'],
    });
    expect(model.sections.map((s) => s.id)).toEqual(['balcony', 'stalls']);
  });
});

describe('buildRenderModel — rows and seat order', () => {
  it('orders rows by RowMeta.index, not first appearance', () => {
    const balcony = buildRenderModel(MIXED_VENUE).sections[1];
    expect(balcony.rows.map((r) => r.id)).toEqual(['A', 'B']);
    expect(balcony.rows.map((r) => r.label)).toEqual(['Row A', 'Row B']);
  });

  it('orders seats within a grid row by col', () => {
    const balcony = buildRenderModel(MIXED_VENUE).sections[1];
    const rowB = balcony.rows.find((r) => r.id === 'B')!;
    expect(rowB.seats.map((s) => s.id)).toEqual(['B1', 'B3']);
  });

  it('does not synthesize a filler seat for the skipped column (§4.3.2)', () => {
    const balcony = buildRenderModel(MIXED_VENUE).sections[1];
    expect(balcony.seats.map((s) => s.id)).toEqual(['A1', 'B1', 'B3']);
  });

  it('gives each seat its row index, for vertical navigation', () => {
    const balcony = buildRenderModel(MIXED_VENUE).sections[1];
    expect(balcony.seats.map((s) => [s.id, s.rowIndex])).toEqual([
      ['A1', 0],
      ['B1', 1],
      ['B3', 1],
    ]);
  });

  it('groups rowless freeform seats into a single unnamed row', () => {
    const stalls = buildRenderModel(MIXED_VENUE).sections[0];
    expect(stalls.rows).toHaveLength(1);
    expect(stalls.rows[0].label).toBeUndefined();
    expect(stalls.seats.map((s) => s.id)).toEqual(['S1', 'S2']);
  });
});

describe('buildRenderModel — the row registry and empty rows (§4.2)', () => {
  const stalls = () => buildRenderModel(CINEMA_GRID_MAP).sections[0];

  it('materializes every declared row, including the ones no seat references', () => {
    // §7: a conformant consumer materializes every row a section declares. Rows
    // used to come from the seats, so these four vanished and the screen had
    // nowhere to sit.
    expect(stalls().rows.map((r) => r.id)).toEqual([
      'screen-1',
      'screen-2',
      'throw',
      'A',
      'B',
      'cross-aisle',
      'C',
    ]);
  });

  it('marks a row no seat references as empty, and leaves it seatless', () => {
    const empties = stalls().rows.filter((r) => r.empty);
    expect(empties.map((r) => r.id)).toEqual(['screen-1', 'screen-2', 'throw', 'cross-aisle']);
    expect(empties.every((r) => r.seats.length === 0)).toBe(true);
  });

  it('gives a seat the row index of its slot in the full registry', () => {
    // Row A is fourth, because three declared rows precede it — not first,
    // which is where a seat-derived list would have put it.
    expect(buildRenderModel(CINEMA_GRID_MAP).seatsById.get('A1')?.rowIndex).toBe(3);
  });

  it('anchors a row-addressed element to its empty row', () => {
    expect(stalls().elements[0].rowIndex).toBe(0);
  });

  it('orders unindexed rows after indexed ones, in declaration order (§4.2.1)', () => {
    const model = buildRenderModel({
      kerusi: '1.0',
      id: 'm',
      legend: [{ id: 'standard' }],
      sections: [
        {
          id: 's',
          layout: 'grid',
          rows: [{ id: 'late' }, { id: 'B', index: 11 }, { id: 'earlier' }, { id: 'A', index: 0 }],
          seats: [{ id: 'A1', row: 'A', col: 1, type: 'standard' }],
        },
      ],
    });
    // `index` is an ordering key, not a position: A and B are adjacent despite
    // the eleven-wide gap between their numbers.
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['A', 'B', 'late', 'earlier']);
  });

  it('keeps seat-derived rows when a section declares no registry', () => {
    // §4.6: with no `rows`, a seat's row is opaque free text and the rows are
    // exactly the ones the seats name, in first-appearance order.
    const rows = buildRenderModel(BUS_MAP).sections[0].rows;
    expect(rows.map((r) => r.id)).toEqual(['1']);
    expect(rows[0].empty).toBe(false);
  });

  it('still renders a seat whose row the registry does not declare', () => {
    // An `element-row-unresolved`-style §4.6 violation on the seat side. The
    // validator reports it; dropping the seat here would hide it instead.
    const model = buildRenderModel({
      kerusi: '1.0',
      id: 'm',
      legend: [{ id: 'standard' }],
      sections: [
        {
          id: 's',
          layout: 'grid',
          rows: [{ id: 'A', index: 0 }],
          seats: [
            { id: 'A1', row: 'A', col: 1, type: 'standard' },
            { id: 'Z1', row: 'Z', col: 1, type: 'standard' },
          ],
        },
      ],
    });
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['A', 'Z']);
    expect(model.seatsById.get('Z1')?.rowIndex).toBe(1);
  });
});

describe('buildRenderModel — direction labels (§4.10)', () => {
  const withDirections = (locale?: string) =>
    buildRenderModel(
      {
        kerusi: '1.0',
        id: 'm',
        locale: 'ms-MY',
        legend: [{ id: 'standard' }],
        sections: [
          {
            id: 'coach-b',
            layout: 'grid',
            directions: [
              {
                axis: 'row',
                low: { en: 'front of train', 'ms-MY': 'hadapan kereta api' },
                high: 'back of train',
              },
            ],
            seats: [{ id: '1A', row: '1', col: 1, type: 'standard' }],
          },
        ],
      },
      undefined,
      { locale },
    ).sections[0];

  it('localizes both ends against the map locale, as it does a section label', () => {
    expect(withDirections().directions).toEqual([
      { axis: 'row', low: 'hadapan kereta api', high: 'back of train' },
    ]);
  });

  it('honors a locale override', () => {
    expect(withDirections('en').directions?.[0].low).toBe('front of train');
  });

  it('is absent when the section declares none', () => {
    expect(buildRenderModel(BUS_MAP).sections[0].directions).toBeUndefined();
  });
});

describe('buildRenderModel — state merge (§5.1)', () => {
  it('treats a seat absent from the state as available', () => {
    const model = buildRenderModel(CINEMA_MAP, CINEMA_STATE_BY_MAP);
    const statuses = new Set([...model.seatsById.values()].map((s) => s.status));
    expect(statuses.has('available')).toBe(true);
  });

  it('merges each declared status by Seat.id', () => {
    const state: KerusiState = {
      kerusi: '1.0',
      mapId: 'venue',
      updatedAt: '2026-08-19T10:00:00Z',
      seats: {
        A1: { status: 'booked' },
        B1: { status: 'held', holdExpires: '2026-08-19T10:05:00Z' },
        B3: { status: 'blocked' },
      },
    };
    const model = buildRenderModel(MIXED_VENUE, state);
    expect(model.seatsById.get('A1')!.status).toBe('booked');
    expect(model.seatsById.get('B1')!.holdExpires).toBe('2026-08-19T10:05:00Z');
    expect(model.seatsById.get('B3')!.status).toBe('blocked');
    expect(model.seatsById.get('S1')!.status).toBe('available');
  });

  it('marks only available seats selectable by default', () => {
    const state: KerusiState = {
      kerusi: '1.0',
      mapId: 'venue',
      updatedAt: '2026-08-19T10:00:00Z',
      seats: { A1: { status: 'held' } },
    };
    const model = buildRenderModel(MIXED_VENUE, state);
    expect(model.seatsById.get('A1')!.selectable).toBe(false);
    expect(model.seatsById.get('B1')!.selectable).toBe(true);
  });

  it('honors a widened selectable-status set and a caller predicate', () => {
    const state: KerusiState = {
      kerusi: '1.0',
      mapId: 'venue',
      updatedAt: '2026-08-19T10:00:00Z',
      seats: { A1: { status: 'held' } },
    };
    expect(
      buildRenderModel(MIXED_VENUE, state, {
        selectableStatuses: ['available', 'held'],
      }).seatsById.get('A1')!.selectable,
    ).toBe(true);

    expect(
      buildRenderModel(MIXED_VENUE, undefined, {
        seatSelectable: (seat) => seat.type.id !== 'premium',
      }).seatsById.get('S1')!.selectable,
    ).toBe(false);
  });
});

describe('buildRenderModel — pricing (§4.9) and legend (§4.7)', () => {
  it('applies the price-resolution order per seat', () => {
    const model = buildRenderModel(MIXED_VENUE);
    // Seat.priceTier wins over the type default.
    expect(model.seatsById.get('A1')!.price).toEqual({ amount: 5000, currency: 'MYR' });
    // Falls through to SeatType.defaultPriceTier.
    expect(model.seatsById.get('S1')!.price).toEqual({ amount: 12000, currency: 'MYR' });
  });

  it('leaves an unpriced seat unpriced — a valid terminal state', () => {
    const model = buildRenderModel(BUS_MAP);
    expect(model.seatsById.get('1A')!.price).toBeUndefined();
  });

  it('resolves the map currency once', () => {
    expect(buildRenderModel(MIXED_VENUE).currency).toBe('MYR');
  });

  it('builds a legend with localized labels, colors, prices and seat counts', () => {
    const model = buildRenderModel(MIXED_VENUE);
    expect(model.legend).toEqual([
      {
        id: 'standard',
        label: 'Biasa',
        color: '#3a8f63',
        defaultTier: undefined,
        price: undefined,
        seatCount: 3,
      },
      {
        id: 'premium',
        label: 'Premium',
        color: undefined,
        defaultTier: { id: 'top', price: { amount: 12000, currency: 'MYR' } },
        price: { amount: 12000, currency: 'MYR' },
        seatCount: 2,
      },
    ]);
  });

  it('resolves the full SeatType onto each seat, not just its id', () => {
    const seat = buildRenderModel(MIXED_VENUE).seatsById.get('A1')!;
    expect(seat.type.id).toBe('standard');
    expect(seat.typeColor).toBe('#3a8f63');
    expect(seat.typeLabel).toBe('Biasa');
  });
});

describe('buildRenderModel — localization', () => {
  it('localizes section and type labels against the map locale', () => {
    const model = buildRenderModel(MIXED_VENUE);
    expect(model.locale).toBe('ms-MY');
    expect(model.sections.map((s) => s.label)).toEqual(['Tempat Duduk Bawah', 'Balkoni']);
  });

  it('honors a locale override', () => {
    const model = buildRenderModel(MIXED_VENUE, undefined, { locale: 'en' });
    expect(model.sections.map((s) => s.label)).toEqual(['Stalls', 'Balcony']);
    expect(model.legend[0].label).toBe('Standard');
  });
});

describe('buildRenderModel — elements (§4.4)', () => {
  it('keeps the element id, which the pre-1.0 adapter dropped', () => {
    const model = buildRenderModel(MIXED_VENUE);
    expect(model.sections[0].elements[0].id).toBe('stage');
    expect(model.sections[1].elements[0].id).toBe('exit-b');
  });

  it('resolves a grid element row to its row index, for cell placement', () => {
    const exit = buildRenderModel(MIXED_VENUE).sections[1].elements[0];
    expect(exit.rowIndex).toBe(1);
    expect(exit.col).toBe(5);
  });

  it('carries elements for grid sections, not only freeform ones', () => {
    expect(buildRenderModel(MIXED_VENUE).sections[1].elements).toHaveLength(1);
  });
});
