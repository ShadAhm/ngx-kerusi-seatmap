import { RenderSeat } from '../render/render-model';

/**
 * Theming for `<kerusi-seatmap>`.
 *
 * Color means seat type; shape means status. The pre-1.0 renderer colored
 * purely by availability, so `SeatType.color` — the spec's own suggested
 * render color (§4.7) — was parsed and then ignored, and a map could not
 * color its own types. A later revision swung the other way and let status
 * override the type color, which hid the type color on every held or booked
 * seat — exactly where a busy map needed it most. Now a seat keeps its type
 * color everywhere; status is read from a dimming wash and an occupant figure
 * instead (see {@link seatFill}). `selected` is the one deliberate exception:
 * it still owns the color outright, so your own picks are never ambiguous.
 *
 * Selection is also the one state drawn from *two* tones rather than one:
 * `selectedBg` frames the seat and `selectedFg` fills a core inside it (see
 * {@link seatCoreFill}). An earlier revision had this the other way round — a
 * near-white rim around a mid-purple middle — which put the low-contrast tone
 * on the outside boundary, so a selected seat dissolved into a light page and
 * sank into a dark one. Holding both a light and a dark tone means one of them
 * always separates from the page, whichever way a consumer has themed it, and
 * the library never has to ask which that is.
 */
export interface KerusiSeatmapColors {
  /** An available seat with no type color. */
  availableBg?: string;
  availableFg?: string;
  /**
   * A seat the user has picked. The one status that still owns the seat's
   * color outright — see {@link seatFill} — so your own picks always pop out
   * of the map. `selectedBg` frames the seat and `selectedFg` fills the core
   * inside that frame, which is also what the label and the occupant figure
   * are tinted with. Both carry real visual weight, so override them as a
   * pair; swapping the two gives the inverse treatment, a light frame around
   * a dark core, which works just as well.
   */
  selectedBg?: string;
  selectedFg?: string;
  /**
   * Sold. The seat keeps its type color; `bookedBg` is the dimming wash drawn
   * over it and `bookedFg` tints the solid occupant figure that marks it.
   */
  bookedBg?: string;
  bookedFg?: string;
  /**
   * Someone else's checkout in progress. `heldBg` washes the seat's type
   * color and `heldFg` strokes the hollow occupant figure that marks it —
   * hollow because the hold is provisional, not settled.
   */
  heldBg?: string;
  heldFg?: string;
  /** Withheld by the venue: no occupant, so grey is the whole signal. */
  blockedBg?: string;
  blockedFg?: string;

  /** Non-bookable features: screens, stages, lavatories. */
  elementBg?: string;
  elementFg?: string;
  /** Exits and doors, which should stand out from other fixtures. */
  elementAccentBg?: string;
  elementAccentFg?: string;
  /** Aisles, gaps and other deliberately empty space. */
  elementMutedBg?: string;
  elementMutedFg?: string;

  /** The keyboard focus ring. */
  focusRing?: string;
  /** Behind the seating area. `transparent` by default. */
  backdrop?: string;
}

export const DEFAULT_KERUSI_COLORS: Required<KerusiSeatmapColors> = {
  availableBg: '#76d75d',
  availableFg: '#123a08',
  selectedBg: '#7854af',
  selectedFg: '#f3ecff',
  bookedBg: '#5e0c17',
  bookedFg: '#ffc9d0',
  heldBg: '#4a3500',
  heldFg: '#ffe1a8',
  blockedBg: '#5a616e',
  blockedFg: '#d2d7df',
  elementBg: '#d7deea',
  elementFg: '#3a4353',
  elementAccentBg: '#4c8bf5',
  elementAccentFg: '#ffffff',
  elementMutedBg: '#eef1f6',
  elementMutedFg: '#6b7385',
  focusRing: '#1b1f27',
  backdrop: 'transparent',
};

/**
 * A palette value as a CSS custom property, with the resolved `[colors]` value
 * as its fallback.
 *
 * This is what makes the theme reachable from a stylesheet. The palette is
 * still a TypeScript object, but every value it produces is written as
 * `var(--kerusi-selected-bg, #7854af)`, so a consumer has three tiers to work
 * with, in precedence order:
 *
 *   a `--kerusi-*` property in their own CSS  →  the `[colors]` input  →  the
 *   library default
 *
 * The custom property is never set by the library itself, which is what keeps
 * that order honest: if the component wrote the input onto the host, the input
 * would always beat the stylesheet and the CSS tier would be decorative.
 *
 * `SeatType.color` deliberately does not go through here. That is the
 * document's own value under §4.7, not the theme's, and {@link readableOn}
 * still has to be able to parse it.
 */
export function cssVar(key: keyof KerusiSeatmapColors, value: string): string {
  return `var(${cssVarName(key)}, ${value})`;
}

