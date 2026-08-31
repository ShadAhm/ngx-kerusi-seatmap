import {
  cssVar,
  DEFAULT_KERUSI_COLORS,
  formatMoney,
  occupantFillFor,
  occupantStrokeFor,
  readableOn,
  seatBodyPath,
  seatCoreFill,
  seatOccupantPath,
  seatOccupantStroke,
  seatSelectedFrame,
  seatWashFill,
} from '@kerusiweb/core';
import type { KerusiSeatmapColors, RenderLegendEntry, SeatOccupantVariant } from '@kerusiweb/core';

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

export interface KerusiLegendProps {
  /** From `RenderMap.legend`. */
  legend: readonly RenderLegendEntry[];
  locale?: string;
  colors?: Required<KerusiSeatmapColors>;
  /** Whether an available seat takes its type color — mirrors the seatmap prop. */
  typeColors?: boolean;
  showPrices?: boolean;
  /** Hide types no seat in the rendered map actually uses. */
  hideUnusedTypes?: boolean;
  headingSeatTypes?: string;
  headingAvailability?: string;
}

/** The swatch's viewBox edge; the seat glyph is drawn to fill it. */
const GLYPH_SIZE = 16;
const GLYPH_BODY = seatBodyPath(0, 0, GLYPH_SIZE, GLYPH_SIZE);

/** The selected swatch's frame width, and the core it leaves inside itself. */
const GLYPH_FRAME = seatSelectedFrame(GLYPH_SIZE, GLYPH_SIZE);
const GLYPH_CORE_SIZE = GLYPH_SIZE - GLYPH_FRAME * 2;
const GLYPH_CORE = seatBodyPath(0, 0, GLYPH_SIZE, GLYPH_SIZE, GLYPH_FRAME);

const GLYPH_OCCUPANT = seatOccupantPath(0, 0, GLYPH_SIZE, GLYPH_SIZE);
const GLYPH_OCCUPANT_STROKE = seatOccupantStroke(GLYPH_SIZE, GLYPH_SIZE);

/** The selected swatch's figure sits on the core, so it is drawn to the core. */
const GLYPH_CORE_OCCUPANT = seatOccupantPath(
  GLYPH_FRAME,
  GLYPH_FRAME,
  GLYPH_CORE_SIZE,
  GLYPH_CORE_SIZE,
);
const GLYPH_CORE_OCCUPANT_STROKE = seatOccupantStroke(GLYPH_CORE_SIZE, GLYPH_CORE_SIZE);

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
 * It is opt-in: `<KerusiSeatmap showLegend />` renders it inline, or use
 * `<KerusiLegend>` directly to place it anywhere.
 */
export function KerusiLegend({
  legend,
  locale = 'en',
  colors = DEFAULT_KERUSI_COLORS,
  typeColors = true,
  showPrices = true,
  hideUnusedTypes = true,
  headingSeatTypes = 'Seat types',
  headingAvailability = 'Availability',
}: KerusiLegendProps) {
  const types = legend.filter((entry) => !hideUnusedTypes || entry.seatCount > 0);
  const statuses = statusEntries(colors);

  return (
    <div className="kerusi-legend">
      {types.length > 0 && (
        <div className="kerusi-legend__block">
          <h4 className="kerusi-legend__heading">{headingSeatTypes}</h4>
          <ul className="kerusi-legend__list">
            {types.map((entry) => {
              const typeColor = (typeColors && entry.color) || null;
              const price = entry.price ? formatMoney(entry.price, locale) : '';
              return (
                <li key={entry.id} className="kerusi-legend__item">
                  <span
                    className="kerusi-legend__swatch"
                    aria-hidden="true"
                    style={{
                      background: typeColor ?? cssVar('availableBg', colors.availableBg),
                      // Mirrors `seatTextFill`: only a document-supplied color
                      // needs guessing at.
                      color: typeColor
                        ? readableOn(typeColor)
                        : cssVar('availableFg', colors.availableFg),
                    }}
                  />
                  <span className="kerusi-legend__label">{entry.label}</span>
                  {showPrices && price && <span className="kerusi-legend__price">{price}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="kerusi-legend__block">
        <h4 className="kerusi-legend__heading">{headingAvailability}</h4>
        <ul className="kerusi-legend__list">
          {statuses.map((status) => (
            <li key={status.key} className="kerusi-legend__item">
              {/* Shape carries status now, so every swatch draws the seat glyph
                  rather than a flat colour — a flat swatch would teach a cue
                  the map itself no longer uses. */}
              <svg
                className="kerusi-legend__swatch kerusi-legend__swatch--glyph"
                aria-hidden="true"
                focusable="false"
                viewBox={`0 0 ${GLYPH_SIZE} ${GLYPH_SIZE}`}
              >
                <path d={GLYPH_BODY} style={{ fill: status.fill }} />
                {hasWash(status.kind) && (
                  <path
                    d={GLYPH_BODY}
                    style={{ fill: seatWashFill(status.kind, colors) }}
                    opacity="0.5"
                  />
                )}
                {status.kind === 'selected' && (
                  /* Two tones, same as the map: the body above is the frame,
                     this is the core inside it. */
                  <path d={GLYPH_CORE} style={{ fill: seatCoreFill(colors) }} />
                )}
                {hasOccupant(status.kind) && (
                  <path
                    d={status.kind === 'selected' ? GLYPH_CORE_OCCUPANT : GLYPH_OCCUPANT}
                    className={`kerusi-legend__occupant kerusi-legend__occupant--${status.kind}`}
                    strokeWidth={
                      status.kind === 'selected'
                        ? GLYPH_CORE_OCCUPANT_STROKE
                        : GLYPH_OCCUPANT_STROKE
                    }
                    style={{
                      fill: occupantFillFor(status.kind, colors),
                      stroke: occupantStrokeFor(status.kind, colors),
                    }}
                  />
                )}
              </svg>
              <span className="kerusi-legend__label">{status.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Colour means seat type; shape means status (see `seatFill`'s doc comment).
// Held and booked swatches share the plain "available" body colour — the map's
// colour there is always whatever the seat's own type supplies, which the
// legend has no single value for — and are told apart by their wash and
// occupant figure instead, same as on the map.
function statusEntries(colors: Required<KerusiSeatmapColors>): StatusEntry[] {
  const available = cssVar('availableBg', colors.availableBg);
  return [
    { key: 'available', label: 'Available', kind: 'plain', fill: available },
    {
      key: 'selected',
      label: 'Selected',
      kind: 'selected',
      fill: cssVar('selectedBg', colors.selectedBg),
    },
    { key: 'held', label: 'On hold', kind: 'held', fill: available },
    { key: 'booked', label: 'Booked', kind: 'booked', fill: available },
    {
      key: 'blocked',
      label: 'Blocked',
      kind: 'blocked',
      fill: cssVar('blockedBg', colors.blockedBg),
    },
  ];
}

function hasWash(kind: StatusKind): kind is 'held' | 'booked' {
  return kind === 'held' || kind === 'booked';
}

function hasOccupant(kind: StatusKind): kind is SeatOccupantVariant {
  return kind === 'selected' || kind === 'held' || kind === 'booked';
}
