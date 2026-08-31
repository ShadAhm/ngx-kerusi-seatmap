import type {
  DisallowedReason,
  KerusiMap,
  KerusiSeatmapColors,
  KerusiSession,
  KerusiState,
  KerusiViolation,
  RenderSeat,
  SeatAriaStrings,
  SeatRenderStatus,
  SelectionSummary,
} from '@kerusiweb/core';
import type { CSSProperties, ReactNode } from 'react';

/** How a document with validation errors is handled. */
export type ValidationMode =
  /** Report through `onValidationIssues` and render anyway. The default. */
  | 'collect'
  /** Throw a `KerusiValidationError` during render, for an error boundary. */
  | 'throw'
  /** Skip validation entirely, for a document validated upstream. */
  | 'off';

/** Per-section rendering overrides, keyed by `Section.id`. */
export interface SectionRenderOptions {
  hidden?: boolean;
  /** Overrides `Section.aspectRatio`. */
  aspectRatio?: string;
  /** Overrides the seat size for this section only. */
  seatSize?: number;
  /** Overrides the localized `Section.label`. */
  label?: string;
}

/** What a seat event carries. Everything the document knows, already resolved. */
export interface SeatInteraction {
  seat: RenderSeat;
  /** The selection after this event. */
  selection: readonly string[];
  /** Seats whose membership changed, including companions (§4.6). */
  changed: readonly string[];
}

export interface SeatDisallowed {
  seat: RenderSeat;
  reason: DisallowedReason;
}

/** What a `ref` on `<KerusiSeatmap>` exposes. */
export interface KerusiSeatmapHandle {
  /** The selection's seats and total, resolved against the current documents. */
  readonly summary: SelectionSummary;
  /** Moves DOM focus to a seat, if it is rendered. */
  focusSeat(seatId: string): void;
}

export interface KerusiSeatmapProps {
  // --- documents ------------------------------------------------------------

  map: KerusiMap;
  state?: KerusiState;
  /** The optional map↔event join (§5.3). Validated against the map and state. */
  session?: KerusiSession;

  // --- selection ------------------------------------------------------------

  /**
   * Selected seat ids. Supply this with `onSelectionChange` to control the
   * selection; omit both — or supply only `defaultSelection` — to let the
   * component own it.
   */
  selection?: readonly string[];
  /** The initial selection when the component owns it. Ignored if `selection` is set. */
  defaultSelection?: readonly string[];
  onSelectionChange?: (selection: readonly string[]) => void;

  // --- localization ---------------------------------------------------------

  /** Overrides `KerusiMap.locale` (BCP-47). */
  locale?: string;
  /** Right-to-left rendering. `auto` derives it from the resolved locale. */
  rtl?: boolean | 'auto';
  /** Overrides the built-in English announcement strings. */
  ariaStrings?: SeatAriaStrings;

  // --- appearance -----------------------------------------------------------

  colors?: KerusiSeatmapColors;
  /** Let an available seat take its `SeatType.color` (§4.7). */
  typeColors?: boolean;
  /** Grid cell edge, in viewBox units. */
  seatSize?: number;
  /** Gap between grid cells, in viewBox units. */
  seatGap?: number;
  /** Freeform viewBox width; height follows the section's aspect ratio. */
  freeformBasis?: number;
  /**
   * CSS pixels per viewBox unit. Caps each section at its natural size so a
   * narrow section and a wide one in the same map draw seats the same size.
   */
  unitScale?: number;
  showSectionLabels?: boolean;
  showLegend?: boolean;
  showLegendPrices?: boolean;

  // --- section control ------------------------------------------------------

  /** Render only these sections, in this order. Default: all, by `Section.index`. */
  sectionIds?: readonly string[];
  sectionOverrides?: Readonly<Record<string, SectionRenderOptions>>;

  // --- interaction ----------------------------------------------------------

  /** Statuses in which a seat may be picked. Default: `['available']`. */
  selectableStatuses?: readonly SeatRenderStatus[];
  /** `auto` selects a seat's companion closure together (§4.6). */
  companionMode?: 'auto' | 'independent';
  maxSelection?: number;
  /**
   * A final say on selectability, applied after the status test.
   *
   * Memoize it — an inline arrow rebuilds the whole render model every render.
   */
  seatSelectable?: (seat: RenderSeat) => boolean;
  /** When false the map renders read-only: no pointer or keyboard interaction. */
  interactive?: boolean;
  /**
   * Revert a lapsed `holdExpires` to available on a ticker (§5.1). Off by
   * default — a renderer should stay passive unless asked.
   */
  expireHolds?: boolean;
  expiryIntervalMs?: number;

  // --- validation -----------------------------------------------------------

  validate?: ValidationMode;

  // --- events ---------------------------------------------------------------

  onSeatSelect?: (event: SeatInteraction) => void;
  onSeatDeselect?: (event: SeatInteraction) => void;
  onSeatDisallowed?: (event: SeatDisallowed) => void;
  onSeatFocus?: (seat: RenderSeat) => void;
  /** Called whenever the documents change, unless `validate` is `off`. */
  onValidationIssues?: (issues: readonly KerusiViolation[]) => void;

  // --- host element ---------------------------------------------------------

  className?: string;
  style?: CSSProperties;
  /** Rendered inside the map's root element, after the sections and legend. */
  children?: ReactNode;
}
