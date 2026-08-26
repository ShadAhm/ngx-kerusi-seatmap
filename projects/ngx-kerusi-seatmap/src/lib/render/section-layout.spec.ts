import { describe, expect, it } from 'vitest';
import { KerusiMap } from '../kerusi/kerusi-map.model';
import { buildRenderModel } from './build-render-model';
import { computeSectionLayout } from './section-layout';

const mapWith = (section: KerusiMap['sections'][number]): KerusiMap => ({
  kerusi: '1.0',
  id: 'm',
  legend: [{ id: 'standard' }],
  sections: [section],
});

const sectionOf = (section: KerusiMap['sections'][number]) =>
  buildRenderModel(mapWith(section)).sections[0];

const placed = (section: KerusiMap['sections'][number], opts = {}) =>
  computeSectionLayout(sectionOf(section), opts);

describe('grid layout', () => {
  // Columns 1, 2, 4, 5 — column 3 is the aisle (§6.1's bus).
  const busRow = mapWith({
    id: 'main',
    layout: 'grid',
    seats: [
      { id: '1A', row: '1', col: 1, type: 'standard' },
      { id: '1B', row: '1', col: 2, type: 'standard' },
      { id: '1C', row: '1', col: 4, type: 'standard' },
      { id: '1D', row: '1', col: 5, type: 'standard' },
    ],
  }).sections[0];

  it('places seats by column, leaving a skipped column as empty space', () => {
    const layout = placed(busRow, { seatSize: 20, seatGap: 10 });
    const xs = layout.seats.map((p) => p.x);
    // Pitch is 30; the gap between 1B and 1C is two pitches, not one.
    expect(xs[1] - xs[0]).toBe(30);
    expect(xs[2] - xs[1]).toBe(60);
    expect(xs[3] - xs[2]).toBe(30);
  });

  it('emits no placeholder for the skipped column (§4.3.2 no filler objects)', () => {
    expect(placed(busRow).seats).toHaveLength(4);
  });

  it('sizes the viewBox intrinsically from the column and row extents', () => {
    // 5 columns at pitch 30, less the trailing gap, plus padding of 10 each side.
    const layout = placed(busRow, { seatSize: 20, seatGap: 10 });
    expect(layout.width).toBe(10 + 5 * 30 - 10 + 10);
    expect(layout.height).toBe(10 + 1 * 30 - 10 + 10);
  });

  it('grows the canvas with the row count, rather than squashing cells', () => {
    const twoRows = mapWith({
      id: 'main',
      layout: 'grid',
      seats: [
        { id: 'A1', row: 'A', col: 1, type: 'standard' },
        { id: 'B1', row: 'B', col: 1, type: 'standard' },
      ],
    }).sections[0];
    const one = placed(busRow, { seatSize: 20, seatGap: 10 });
    const two = placed(twoRows, { seatSize: 20, seatGap: 10 });
    expect(two.height).toBe(one.height + 30);
    // Cells keep their declared size in both.
    expect(two.seats.every((p) => p.width === 20 && p.height === 20)).toBe(true);
  });

  it('mirrors column order for a right-to-left locale', () => {
    const ltr = placed(busRow, { seatSize: 20, seatGap: 10 });
    const rtl = placed(busRow, { seatSize: 20, seatGap: 10, rtl: true });
    expect(rtl.seats.map((p) => p.seat.id)).toEqual(ltr.seats.map((p) => p.seat.id));
    // 1A is leftmost in LTR and rightmost in RTL.
    expect(rtl.seats[0].x).toBe(ltr.seats[3].x);
    expect(rtl.seats[3].x).toBe(ltr.seats[0].x);
  });
});

describe('grid-addressed elements', () => {
  const withLavatory = mapWith({
    id: 'cabin',
    layout: 'grid',
    seats: [
      { id: '1A', row: '1', col: 1, type: 'standard' },
      { id: '1B', row: '1', col: 2, type: 'standard' },
    ],
    elements: [
      // Two columns wide, sitting in row 1 at column 4.
      { id: 'lav', kind: 'lavatory', label: 'WC', row: '1', col: 4, width: 2 },
    ],
  }).sections[0];

  it('places an element in the cell grid, reading width as a column span', () => {
    const layout = placed(withLavatory, { seatSize: 20, seatGap: 10 });
    const [lav] = layout.elements;
    expect(lav.element.id).toBe('lav');
    // Column 4 is three pitches right of column 1.
    expect(lav.x).toBe(layout.seats[0].x + 3 * 30);
    // Two cells wide, less the internal gap.
    expect(lav.width).toBe(2 * 30 - 10);
    expect(lav.height).toBe(20);
  });

  it('renders elements in grid sections at all — the pre-1.0 renderer ignored them', () => {
    expect(placed(withLavatory).elements).toHaveLength(1);
  });

  it('widens the canvas to include an element beyond the last seat column', () => {
    const layout = placed(withLavatory, { seatSize: 20, seatGap: 10 });
    expect(layout.width).toBeGreaterThan(lastRight(layout.seats));
    expect(layout.width).toBeGreaterThanOrEqual(lav(layout).x + lav(layout).width);
  });

  const lastRight = (seats: readonly { x: number; width: number }[]) =>
    Math.max(...seats.map((s) => s.x + s.width));
  const lav = (layout: { elements: readonly { x: number; width: number }[] }) => layout.elements[0];

  it('places an element carrying a percentage y against the canvas, not a row', () => {
    // The cinema screen's own case: no `row`, so `y` reads as a percentage of
    // the section canvas and the element floats free of the row lattice.
    const withScreen = mapWith({
      id: 'house',
      layout: 'grid',
      seats: [{ id: 'A1', row: 'A', col: 1, type: 'standard' }],
      elements: [{ id: 'screen', kind: 'screen', label: 'SCREEN', col: 1, y: 50, height: 0.5 }],
    }).sections[0];

    const layout = placed(withScreen, { seatSize: 20, seatGap: 10 });
    const [screen] = layout.elements;
    // Height is still a row span, and y centers the box at 50% of the canvas.
    expect(screen.height).toBe(0.5 * 30 - 10);
    expect(screen.centerY).toBeCloseTo(layout.height / 2);
  });
});

