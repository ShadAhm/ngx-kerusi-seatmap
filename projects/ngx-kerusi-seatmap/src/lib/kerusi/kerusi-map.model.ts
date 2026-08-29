/**
 * Kerusi Seat Map document types, transcribed from the Kerusi Seat Map and
 * Availability Format v1.0.0-draft, §4. Field-level comments preserve the
 * normative REQUIRED/OPTIONAL constraints and defaults from the standard.
 *
 * A `KerusiMap` describes a physical venue/vehicle configuration (layout,
 * pricing, seat types). It is static and cacheable; live availability lives
 * in a separate {@link KerusiState} (see kerusi-state.model.ts).
 */

/**
 * A label that may be a plain string or a BCP-47 locale map, e.g.
 * `{ "en": "Orchestra", "ms": "Orkestra" }`. Resolve with
 * `resolveLocalizedText` (§4.1, §4.7).
 */
export type LocalizedText = string | Record<string, string>;

/**
 * Structured accessibility properties for a seat (§4.3.4). All members are
 * OPTIONAL, per the progressive-enhancement principle (§2): a map with no
 * accessibility needs to express simply omits `accessibility` on every seat.
 *
 * These are first-class fields, not `attributes` — an attribute tag like
 * "wheelchair" is free text a consumer cannot rely on.
 */
export interface Accessibility {
  /** Seat or space usable by a wheelchair user. */
  wheelchairAccessible?: boolean;
  /** Which armrest lifts, for transfer from a mobility device. */
  transferArmrest?: 'left' | 'right' | 'both' | 'fixed' | 'none';
  /** Reachable via aisle-chair transfer. */
  aisleChairCompatible?: boolean;
  /**
   * The occupant is expected to need an adjacent companion. Pair with
   * `Seat.companions` (§4.6) to link the actual companion seat.
   */
  companionRequired?: boolean;
}

/** A monetary amount, in minor units to avoid floating-point error (§4.8). */
export interface Money {
  /** REQUIRED. Minor units (e.g. cents), to avoid floating-point error. */
  amount: number;
  /** REQUIRED. ISO 4217 currency code, e.g. "MYR", "USD". */
  currency: string;
}

/** A named price tier, referenced by seats via `Seat.priceTier` (§4.8). */
export interface PriceTier {
  /** REQUIRED. */
  id: string;
  label?: string;
  /** REQUIRED. */
  price: Money;
}

/** A legend entry: the vocabulary of seat types used in a map (§4.7). */
export interface SeatType {
  /** REQUIRED. e.g. "standard" | "recliner" | "wheelchair" | "business". */
  id: string;
  label?: LocalizedText;
  /** Suggested render color, hex. Non-normative hint. */
  color?: string;
  defaultPriceTier?: string;
}

/**
 * A row's declaration: label, ordering key, row-level metadata. NOT a container
 * — seats reference a row by id via `Seat.row` rather than nesting inside it
 * (§4.2).
 *
 * `Section.rows` as a whole is OPTIONAL, but where it is present it is the
 * section's **complete, ordered row registry** rather than an annotation on the
 * rows the seats happen to mention: §4.6 requires every `Seat.row` to resolve
 * against it, so no seat can occupy a row it does not declare. A `RowMeta` that
 * no seat references is an *empty row* — see §4.2.2 and {@link Section.rows}.
 */
export interface RowMeta {
  /** REQUIRED. */
  id: string;
  label?: string;
  /**
   * Ordering key among the section's rows (§4.2.1) — a key, not a position.
   * Rows at 0 and 11 with nothing between them are adjacent, two rows and not
   * twelve; vertical space is reserved by declaring a row, never by leaving a
   * numeric hole here.
   */
  index?: number;
  metadata?: Record<string, unknown>;
}

/**
 * A human-facing label for one of a section's four addressing axes (§4.10) —
 * "front of train" / "back of train" for a carriage, compass points for
 * open-air seating whose orientation decides where the sun falls.
 *
 * Non-normative and purely informational: a validator MUST NOT reject a
 * document over it, and a renderer MUST NOT read it to decide layout or screen
 * placement. It says what an axis *means* in the physical world, not which edge
 * of the screen it is drawn on — that stays a rendering decision (§2).
 */
export interface Direction {
  /** REQUIRED. Which addressing axis (§4.3) this label pair describes. */
  axis: 'row' | 'col' | 'x' | 'y';
  /**
   * REQUIRED. The low end: ascending row order (§4.2.1) or `col` from the
   * section's first, or `x`/`y` = 0.
   */
  low: LocalizedText;
  /** REQUIRED. The high end: descending row/col order, or `x`/`y` = 100. */
  high: LocalizedText;
}

/**
 * A single seat within a section (§4.3). A seat MUST specify `col`, or `x` and
 * `y`, or both — never neither (§4.3.1).
 */
export interface Seat {
  /** REQUIRED. Globally unique within the KerusiMap. */
  id: string;
  /** Display label, e.g. "12" or "12A". Defaults to `id`. */
  label?: string;
  /** References `RowMeta.id`, or a free-text row label. */
  row?: string;
  /** Grid column within the row. */
  col?: number;
  /** 0–100, percent of section width (see `Section.aspectRatio`). */
  x?: number;
  /** 0–100, percent of section height. */
  y?: number;
  /** Degrees. Lets one seat tilt independently of its neighbours. */
  rotation?: number;
  /** REQUIRED. References a `SeatType.id` in the map's `legend`. */
  type: string;
  /** References a `PriceTier.id`. */
  priceTier?: string;
  /** Literal override; takes precedence over `priceTier` (§4.9). */
  price?: Money;
  /** ids of other seats that must be booked together (couple/family bays). */
  companions?: string[];
  /**
   * Free, non-exclusive tags: "aisle" | "window" | "extra-legroom" | ...
   * Descriptive only; attributes MUST NOT independently affect price (§4.3.3).
   */
  attributes?: string[];
  /** Structured accessibility properties (§4.3.4). */
  accessibility?: Accessibility;
  metadata?: Record<string, unknown>;
}

