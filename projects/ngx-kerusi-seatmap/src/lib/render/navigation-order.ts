import { RenderSeat, RenderSection } from './render-model';

/**
 * Keyboard navigation order over a seat map.
 *
 * §4.3.1 gives `col` a second job beyond drawing: it is the *logical adjacency
 * ordinal*, which is exactly what "the seat to my right" must mean for a
 * keyboard or a screen reader. That holds in `mixed` sections too, where
 * `x`/`y` places the seat but `col` still orders it — so a stand curving away
 * from the pitch still reads seat 1, 2, 3.
 *
 * Freeform sections have no columns. Where their seats carry a `row` label,
 * that grouping is used; where they carry nothing, seats are banded by `y` and
 * ordered by `x`. That last case is a heuristic, and documented as one.
 */

/** The seats reachable from a given seat, by id. */
export interface SeatNeighbours {
  left?: string;
  right?: string;
  up?: string;
  down?: string;
  rowStart?: string;
  rowEnd?: string;
}

export interface NavigationGraph {
  /** Seats in traversal order: row by row, position by position. */
  order: readonly string[];
  /** Per-seat neighbours. */
  neighbours: ReadonlyMap<string, SeatNeighbours>;
  /** The first seat in the section, or `undefined` when it has none. */
  first?: string;
  /** The last seat in the section. */
  last?: string;
}

export interface NavigationOptions {
  /** Swaps left/right so arrow keys stay visually correct in RTL locales. */
  rtl?: boolean;
  /**
   * Restrict traversal to seats passing this test — e.g. to skip unselectable
   * seats. Default: every seat is reachable, since a screen-reader user needs
   * to hear that a seat is booked, not have it hidden.
   */
  includes?: (seatId: string) => boolean;
}

/**
 * Builds the navigation graph for one section. Sections are navigated
 * independently: Tab moves between them, arrows move within.
 */
export function buildNavigationGraph(
  section: RenderSection,
  options: NavigationOptions = {},
): NavigationGraph {
  const bands = section.layoutMode === 'freeform' ? freeformBands(section) : gridBands(section);
  const included = options.includes;

  const filtered = bands
    .map((band) => band.filter((s) => !included || included(s.id)))
    .filter((band) => band.length > 0);

  const neighbours = new Map<string, SeatNeighbours>();
  const order: string[] = [];

  filtered.forEach((band, bandIndex) => {
    band.forEach((seat, i) => {
      order.push(seat.id);

      const prev = band[i - 1]?.id;
      const next = band[i + 1]?.id;
      neighbours.set(seat.id, {
        left: options.rtl ? next : prev,
        right: options.rtl ? prev : next,
        up: nearest(filtered[bandIndex - 1], seat),
        down: nearest(filtered[bandIndex + 1], seat),
        rowStart: band[0]?.id,
        rowEnd: band[band.length - 1]?.id,
      });
    });
  });

  return {
    order,
    neighbours,
    first: order[0],
    last: order[order.length - 1],
  };
}

/** A seat reduced to what navigation needs: an id and a position along the row. */
interface NavSeat {
  id: string;
  /** The ordinal used to find the vertically nearest seat in another band. */
  ordinal: number;
}

/**
 * Grid and mixed sections: the rows the render model already grouped, with
 * seats ordered by `col`. `RenderRow.seats` is already in that order.
 *
 * Empty rows (§4.2.2) are skipped: they reserve space on the canvas but hold
 * nothing to move to, and an empty band would strand an arrow press between two
 * rows of seats.
 */
function gridBands(section: RenderSection): NavSeat[][] {
  return section.rows
    .filter((row) => row.seats.length > 0)
    .map((row) => row.seats.map((seat, i) => ({ id: seat.id, ordinal: seat.col ?? i })));
}

/**
 * Freeform sections: group by the seats' `row` labels when they have them,
 * since §4.5 permits `row` as a pure label in freeform mode and an author who
 * supplied one has told us how the seats group.
 *
 * With no row labels at all, seats are banded by `y`: sorted top to bottom and
 * split wherever the vertical step exceeds the median step, which separates
 * distinct arcs without assuming they are level. This is a heuristic; a
 * document that wants exact reading order should carry `row` labels.
 */
function freeformBands(section: RenderSection): NavSeat[][] {
  const toNav = (seats: readonly RenderSeat[]): NavSeat[] =>
    [...seats]
      .sort((a, b) => (a.x ?? 0) - (b.x ?? 0))
      .map((seat) => ({ id: seat.id, ordinal: seat.x ?? 0 }));

  const hasRowLabels = section.seats.some((s) => s.row !== undefined && s.row !== '');
  if (hasRowLabels) {
    return section.rows.filter((row) => row.seats.length > 0).map((row) => toNav(row.seats));
  }

  const sorted = [...section.seats].sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
  if (sorted.length === 0) {
    return [];
  }

  // Split where the vertical step is far larger than a typical one. "Typical"
  // is the 25th percentile rather than the median: the between-row jumps are
  // themselves steps, and in a section with few rows they drag the median up
  // until no jump looks unusual any more.
  const steps = sorted.slice(1).map((seat, i) => (seat.y ?? 0) - (sorted[i].y ?? 0));
  const threshold = Math.max(percentile(steps, 0.25) * 4, 1);

  const bands: RenderSeat[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const gap = (sorted[i].y ?? 0) - (sorted[i - 1].y ?? 0);
    if (gap > threshold) {
      bands.push([]);
    }
    bands[bands.length - 1].push(sorted[i]);
  }

  return bands.map(toNav);
}

/** The seat in `band` whose ordinal is closest to `from`'s — vertical movement. */
function nearest(
  band: NavSeat[] | undefined,
  from: NavSeat | { ordinal: number },
): string | undefined {
  if (!band || band.length === 0) {
    return undefined;
  }
  let best = band[0];
  let bestDistance = Math.abs(best.ordinal - from.ordinal);
  for (const candidate of band.slice(1)) {
    const distance = Math.abs(candidate.ordinal - from.ordinal);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best.id;
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor(sorted.length * fraction), sorted.length - 1)];
}
