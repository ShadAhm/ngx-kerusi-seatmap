import {
  Accessibility,
  Element,
  Money,
  PriceTier,
  Seat,
  SeatType,
  Section,
} from '../kerusi/kerusi-map.model.js';
import { SectionLayoutMode } from '../kerusi/kerusi-layout-mode.js';
import { SeatStatus } from '../kerusi/kerusi-state.model.js';

/**
 * The renderer's view of a Kerusi document pair: a `KerusiMap` with its
 * `KerusiState` merged in, every reference resolved, every label localized, and
 * every section carrying its own layout mode.
 *
 * This is deliberately not the source documents — a renderer should never have
 * to re-resolve a price tier or re-read a locale map while drawing. It is also
 * deliberately framework-agnostic: nothing in this folder imports a framework,
 * so the model can be built in a test, a script, or on a server.
 */

/** A seat's availability, from the merged state (§5.1). */
export type SeatRenderStatus = SeatStatus['status'];

export interface RenderSeat {
  /** `Seat.id` — globally unique within the map, and the selection key. */
  id: string;
  /** The section this seat belongs to. */
  sectionId: string;
  /** `Seat.label`, defaulting to `id`. */
  label: string;

  // --- position -------------------------------------------------------------
  /** `Seat.row` — a `RowMeta.id` or free text. */
  row?: string;
  /** The row's resolved display label, defaulting to `row`. */
  rowLabel?: string;
  /** The row's position among the section's rows, for vertical navigation. */
  rowIndex: number;
  /** `Seat.col` — the adjacency ordinal, meaningful in grid and mixed (§4.3.1). */
  col?: number;
  /** `Seat.x`, 0–100 percent of the section canvas. */
  x?: number;
  /** `Seat.y`, 0–100 percent of the section canvas. */
  y?: number;
  /** `Seat.rotation` in degrees. */
  rotation?: number;

  // --- classification -------------------------------------------------------
  /** The resolved legend entry, not merely its id (§4.7). */
  type: SeatType;
  /** `SeatType.label` localized, defaulting to the type id. */
  typeLabel: string;
  /** `SeatType.color`, the spec's suggested render color. */
  typeColor?: string;
  /** Non-exclusive descriptive tags (§4.3.3). Never affects price. */
  attributes: readonly string[];
  /** Structured accessibility properties (§4.3.4). */
  accessibility?: Accessibility;

  // --- commerce -------------------------------------------------------------
  /** Resolved per the §4.9 precedence order; absent when the seat is unpriced. */
  price?: Money;
  /** ids of seats that must be booked together (§4.6). Symmetric. */
  companions: readonly string[];

  // --- availability ---------------------------------------------------------
  /** From the merged state; `"available"` when the seat is absent (§5.1). */
  status: SeatRenderStatus;
  /** RFC 3339 (§5.1.1); meaningful when `status === "held"`. */
  holdExpires?: string;
  /** Whether this seat may currently be picked, per the caller's rules. */
  selectable: boolean;

  /** The originating document object, for callers that need `metadata`. */
  source: Seat;
}

export interface RenderElement {
  /** `Element.id` — REQUIRED by §4.4, and preserved here unlike in the adapter. */
  id: string;
  /** `Element.kind`: "screen" | "stage" | "exit" | "lavatory" | "gap" | ... */
  kind: string;
  label?: string;
  row?: string;
  rowIndex?: number;
  col?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  source: Element;
}

/** A row within a section: metadata plus the seats that reference it. */
export interface RenderRow {
  /** `RowMeta.id`, the seat's `row` value, or `''` for seats with no row. */
  id: string;
  /** The display label, defaulting to `id`. */
  label?: string;
  /** Position among the section's rows, after the §4.2.1 ordering. */
  index: number;
  /** The seats in this row, ordered by `col` (grid/mixed) or `x` (freeform). */
  seats: readonly RenderSeat[];
  /**
   * An **empty row** (§4.2.2): declared by `Section.rows`, referenced by no
   * seat, and still occupying a slot — it reserves the vertical space one row
   * of seats would. This is what a document uses to open the throw between a
   * cinema screen and row A, or a cross-aisle mid-section.
   */
  empty: boolean;
}

/** A `Direction` (§4.10) with both ends localized. Informational only. */
export interface RenderDirection {
  axis: 'row' | 'col' | 'x' | 'y';
  low: string;
  high: string;
}

export interface RenderSection {
  id: string;
  /** `Section.label` localized; absent when the section declares none. */
  label?: string;
  /** The resolved mode — declared, or inferred per §4.5. */
  layoutMode: SectionLayoutMode;
  /** "width:height"; meaningful for freeform and mixed sections. */
  aspectRatio: string;
  /** Rows in display order. Grouping only — seats do not live inside rows. */
  rows: readonly RenderRow[];
  /** Every seat in the section, flat, in row-then-position order. */
  seats: readonly RenderSeat[];
  /** Non-bookable features (§4.4). */
  elements: readonly RenderElement[];
  /**
   * `Section.directions` localized (§4.10) — what an axis means in the physical
   * world. Informational only: nothing in this library reads it to decide
   * layout or screen placement, exactly as nothing branches on `RenderMap.domain`.
   */
  directions?: readonly RenderDirection[];
  source: Section;
}

export interface RenderMap {
  id: string;
  /** `KerusiMap.name`, for the map's accessible label. */
  name?: string;
  /** The resolved BCP-47 locale everything above was localized against. */
  locale: string;
  /** `KerusiMap.domain` — informational only; never used to reject or branch. */
  domain?: string;
  /** Sections in `Section.index` order. */
  sections: readonly RenderSection[];
  /** The legend, with labels localized, for a key or legend component. */
  legend: readonly RenderLegendEntry[];
  /** The map's single currency, when any seat or tier is priced (§4.9). */
  currency?: string;
  /** Every seat across every section, keyed by id — the merge and lookup index. */
  seatsById: ReadonlyMap<string, RenderSeat>;
}

/** A legend row: a seat type with its label and default price resolved. */
export interface RenderLegendEntry {
  id: string;
  label: string;
  color?: string;
  /** The type's default tier, resolved (§4.7 → §4.8). */
  defaultTier?: PriceTier;
  /** That tier's price, for a legend that shows prices. */
  price?: Money;
  /** How many seats in the map carry this type. */
  seatCount: number;
}