/**
 * A non-bookable feature that still requires rendering: screens, stages,
 * exits, lavatories, staircases, or a labelled gap (§4.4).
 *
 * An element is bound to its section's positioning mode exactly as its seats
 * are (§4.4.1), for the same reason §4.5 binds the seats: a section whose
 * elements may be addressed differently from its seats cannot be laid out
 * deterministically by two independent renderers.
 */
export interface Element {
  /** REQUIRED. */
  id: string;
  /** REQUIRED. "screen" | "stage" | "exit" | "lavatory" | "gap" | "aisle" | ... */
  kind: string;
  label?: string;
  /** References `RowMeta.id` when the section declares `rows` (§4.6). */
  row?: string;
  /** Grid column. MUST NOT appear in a freeform section (§4.4.1). */
  col?: number;
  /** Percent of section width. MUST NOT appear in a grid section (§4.4.1). */
  x?: number;
  /** Percent of section height. MUST NOT appear in a grid section (§4.4.1). */
  y?: number;
  /**
   * Grid: a **column span** in cells — a positive integer, default 1. Omitting
   * `col` spans the section's full column extent and ignores `width`, which is
   * the usual form for a screen or a stage.
   * Freeform: a percentage of the section's width (§4.4.1).
   */
  width?: number;
  /**
   * Grid: a **row span** in cells — a positive integer, default 1, counted from
   * this element's `row` through the section's row order (§4.2.1). The rows it
   * reaches are ordinarily empty rows declared for the purpose (§4.2.2).
   * Freeform: a percentage of the section's height (§4.4.1).
   */
  height?: number;
  rotation?: number;
  metadata?: Record<string, unknown>;
}

/**
 * A section holds a FLAT list of seats, not a grid of rows containing seats
 * (§4.1). A seat's position is a property of the seat, which is what makes
 * curves, offsets, and irregular gaps representable.
 */
export interface Section {
  /** REQUIRED. */
  id: string;
  /** String, or locale map: `{ "en": "Orchestra", "ms": "Orkestra" }`. */
  label?: LocalizedText;
  /** Display order among sections. */
  index?: number;
  /**
   * A strict, validated constraint on how this section's seats are positioned
   * — NOT a rendering hint (§4.5). Every seat MUST conform:
   *
   *  - `grid`     — every seat has `col`; no seat has `x` or `y`.
   *  - `freeform` — every seat has both `x` and `y`; no seat has `col`.
   *  - `mixed`    — every seat has `col` AND both `x` and `y`; `x`/`y` places
   *                 the seat and `col` gives its logical adjacency.
   *
   * Omitted, the mode is INFERRED from the seats; a section whose seats are
   * inconsistent is invalid and MUST be rejected. A free-text `row` is allowed
   * in every mode — it carries no positional information.
   */
  layout?: 'grid' | 'freeform' | 'mixed';
  /**
   * "width:height", e.g. "16:9". Meaningful only for freeform/mixed sections.
   * Default: "1:1".
   */
  aspectRatio?: string;
  /**
   * The section's row registry, when present: a complete, ordered list of its
   * rows, not merely an annotation on the ones its seats mention (§4.2).
   * Omitted, a seat's `row` is opaque free text and the section's rows are
   * exactly those its seats reference.
   *
   * Rows are ordered by §4.2.1 — those declaring `index` first, ascending, then
   * the rest in declaration order. A row no seat references is an **empty row**
   * (§4.2.2): it still occupies a slot, reserving the vertical space one row of
   * seats would. That is how a grid section expresses the throw between a
   * cinema screen and its front row, or a cross-aisle between two rows — the
   * row-axis counterpart to a skipped column (§4.3.2).
   */
  rows?: RowMeta[];
  /** Human-facing labels for this section's addressing axes (§4.10). */
  directions?: Direction[];
  /** REQUIRED. Flat list; order is not significant. */
  seats: Seat[];
  /** Non-bookable features: screens, stages, aisles, stairs. */
  elements?: Element[];
  metadata?: Record<string, unknown>;
}

/** The top-level static seat-map document (§4). */
export interface KerusiMap {
  /** REQUIRED. Spec version this document conforms to. */
  kerusi: '1.0';
  /** REQUIRED. Unique id for this map (e.g. "cinema3-hallA"). */
  id: string;
  /** Human label, e.g. "Hall A". */
  name?: string;
  /**
   * Free-text hint: "cinema" | "flight" | "theatre" | "stadium" | "bus" |
   * "train" | "custom". Non-normative; informational only.
   */
  domain?: string;
  /** BCP-47 language tag. Default: "en". */
  locale?: string;
  /** REQUIRED. Vocabulary of seat types used in this map. */
  legend: SeatType[];
  /** Named price tiers, referenced by id. */
  priceTiers?: PriceTier[];
  /** REQUIRED. */
  sections: Section[];
  metadata?: Record<string, unknown>;
}