/** `selectedBg` → `--kerusi-selected-bg`. */
export function cssVarName(key: keyof KerusiSeatmapColors): string {
  return `--kerusi-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/**
 * The fill for a seat's body, in precedence order:
 *
 *   selected → blocked → `SeatType.color` → available
 *
 * For a selected seat this is the *frame*: {@link seatCoreFill}'s core is drawn
 * inside it and covers most of the body, so `selectedBg` reads as a border
 * rather than as the seat's area.
 *
 * A held or booked seat is deliberately *not* in this list: it keeps its type
 * color, same as an available one, because status is read from
 * {@link seatOccupantVariant}'s figure and {@link seatWashFill}'s wash
 * instead. Hiding the type color behind a status hue was the bug this
 * replaced — see the module doc comment. `blocked` still gets its own fill,
 * because a seat withheld by the venue has no occupant to draw; grey is the
 * whole signal, same as before. Attributes never affect the fill — §4.3.3
 * makes them descriptive tags, not a rendering category.
 */
export function seatFill(
  seat: RenderSeat,
  selected: boolean,
  colors: Required<KerusiSeatmapColors>,
  useTypeColors: boolean,
): string {
  if (selected) {
    return cssVar('selectedBg', colors.selectedBg);
  }
  if (seat.status === 'blocked') {
    return cssVar('blockedBg', colors.blockedBg);
  }
  return (useTypeColors && seat.typeColor) || cssVar('availableBg', colors.availableBg);
}

/**
 * The bright core inside a selected seat's frame — the second of the two tones
 * selection is drawn from, see the module doc comment. Everything drawn over
 * the core (the label, the occupant figure, the wheelchair marker) is tinted
 * `selectedBg` to read against it.
 */
export function seatCoreFill(colors: Required<KerusiSeatmapColors>): string {
  return cssVar('selectedFg', colors.selectedFg);
}

/**
 * The label color to pair with {@link seatFill} — except for a selected seat,
 * where the label sits on {@link seatCoreFill}'s core rather than on the frame,
 * so the two tones swap round.
 */
export function seatTextFill(
  seat: RenderSeat,
  selected: boolean,
  colors: Required<KerusiSeatmapColors>,
  useTypeColors: boolean,
): string {
  if (selected) {
    return cssVar('selectedBg', colors.selectedBg);
  }
  if (seat.status === 'blocked') {
    return cssVar('blockedFg', colors.blockedFg);
  }
  return useTypeColors && seat.typeColor
    ? readableOn(seat.typeColor)
    : cssVar('availableFg', colors.availableFg);
}

/** Which occupant figure marks a seat, if any — see {@link seatFill}. */
export type SeatOccupantVariant = 'selected' | 'held' | 'booked';

/**
 * The occupant figure for a seat, or `null` for a seat with nothing to draw:
 * available (nobody there yet) and blocked (nobody ever will be).
 */
export function seatOccupantVariant(
  seat: RenderSeat,
  selected: boolean,
): SeatOccupantVariant | null {
  if (selected) {
    return 'selected';
  }
  if (seat.status === 'held' || seat.status === 'booked') {
    return seat.status;
  }
  return null;
}

/**
 * The tint for an occupant figure: solid `selectedBg`/`bookedFg` for a seat
 * that is settled (yours, or someone else's), or `heldFg` for the hollow
 * outline that marks a hold still in progress. A selected seat's figure is
 * drawn on {@link seatCoreFill}'s core, so it takes the frame's color rather
 * than the core's — the opposite way round from every other variant, which
 * sits on the seat's own fill.
 */
export function occupantTint(
  variant: SeatOccupantVariant,
  colors: Required<KerusiSeatmapColors>,
): string {
  switch (variant) {
    case 'selected':
      return cssVar('selectedBg', colors.selectedBg);
    case 'held':
      return cssVar('heldFg', colors.heldFg);
    case 'booked':
      return cssVar('bookedFg', colors.bookedFg);
  }
}

/**
 * The dimming wash drawn over a held or booked seat's type color, so a taken
 * seat still recedes even though its hue no longer changes.
 */
export function seatWashFill(
  status: 'held' | 'booked',
  colors: Required<KerusiSeatmapColors>,
): string {
  return status === 'held' ? cssVar('heldBg', colors.heldBg) : cssVar('bookedBg', colors.bookedBg);
}

/**
 * The occupant figure's fill: solid for `selected`/`booked`, `none` for
 * `held` — a hold in progress draws as a hollow outline instead. Pair with
 * {@link occupantStrokeFill}, which is the exact inverse.
 */
export function occupantFillFor(
  variant: SeatOccupantVariant,
  colors: Required<KerusiSeatmapColors>,
): string {
  return variant === 'held' ? 'none' : occupantTint(variant, colors);
}

/** The occupant figure's stroke: only the hollow `held` variant has one. */
export function occupantStrokeFor(
  variant: SeatOccupantVariant,
  colors: Required<KerusiSeatmapColors>,
): string {
  return variant === 'held' ? occupantTint(variant, colors) : 'none';
}

/** Element fill for a shape tone. */
export function elementFill(
  tone: 'neutral' | 'accent' | 'muted',
  colors: Required<KerusiSeatmapColors>,
): string {
  return tone === 'accent'
    ? cssVar('elementAccentBg', colors.elementAccentBg)
    : tone === 'muted'
      ? cssVar('elementMutedBg', colors.elementMutedBg)
      : cssVar('elementBg', colors.elementBg);
}

/** Element label color for a shape tone. */
export function elementTextFill(
  tone: 'neutral' | 'accent' | 'muted',
  colors: Required<KerusiSeatmapColors>,
): string {
  return tone === 'accent'
    ? cssVar('elementAccentFg', colors.elementAccentFg)
    : tone === 'muted'
      ? cssVar('elementMutedFg', colors.elementMutedFg)
      : cssVar('elementFg', colors.elementFg);
}

/**
 * Black or white, whichever reads better on the given color. Used only for a
 * `SeatType.color` the document chose, where the library cannot know what
 * foreground the author intended.
 *
 * Uses the WCAG relative-luminance formula rather than a naive channel average,
 * so a saturated green and a saturated blue of the same average brightness get
 * the contrast each actually needs.
 */
export function readableOn(background: string): string {
  const rgb = parseHex(background);
  if (!rgb) {
    return '#000000';
  }
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

/** `#rgb` or `#rrggbb` to channel values. Returns `undefined` for anything else. */
function parseHex(color: string): [number, number, number] | undefined {
  const hex = color.trim().replace(/^#/, '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) {
    return undefined;
  }
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}
