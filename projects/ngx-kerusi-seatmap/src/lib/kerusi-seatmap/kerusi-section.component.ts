import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  cssVar,
  DEFAULT_KERUSI_COLORS,
  elementFill,
  elementStyle,
  elementTextFill,
  KerusiSeatmapColors,
  occupantFillFor,
  occupantStrokeFor,
  PlacedElement,
  PlacedSeat,
  RenderSection,
  screenPath,
  seatBodyPath,
  SeatOccupantVariant,
  seatCoreFill,
  seatFill,
  seatOccupantPath,
  seatOccupantStroke,
  seatOccupantVariant,
  seatSelectedFrame,
  seatTextFill,
  seatWashFill,
  SectionLayout,
} from '@kerusiweb/core';

/**
 * Draws one Kerusi `Section` as a single `<svg>`.
 *
 * One SVG per section — rather than section groups inside a shared canvas — is
 * what makes per-section `aspectRatio` and mixed grid/freeform modes work: each
 * gets its own `viewBox` and its own intrinsic proportions, and CSS is free to
 * stack, wrap or column them. It also puts the section heading in real DOM,
 * where a screen reader can use it as a landmark.
 *
 * This component holds no state. It takes a placed layout and emits intent.
 */
@Component({
  selector: 'kerusi-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kerusi-section.component.html',
  styleUrl: './kerusi-section.component.css',
})
export class KerusiSectionComponent {
  readonly section = input.required<RenderSection>();
  readonly layout = input.required<SectionLayout>();

  /** Currently selected seat ids. */
  readonly selection = input<ReadonlySet<string>>(new Set());
  /** The seat holding the section's single tab stop, if any. */
  readonly focusedSeatId = input<string | null>(null);
  /** Per-seat accessible names, keyed by seat id. */
  readonly ariaLabels = input<ReadonlyMap<string, string>>(new Map());

  readonly colors = input<Required<KerusiSeatmapColors>>(DEFAULT_KERUSI_COLORS);
  /** Whether an available seat may take its `SeatType.color` (§4.7). */
  readonly typeColors = input<boolean>(true);
  /** When false, seats render but do not respond to pointer or keyboard. */
  readonly interactive = input<boolean>(true);
  /**
   * CSS pixels per viewBox unit, at the section's natural size.
   *
   * Without a cap every section stretches to the full container width, so in a
   * four-tier theatre the narrow box row would draw seats several times the
   * size of the orchestra's. Capping each section at its own intrinsic width
   * keeps a seat the same size everywhere; a section too wide to fit still
   * scales down to the container.
   */
  readonly unitScale = input<number>(1);

  readonly seatActivate = output<string>();
  readonly seatFocused = output<string>();
  readonly seatKeydown = output<KeyboardEvent>();

  protected readonly viewBox = computed(() => `0 0 ${this.layout().width} ${this.layout().height}`);

  /** The section's natural width in CSS pixels; it never draws wider. */
  protected readonly naturalWidth = computed(() => this.layout().width * this.unitScale());

  protected isSelected(placed: PlacedSeat): boolean {
    return this.selection().has(placed.seat.id);
  }

  protected fill(placed: PlacedSeat): string {
    return seatFill(placed.seat, this.isSelected(placed), this.colors(), this.typeColors());
  }

  protected textFill(placed: PlacedSeat): string {
    return seatTextFill(placed.seat, this.isSelected(placed), this.colors(), this.typeColors());
  }

  protected backdrop(): string {
    return cssVar('backdrop', this.colors().backdrop);
  }

  // --- the seat glyph -------------------------------------------------------

  /** The seat's outline: square-ish front, tapered back — shape carries facing. */
  protected bodyPath(placed: PlacedSeat): string {
    return seatBodyPath(placed.x, placed.y, placed.width, placed.height);
  }

  /** `null` for an available or blocked seat — nothing to mark. */
  protected occupantVariant(placed: PlacedSeat): SeatOccupantVariant | null {
    return seatOccupantVariant(placed.seat, this.isSelected(placed));
  }

  /**
   * The box a seat's decorative marks are drawn to: the seat's own, or — when
   * it is selected — the core plate's, which is inset by the frame width.
   *
   * Everything over a selected seat sits on the core, so it all has to be
   * measured from the core. Drawing to the seat's box instead leaves the
   * occupant's hips crossing the frame, where a figure tinted `selectedBg`
   * lands on a frame filled `selectedBg` and reads as a hard nub. Since the
   * core is an exact scaled copy of the body (see {@link seatSelectedFrame}),
   * routing through here reproduces every clearance the mark had against the
   * body, scaled — so the frame width stays free to change.
   */
  private markBox(placed: PlacedSeat): { x: number; y: number; width: number; height: number } {
    if (!this.isSelected(placed)) {
      return placed;
    }
    const frame = seatSelectedFrame(placed.width, placed.height);
    return {
      x: placed.x + frame,
      y: placed.y + frame,
      width: placed.width - frame * 2,
      height: placed.height - frame * 2,
    };
  }

  /** The bright plate inside a selected seat's frame. */
  protected corePath(placed: PlacedSeat): string {
    const box = this.markBox(placed);
    return seatBodyPath(box.x, box.y, box.width, box.height);
  }

