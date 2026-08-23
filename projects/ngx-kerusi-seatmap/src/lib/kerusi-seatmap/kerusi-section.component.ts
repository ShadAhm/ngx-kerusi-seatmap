import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { elementStyle, screenPath } from '../render/element-shapes';
import {
  seatBodyPath,
  seatOccupantPath,
  seatOccupantStroke,
  seatRingStroke,
} from '../render/seat-shapes';
import { PlacedElement, PlacedSeat, SectionLayout } from '../render/section-layout';
import { RenderSection } from '../render/render-model';
import {
  cssVar,
  DEFAULT_KERUSI_COLORS,
  elementFill,
  elementTextFill,
  KerusiSeatmapColors,
  occupantFillFor,
  occupantStrokeFor,
  SeatOccupantVariant,
  seatFill,
  seatOccupantVariant,
  seatTextFill,
  seatWashFill,
} from './kerusi-seatmap-colors';

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

  protected ringPath(placed: PlacedSeat): string {
    return seatBodyPath(
      placed.x,
      placed.y,
      placed.width,
      placed.height,
      this.ringStroke(placed) / 2,
    );
  }

  protected ringStroke(placed: PlacedSeat): number {
    return seatRingStroke(placed.width, placed.height);
  }

  /** The dimming wash over a held or booked seat's type colour. */
  protected washFill(placed: PlacedSeat): string {
    // Only called for held/booked seats — see the template's @if.
    return seatWashFill(placed.seat.status as 'held' | 'booked', this.colors());
  }

  /** The occupant figure for a marked seat. */
  protected occupantPath(placed: PlacedSeat): string {
    return seatOccupantPath(placed.x, placed.y, placed.width, placed.height);
  }

  protected occupantStroke(placed: PlacedSeat): number {
    return seatOccupantStroke(placed.width, placed.height);
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
