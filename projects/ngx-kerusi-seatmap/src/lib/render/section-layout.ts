import { RenderElement, RenderSeat, RenderSection } from './render-model';

/**
 * Section geometry: turning a `RenderSection` into placed rectangles.
 *
 * Each section computes its own *intrinsic* size — a grid section is as wide as
 * its widest row and as tall as its row count; a freeform section takes its
 * proportions from `Section.aspectRatio`. The component then hands that size to
 * the SVG as a `viewBox` and lets CSS scale it. The pre-1.0 renderer instead
 * stretched every layout to fill a fixed 500x500 canvas, which squashed a wide
 * auditorium into flattened rectangles.
 */

export interface PlacedSeat {
  seat: RenderSeat;
  /** Top-left corner, in viewBox units. */
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  fontSize: number;
  /** Degrees about the seat center; 0 unless the document asked for a tilt. */
  rotation: number;
}

export interface PlacedElement {
  element: RenderElement;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  fontSize: number;
  rotation: number;
}

export interface SectionLayout {
  /** Intrinsic viewBox width. */
  width: number;
  /** Intrinsic viewBox height. */
  height: number;
  seats: readonly PlacedSeat[];
  elements: readonly PlacedElement[];
}

export interface SectionLayoutOptions {
  /** Grid cell edge, in viewBox units. */
  seatSize?: number;
  /** Gap between adjacent cells, in viewBox units. */
  seatGap?: number;
  /** Freeform viewBox width; height follows from the aspect ratio. */
  freeformBasis?: number;
  /** Overrides `Section.aspectRatio`. */
  aspectRatio?: string;
  /** Mirrors the grid horizontally, for right-to-left locales. */
  rtl?: boolean;
}

const DEFAULTS = {
  seatSize: 28,
  seatGap: 6,
  freeformBasis: 1000,
} as const;

/** Padding around the seating area, as a multiple of the seat size. */
const PADDING_RATIO = 0.5;

/**
 * Places a section's seats and elements. Dispatches on the section's own
 * resolved layout mode, so a map may mix grid, freeform and mixed sections —
 * the pre-1.0 adapter collapsed the whole map to a single mode.
 *
 * `mixed` is laid out as freeform: §4.3.1 makes `x`/`y` authoritative for
 * visual placement when both are present. Its `col` survives on the seat and is
 * consumed by `navigation-order.ts`.
 */
export function computeSectionLayout(
  section: RenderSection,
  options: SectionLayoutOptions = {},
): SectionLayout {
  return section.layoutMode === 'grid'
    ? computeGridLayout(section, options)
    : computeFreeformLayout(section, options);
}

// --- grid -------------------------------------------------------------------

/**
 * Places seats and elements on the `(row, col)` lattice.
 *
 * Both axes reserve space the same way. A column no seat occupies is simply
 * empty space — §4.3.2's "no filler objects": the gap that is an aisle needs no
 * placeholder seat, and none is synthesized. A row no seat occupies is an empty
 * row the document declared (§4.2.2), already materialized in `section.rows`,
 * so it costs a full row pitch here without this function knowing it is empty.
 * That is what opens the throw between a cinema screen and row A.
 */
function computeGridLayout(section: RenderSection, options: SectionLayoutOptions): SectionLayout {
  const size = options.seatSize ?? DEFAULTS.seatSize;
  const gap = options.seatGap ?? DEFAULTS.seatGap;
  const pitch = size + gap;
  const padding = size * PADDING_RATIO;

  const columns = columnExtent(section);
  const rowCount = Math.max(section.rows.length, 1);

  const width = padding * 2 + columns.count * pitch - gap;
  const height = padding * 2 + rowCount * pitch - gap;

  /** Column index → x, mirrored when the locale reads right-to-left. */
  const colX = (col: number): number => {
    const offset = options.rtl ? columns.max - col : col - columns.min;
    return padding + offset * pitch;
  };

  const seats: PlacedSeat[] = [];
  for (const row of section.rows) {
    const y = padding + row.index * pitch;
    row.seats.forEach((seat, i) => {
      // A grid seat is required to carry `col` (§4.5); fall back to its index
      // so an unvalidated document still draws something in order.
      const x = colX(seat.col ?? columns.min + i);
      seats.push(box(seat, x, y, size, size, seat.rotation ?? 0));
    });
  }

  const elements: PlacedElement[] = section.elements.map((element) => {
    // §4.4.1: in grid mode width/height are column and row spans in cells, not
    // percentages — a two-seat-wide lavatory is `{ col: 1, width: 2 }`, and a
    // screen filling two empty rows is `{ row: "screen-1", height: 2 }`. The
    // spec requires positive integers; a fractional span is an
    // `element-span-invalid` the validator rejects, and is rounded here so an
    // unvalidated document still draws something.
    const spanY = gridSpan(element.height);
    // Omitting `col` spans the section's full column extent and ignores
    // `width` — the usual form for a screen or a stage (§4.4.1).
    const elWidth =
      element.col !== undefined
        ? gridSpan(element.width) * pitch - gap
        : columns.count * pitch - gap;
    const elHeight = spanY * pitch - gap;

    // An element carrying x/y in a grid section violates §4.4.1 and the
    // validator rejects it; it still places, by percentage of the section box,
    // rather than collapsing into the corner.
    const x =
      element.col !== undefined
        ? colX(element.col)
        : element.x !== undefined
          ? (element.x / 100) * width - elWidth / 2
          : padding;
    const y =
      element.rowIndex !== undefined
        ? padding + element.rowIndex * pitch
        : element.y !== undefined
          ? (element.y / 100) * height - elHeight / 2
          : padding;

    return elementBox(element, x, y, elWidth, elHeight);
  });

  return { width, height, seats, elements };
}