  protected coreFill(): string {
    return seatCoreFill(this.colors());
  }

  /** The dimming wash over a held or booked seat's type colour. */
  protected washFill(placed: PlacedSeat): string {
    // Only called for held/booked seats — see the template's @if.
    return seatWashFill(placed.seat.status as 'held' | 'booked', this.colors());
  }

  /** The occupant figure for a marked seat, sized to whatever it sits on. */
  protected occupantPath(placed: PlacedSeat): string {
    const box = this.markBox(placed);
    return seatOccupantPath(box.x, box.y, box.width, box.height);
  }

  protected occupantStroke(placed: PlacedSeat): number {
    const box = this.markBox(placed);
    return seatOccupantStroke(box.width, box.height);
  }

  // The wheelchair marker keeps the same relative corner it always had; only
  // the box it is relative to changes, so a selected seat's dot stays whole
  // instead of being bitten off by the frame.
  protected wheelchairCx(placed: PlacedSeat): number {
    const box = this.markBox(placed);
    return box.x + box.width * 0.82;
  }

  protected wheelchairCy(placed: PlacedSeat): number {
    const box = this.markBox(placed);
    return box.y + box.height * 0.18;
  }

  protected wheelchairRadius(placed: PlacedSeat): number {
    return this.markBox(placed).width * 0.13;
  }

  /**
   * A core-coloured outline behind a selected seat's number, painted under the
   * glyphs via `paint-order`.
   *
   * The label is centred on the occupant's shoulder line, so without this it is
   * `selectedBg` over a `selectedBg` silhouette — the figure, not the plate, is
   * what it actually has to contrast against. The halo also rescues a label too
   * long for the core, which would otherwise run onto the frame and vanish into
   * it.
   *
   * Bound here rather than in the stylesheet on purpose: a CSS
   * `var(--kerusi-selected-fg, …)` rule would carry the library default as its
   * fallback and silently skip the `[colors]` input tier, which only the
   * TypeScript side can resolve.
   */
  protected labelHalo(placed: PlacedSeat): string {
    return this.isSelected(placed) ? seatCoreFill(this.colors()) : 'none';
  }

  protected labelHaloWidth(placed: PlacedSeat): number {
    return this.isSelected(placed) ? placed.fontSize * 0.22 : 0;
  }

  /** Solid for selected/booked; `none` for held, which draws hollow instead. */
  protected occupantFill(variant: SeatOccupantVariant): string {
    return occupantFillFor(variant, this.colors());
  }

  protected occupantStrokeColor(variant: SeatOccupantVariant): string {
    return occupantStrokeFor(variant, this.colors());
  }

  /** The section's single tab stop; every other seat is reachable by arrow key. */
  protected tabIndex(placed: PlacedSeat): number {
    if (!this.interactive()) {
      return -1;
    }
    return placed.seat.id === this.focusedSeatId() ? 0 : -1;
  }

  protected ariaLabel(placed: PlacedSeat): string {
    return this.ariaLabels().get(placed.seat.id) ?? placed.seat.label;
  }

  protected seatClasses(placed: PlacedSeat): string {
    const seat = placed.seat;
    return [
      'kerusi-seat',
      `kerusi-seat--${seat.status}`,
      this.isSelected(placed) ? 'kerusi-seat--selected' : '',
      seat.selectable ? '' : 'kerusi-seat--unselectable',
      seat.accessibility?.wheelchairAccessible ? 'kerusi-seat--wheelchair' : '',
      seat.companions.length > 0 ? 'kerusi-seat--companion' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  /** SVG rotate() about the item's center; null when it does not rotate. */
  protected transform(item: PlacedSeat | PlacedElement): string | null {
    return item.rotation ? `rotate(${item.rotation} ${item.centerX} ${item.centerY})` : null;
  }

  /** Cancels the parent <g>'s rotation so the label stays upright and stays put. */
  protected counterRotate(item: PlacedSeat | PlacedElement): string | null {
    return item.rotation ? `rotate(${-item.rotation} ${item.centerX} ${item.centerY})` : null;
  }

  // --- elements -------------------------------------------------------------

  protected style(placed: PlacedElement) {
    return elementStyle(placed.element.kind);
  }

  protected elementFillOf(placed: PlacedElement): string {
    return elementFill(this.style(placed).tone, this.colors());
  }

  protected elementTextFillOf(placed: PlacedElement): string {
    return elementTextFill(this.style(placed).tone, this.colors());
  }

  protected screenPathOf(placed: PlacedElement): string {
    return screenPath(placed.x, placed.y, placed.width, placed.height);
  }

  /** The corner radius for a rectangular element; a stage reads as squarer. */
  protected radiusOf(placed: PlacedElement): number {
    return this.style(placed).shape === 'stage' ? 2 : Math.min(placed.height * 0.25, 6);
  }

  // --- interaction ----------------------------------------------------------

  protected onSeatClick(placed: PlacedSeat): void {
    if (this.interactive()) {
      this.seatActivate.emit(placed.seat.id);
    }
  }

  protected onSeatFocus(placed: PlacedSeat): void {
    if (this.interactive()) {
      this.seatFocused.emit(placed.seat.id);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.interactive()) {
      this.seatKeydown.emit(event);
    }
  }
}
