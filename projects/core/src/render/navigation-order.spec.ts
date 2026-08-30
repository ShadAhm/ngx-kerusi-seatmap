import { describe, expect, it } from 'vitest';
import { KerusiMap } from '../kerusi/kerusi-map.model.js';
import { BUS_MAP } from '../kerusi/kerusi-examples.fixture.js';
import { buildRenderModel } from './build-render-model.js';
import { buildNavigationGraph, NavigationOptions } from './navigation-order.js';

const graphOf = (map: KerusiMap, options?: NavigationOptions) =>
  buildNavigationGraph(buildRenderModel(map).sections[0], options);

describe('grid navigation follows col (§4.3.1)', () => {
  const bus = graphOf(BUS_MAP);

  it('steps across the aisle rather than into it', () => {
    // Columns are 1, 2, 4, 5 — column 3 is the aisle, and it is not a stop.
    expect(bus.neighbours.get('1B')!.right).toBe('1C');
    expect(bus.neighbours.get('1C')!.left).toBe('1B');
  });

  it('stops at the ends of a row', () => {
    expect(bus.neighbours.get('1A')!.left).toBeUndefined();
    expect(bus.neighbours.get('1D')!.right).toBeUndefined();
  });

  it('exposes the row ends for Home and End', () => {
    expect(bus.neighbours.get('1C')!.rowStart).toBe('1A');
    expect(bus.neighbours.get('1C')!.rowEnd).toBe('1D');
  });

  it('traverses in col order', () => {
    expect(bus.order).toEqual(['1A', '1B', '1C', '1D']);
    expect(bus.first).toBe('1A');
    expect(bus.last).toBe('1D');
  });
});

describe('empty rows are stepped over, not into (§4.2.2)', () => {
  // A cross-aisle between rows A and C: declared, seatless, and worth a row of
  // space on the canvas. Arrow movement has to ignore it, or Down from A1 would
  // land nowhere and the row below would be unreachable.
  const withCrossAisle: KerusiMap = {
    kerusi: '1.0',
    id: 'm',
    legend: [{ id: 'standard' }],
    sections: [
      {
        id: 's',
        layout: 'grid',
        rows: [
          { id: 'A', index: 0 },
          { id: 'cross-aisle', index: 1 },
          { id: 'C', index: 2 },
        ],
        seats: [
          { id: 'A1', row: 'A', col: 1, type: 'standard' },
          { id: 'C1', row: 'C', col: 1, type: 'standard' },
        ],
      },
    ],
  };

  const graph = graphOf(withCrossAisle);

  it('moves from the row above to the row below in one step', () => {
    expect(graph.neighbours.get('A1')!.down).toBe('C1');
    expect(graph.neighbours.get('C1')!.up).toBe('A1');
  });

  it('leaves the empty row out of the traversal order entirely', () => {
    expect(graph.order).toEqual(['A1', 'C1']);
  });
});

describe('vertical movement picks the nearest column', () => {
  const staggered: KerusiMap = {
    kerusi: '1.0',
    id: 'm',
    legend: [{ id: 'standard' }],
    sections: [
      {
        id: 'main',
        layout: 'grid',
        rows: [
          { id: 'A', index: 0 },
          { id: 'B', index: 1 },
        ],
        seats: [
          { id: 'A1', row: 'A', col: 1, type: 'standard' },
          { id: 'A9', row: 'A', col: 9, type: 'standard' },
          { id: 'B4', row: 'B', col: 4, type: 'standard' },
          { id: 'B8', row: 'B', col: 8, type: 'standard' },
        ],
      },
    ],
  };
  const nav = graphOf(staggered);

  it('moves down to the closest column, not the first seat in the row', () => {
    expect(nav.neighbours.get('A1')!.down).toBe('B4');
    expect(nav.neighbours.get('A9')!.down).toBe('B8');
  });

  it('moves up symmetrically', () => {
    expect(nav.neighbours.get('B8')!.up).toBe('A9');
    expect(nav.neighbours.get('B4')!.up).toBe('A1');
  });

  it('stops at the top and bottom rows', () => {
    expect(nav.neighbours.get('A1')!.up).toBeUndefined();
    expect(nav.neighbours.get('B4')!.down).toBeUndefined();
  });
});

describe('right-to-left locales', () => {
  it('swaps left and right so the arrow keys stay visually correct', () => {
    const rtl = graphOf(BUS_MAP, { rtl: true });
    expect(rtl.neighbours.get('1B')!.left).toBe('1C');
    expect(rtl.neighbours.get('1B')!.right).toBe('1A');
    // The underlying col order — and so the reading order — is unchanged.
    expect(rtl.order.slice(0, 4)).toEqual(['1A', '1B', '1C', '1D']);
  });
});

describe('freeform navigation', () => {
  const curvedWithRows: KerusiMap = {
    kerusi: '1.0',
    id: 'm',
    legend: [{ id: 'standard' }],
    sections: [
      {
        id: 'house',
        layout: 'freeform',
        rows: [
          { id: 'A', index: 0 },
          { id: 'B', index: 1 },
        ],
        seats: [
          { id: 'A2', row: 'A', x: 55, y: 30, type: 'standard' },
          { id: 'A1', row: 'A', x: 45, y: 32, type: 'standard' },
          { id: 'B1', row: 'B', x: 44, y: 45, type: 'standard' },
          { id: 'B2', row: 'B', x: 56, y: 46, type: 'standard' },
        ],
      },
    ],
  };

  it('uses the row labels a freeform section is allowed to carry (§4.5)', () => {
    const nav = graphOf(curvedWithRows);
    expect(nav.order).toEqual(['A1', 'A2', 'B1', 'B2']);
    expect(nav.neighbours.get('A1')!.right).toBe('A2');
    expect(nav.neighbours.get('A1')!.down).toBe('B1');
  });

  it('bands rowless seats by y and orders them by x', () => {
    const rowless: KerusiMap = {
      ...curvedWithRows,
      sections: [
        {
          id: 'house',
          layout: 'freeform',
          seats: [
            { id: 'far', x: 80, y: 20, type: 'standard' },
            { id: 'near', x: 20, y: 21, type: 'standard' },
            { id: 'below', x: 50, y: 70, type: 'standard' },
          ],
        },
      ],
    };
    const nav = graphOf(rowless);
    expect(nav.order).toEqual(['near', 'far', 'below']);
    expect(nav.neighbours.get('near')!.right).toBe('far');
    expect(nav.neighbours.get('far')!.down).toBe('below');
  });
});

describe('filtering', () => {
  it('can exclude seats from traversal without disturbing the rest', () => {
    const nav = graphOf(BUS_MAP, { includes: (id) => id !== '1B' });
    expect(nav.order).not.toContain('1B');
    expect(nav.neighbours.get('1A')!.right).toBe('1C');
  });

  it('drops a row that ends up empty, rather than leaving a dead band', () => {
    const twoRows: KerusiMap = {
      kerusi: '1.0',
      id: 'm',
      legend: [{ id: 'standard' }],
      sections: [
        {
          id: 'main',
          layout: 'grid',
          seats: [
            { id: 'A1', row: 'A', col: 1, type: 'standard' },
            { id: 'B1', row: 'B', col: 1, type: 'standard' },
            { id: 'C1', row: 'C', col: 1, type: 'standard' },
          ],
        },
      ],
    };
    const nav = graphOf(twoRows, { includes: (id) => id !== 'B1' });
    expect(nav.order).toEqual(['A1', 'C1']);
    // A1 now steps straight down to C1; there is no empty stop in between.
    expect(nav.neighbours.get('A1')!.down).toBe('C1');
  });
});
