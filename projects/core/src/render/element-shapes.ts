/**
 * How each `Element.kind` is drawn.
 *
 * `kind` is open — the spec lists "screen" | "stage" | "exit" | "lavatory" |
 * "gap" | "aisle" and explicitly allows implementation-defined values (§4.4) —
 * so this is a lookup with a sensible default, never an exhaustive switch. An
 * unrecognized kind draws as a labelled rectangle, which is what the pre-1.0
 * renderer did for every kind including the ones it should have distinguished.
 */

export type ElementShape =
  /** A rounded rectangle. The default. */
  | 'rect'
  /** A shallow arc bulging toward the audience — a cinema or theatre screen. */
  | 'screen'
  /** A rectangle with a heavier outline, reading as a raised platform. */
  | 'stage'
  /** A dashed outline: space that is deliberately empty. */
  | 'void';

export interface ElementStyle {
  shape: ElementShape;
  /** Which themed color the element takes. */
  tone: 'neutral' | 'accent' | 'muted';
  /** Whether the element's label is drawn on it. */
  showLabel: boolean;
}

const DEFAULT_STYLE: ElementStyle = { shape: 'rect', tone: 'neutral', showLabel: true };

const STYLES: Readonly<Record<string, ElementStyle>> = {
  screen: { shape: 'screen', tone: 'neutral', showLabel: true },
  stage: { shape: 'stage', tone: 'neutral', showLabel: true },
  pitch: { shape: 'stage', tone: 'muted', showLabel: true },
  field: { shape: 'stage', tone: 'muted', showLabel: true },
  exit: { shape: 'rect', tone: 'accent', showLabel: true },
  door: { shape: 'rect', tone: 'accent', showLabel: true },
  lavatory: { shape: 'rect', tone: 'muted', showLabel: true },
  galley: { shape: 'rect', tone: 'muted', showLabel: true },
  table: { shape: 'rect', tone: 'muted', showLabel: true },
  aisle: { shape: 'void', tone: 'muted', showLabel: false },
  gap: { shape: 'void', tone: 'muted', showLabel: true },
  stairs: { shape: 'void', tone: 'muted', showLabel: true },
};

/** The style for an element kind. Unknown kinds get the labelled rectangle. */
export function elementStyle(kind: string): ElementStyle {
  return STYLES[kind?.toLowerCase()] ?? DEFAULT_STYLE;
}

/**
 * An SVG path for a screen: a shallow arc across the top of its box, bulging
 * downward toward the seats. Drawn as a filled sliver rather than a stroke so
 * it reads at any size.
 */
export function screenPath(x: number, y: number, width: number, height: number): string {
  const bulge = height * 1.6;
  return (
    `M ${x} ${y} ` +
    `Q ${x + width / 2} ${y + bulge} ${x + width} ${y} ` +
    `L ${x + width} ${y + height} ` +
    `Q ${x + width / 2} ${y + height + bulge} ${x} ${y + height} Z`
  );
}
