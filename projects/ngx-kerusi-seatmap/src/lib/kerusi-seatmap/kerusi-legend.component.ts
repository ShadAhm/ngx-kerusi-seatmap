import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatMoney } from '../kerusi/kerusi-locale';
import { RenderLegendEntry } from '../render/render-model';
import {
  seatBodyPath,
  seatOccupantPath,
  seatOccupantStroke,
  seatRingStroke,
} from '../render/seat-shapes';
import {
  cssVar,
  DEFAULT_KERUSI_COLORS,
  KerusiSeatmapColors,
  occupantFillFor,
  occupantStrokeFor,
  readableOn,
  SeatOccupantVariant,
  seatWashFill,
} from './kerusi-seatmap-colors';

/** Which marks, beyond the body fill, a status swatch draws. */
type StatusKind = 'plain' | 'blocked' | SeatOccupantVariant;

/** One availability swatch in the legend's second block. */
interface StatusEntry {
  key: string;
  label: string;
  kind: StatusKind;
  /** The swatch body's fill. */
  fill: string;
}

/**
 * A key for a seat map: its seat types on one side, its availability states on
 * the other.
 *
 * This ships in the library rather than being left to each application because
 * the swatch colors must come from the *same* resolution path as the seat
 * fills — `SeatType.color` when the document supplies one, the theme's
 * available color when it does not. Re-deriving that in application code is how
 * a legend ends up disagreeing with the map it describes.
 *
 * It is opt-in: `<kerusi-seatmap [showLegend]="true">` renders it inline, or
 * use `<kerusi-legend>` directly to place it anywhere.
 */
@Component({
  selector: 'kerusi-legend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kerusi-legend.component.html',
  styleUrl: './kerusi-legend.component.css',
})
export class KerusiLegendComponent {
  /** From `RenderMap.legend`. */
  readonly legend = input.required<readonly RenderLegendEntry[]>();
  readonly locale = input<string>('en');
  readonly colors = input<Required<KerusiSeatmapColors>>(DEFAULT_KERUSI_COLORS);
  /** Whether an available seat takes its type color — mirrors the seatmap input. */
  readonly typeColors = input<boolean>(true);
  readonly showPrices = input<boolean>(true);
  /** Hide types no seat in the rendered map actually uses. */
  readonly hideUnusedTypes = input<boolean>(true);

  readonly headingSeatTypes = input<string>('Seat types');
  readonly headingAvailability = input<string>('Availability');

  protected readonly types = computed(() =>
    this.legend().filter((entry) => !this.hideUnusedTypes() || entry.seatCount > 0),
  );

  // Colour means seat type; shape means status (see `seatFill`'s doc comment).
  // Held and booked swatches share the plain "available" body colour — the
  // map's colour there is always whatever the seat's own type supplies, which
  // the legend has no single value for — and are told apart by their wash and
  // occupant figure instead, same as on the map.
  protected readonly statuses = computed<StatusEntry[]>(() => {
    const c = this.colors();
    const available = cssVar('availableBg', c.availableBg);
    return [
      { key: 'available', label: 'Available', kind: 'plain', fill: available },
      {
        key: 'selected',
        label: 'Selected',
        kind: 'selected',
        fill: cssVar('selectedBg', c.selectedBg),
      },
      { key: 'held', label: 'On hold', kind: 'held', fill: available },
      { key: 'booked', label: 'Booked', kind: 'booked', fill: available },
      { key: 'blocked', label: 'Blocked', kind: 'blocked', fill: cssVar('blockedBg', c.blockedBg) },
    ];
  });

  protected swatch(entry: RenderLegendEntry): string {
    return (this.typeColors() && entry.color) || cssVar('availableBg', this.colors().availableBg);
  }

  protected swatchText(entry: RenderLegendEntry): string {
    const typeColor = this.typeColors() && entry.color;
    // Mirrors `seatTextFill`: only a document-supplied color needs guessing at.
    return typeColor ? readableOn(typeColor) : cssVar('availableFg', this.colors().availableFg);
  }

  // --- status swatches -------------------------------------------------------
  //
  // Availability is now signalled by shape, not colour, so every status swatch
  // (bar "available" and "blocked") draws the same glyph the map does rather
  // than a flat square. A legend that showed only flat colour would teach a
  // cue the map no longer uses.

  /** The swatch's viewBox edge; the seat glyph is drawn to fill it. */
  protected readonly glyphSize = 16;

  protected readonly glyphBody = seatBodyPath(0, 0, this.glyphSize, this.glyphSize);
  protected readonly glyphRingStroke = seatRingStroke(this.glyphSize, this.glyphSize);
  protected readonly glyphRing = seatBodyPath(
    0,
    0,
    this.glyphSize,
    this.glyphSize,
    this.glyphRingStroke / 2,
  );
  protected readonly glyphOccupant = seatOccupantPath(0, 0, this.glyphSize, this.glyphSize);
  protected readonly glyphOccupantStroke = seatOccupantStroke(this.glyphSize, this.glyphSize);

  protected hasWash(kind: StatusKind): kind is 'held' | 'booked' {
    return kind === 'held' || kind === 'booked';
  }

  protected hasOccupant(kind: StatusKind): kind is SeatOccupantVariant {
    return kind === 'selected' || kind === 'held' || kind === 'booked';
  }

  protected washFillOf(kind: 'held' | 'booked'): string {
    return seatWashFill(kind, this.colors());
  }

  protected occupantFillOf(variant: SeatOccupantVariant): string {
    return occupantFillFor(variant, this.colors());
  }

  protected occupantStrokeOf(variant: SeatOccupantVariant): string {
    return occupantStrokeFor(variant, this.colors());
  }

  protected selectedFg(): string {
    return cssVar('selectedFg', this.colors().selectedFg);
  }

  protected price(entry: RenderLegendEntry): string {
    return entry.price ? formatMoney(entry.price, this.locale()) : '';
  }
}