/**
 * A grid `width`/`height`, normalized. §4.4.1 makes these positive integers
 * defaulting to 1; rounding rather than rejecting keeps an invalid document
 * drawable, since the validator is what refuses it.
 */
function gridSpan(span: number | undefined): number {
  return Math.max(Math.round(span ?? 1), 1);
}

/** The lowest and highest column any seat occupies, and how many that spans. */
function columnExtent(section: RenderSection): { min: number; max: number; count: number } {
  const cols = section.seats
    .map((s) => s.col)
    .filter((c): c is number => c !== undefined && c !== null);
  // An element's `width` is a column span in grid mode, so a two-cell-wide
  // lavatory at column 4 reaches column 5 and the canvas must cover it.
  const elementCols = section.elements
    .filter((e) => e.col !== undefined && e.col !== null)
    .flatMap((e) => [e.col!, e.col! + gridSpan(e.width) - 1]);
  const all = [...cols, ...elementCols];

  if (all.length === 0) {
    const fallback = Math.max(...section.rows.map((r) => r.seats.length), 1);
    return { min: 0, max: fallback - 1, count: fallback };
  }

  const min = Math.min(...all);
  const max = Math.max(...all);
  return { min, max, count: max - min + 1 };
}

// --- freeform / mixed -------------------------------------------------------

/**
 * Places seats from percentage coordinates inside a box of the section's
 * aspect ratio. Because the box *is* the viewBox, percentages map linearly and
 * no letterboxing is needed — the SVG's `preserveAspectRatio` handles fitting
 * the box into whatever space CSS gives it.
 */
function computeFreeformLayout(
  section: RenderSection,
  options: SectionLayoutOptions,
): SectionLayout {
  const width = options.freeformBasis ?? DEFAULTS.freeformBasis;
  const height = width / parseAspectRatio(options.aspectRatio ?? section.aspectRatio);
  const size = options.seatSize ?? Math.min(width, height) * 0.05;

  const seats = section.seats.map((seat) => {
    const centerX = ((seat.x ?? 0) / 100) * width;
    const centerY = ((seat.y ?? 0) / 100) * height;
    return box(seat, centerX - size / 2, centerY - size / 2, size, size, seat.rotation ?? 0);
  });

  const elements = section.elements.map((element) => {
    // In freeform mode width/height are percentages of the section box.
    const elWidth = ((element.width ?? 6) / 100) * width;
    const elHeight = ((element.height ?? 6) / 100) * height;
    const centerX = ((element.x ?? 50) / 100) * width;
    const centerY = ((element.y ?? 50) / 100) * height;
    return elementBox(element, centerX - elWidth / 2, centerY - elHeight / 2, elWidth, elHeight);
  });

  return { width, height, seats, elements };
}

/** "16:9" → 1.777…. Falls back to square for anything unparseable. */
function parseAspectRatio(ratio: string): number {
  const [w, h] = ratio.split(':').map(Number);
  return w > 0 && h > 0 ? w / h : 1;
}

// --- shared -----------------------------------------------------------------

function box(
  seat: RenderSeat,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
): PlacedSeat {
  return {
    seat,
    x,
    y,
    width,
    height,
    centerX: x + width / 2,
    centerY: y + height / 2,
    fontSize: width * 0.4,
    rotation,
  };
}

function elementBox(
  element: RenderElement,
  x: number,
  y: number,
  width: number,
  height: number,
): PlacedElement {
  return {
    element,
    x,
    y,
    width,
    height,
    centerX: x + width / 2,
    centerY: y + height / 2,
    fontSize: Math.max(Math.min(height * 0.5, width * 0.18), 6),
    rotation: element.rotation ?? 0,
  };
}