describe('grid headroom', () => {
  const hall = mapWith({
    id: 'house',
    layout: 'grid',
    seats: [
      { id: 'A1', row: 'A', col: 1, type: 'standard' },
      { id: 'B1', row: 'B', col: 1, type: 'standard' },
    ],
    elements: [{ id: 'exit', kind: 'exit', label: 'EXIT', row: 'B', col: 3 }],
  }).sections[0];

  const opts = { seatSize: 20, seatGap: 10 };

  it('is inert by default, so an ordinary grid is unchanged', () => {
    expect(placed(hall, opts)).toEqual(placed(hall, { ...opts, headroomRows: 0 }));
  });

  it('pushes the first row down by whole row pitches', () => {
    const bare = placed(hall, opts);
    const roomy = placed(hall, { ...opts, headroomRows: 4 });
    // Pitch is 30, so four rows of headroom is 120.
    expect(roomy.seats[0].y - bare.seats[0].y).toBe(4 * 30);
  });

  it('grows the canvas by the reserved band, rather than crowding the rows', () => {
    const bare = placed(hall, opts);
    const roomy = placed(hall, { ...opts, headroomRows: 4 });
    expect(roomy.height - bare.height).toBe(4 * 30);
    // Row spacing itself is untouched — the band is added, not redistributed.
    expect(roomy.seats[1].y - roomy.seats[0].y).toBe(bare.seats[1].y - bare.seats[0].y);
  });

  it('carries a row-addressed element down with its row', () => {
    const roomy = placed(hall, { ...opts, headroomRows: 4 });
    // The exit sits in row B, so it must stay level with row B's seat.
    expect(roomy.elements[0].y).toBe(roomy.seats[1].y);
  });

  it('accepts a fractional band, since a screen is not a whole row tall', () => {
    const bare = placed(hall, opts);
    const roomy = placed(hall, { ...opts, headroomRows: 1.5 });
    expect(roomy.seats[0].y - bare.seats[0].y).toBe(1.5 * 30);
  });
});

describe('freeform layout', () => {
  const curve = mapWith({
    id: 'house',
    layout: 'freeform',
    aspectRatio: '2:1',
    seats: [
      { id: 'A1', x: 25, y: 50, rotation: -8, type: 'standard' },
      { id: 'A2', x: 75, y: 50, type: 'standard' },
    ],
    elements: [
      { id: 'screen', kind: 'screen', label: 'Screen', x: 50, y: 10, width: 60, height: 5 },
    ],
  }).sections[0];

  it('derives the viewBox height from the section aspect ratio', () => {
    const layout = placed(curve, { freeformBasis: 1000 });
    expect(layout.width).toBe(1000);
    expect(layout.height).toBe(500);
  });

  it('maps percentage coordinates linearly onto the viewBox', () => {
    const layout = placed(curve, { freeformBasis: 1000, seatSize: 40 });
    expect(layout.seats[0].centerX).toBe(250);
    expect(layout.seats[0].centerY).toBe(250);
    expect(layout.seats[1].centerX).toBe(750);
  });

  it('carries per-seat rotation through', () => {
    const layout = placed(curve);
    expect(layout.seats[0].rotation).toBe(-8);
    expect(layout.seats[1].rotation).toBe(0);
  });

  it('sizes an element from percentages of the section box', () => {
    const layout = placed(curve, { freeformBasis: 1000 });
    const [screen] = layout.elements;
    expect(screen.width).toBe(600);
    expect(screen.height).toBe(25);
    expect(screen.centerX).toBe(500);
  });

  it('falls back to square for an unparseable aspect ratio', () => {
    const odd = mapWith({
      id: 'x',
      layout: 'freeform',
      aspectRatio: 'wide',
      seats: [{ id: 'A1', x: 50, y: 50, type: 'standard' }],
    }).sections[0];
    const layout = placed(odd, { freeformBasis: 800 });
    expect(layout.height).toBe(800);
  });
});

describe('mixed layout', () => {
  const stand = mapWith({
    id: 'north',
    layout: 'mixed',
    aspectRatio: '4:1',
    seats: [
      { id: 'N2', row: '1', col: 2, x: 60, y: 40, rotation: 12, type: 'standard' },
      { id: 'N1', row: '1', col: 1, x: 40, y: 50, rotation: -12, type: 'standard' },
    ],
  }).sections[0];

  it('places by x/y — §4.3.1 makes coordinates authoritative when both are given', () => {
    const layout = placed(stand, { freeformBasis: 1000 });
    const n1 = layout.seats.find((p) => p.seat.id === 'N1')!;
    expect(n1.centerX).toBe(400);
    expect(n1.centerY).toBe(125);
  });

  it('keeps col on the seat, for logical adjacency', () => {
    const section = sectionOf(stand);
    expect(section.seats.map((s) => [s.id, s.col])).toEqual([
      ['N1', 1],
      ['N2', 2],
    ]);
  });

  it('honors the section aspect ratio like a freeform section', () => {
    expect(placed(stand, { freeformBasis: 1000 }).height).toBe(250);
  });
});
