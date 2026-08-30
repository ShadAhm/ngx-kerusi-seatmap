/**
 * The seat glyph: the marks drawn inside a placed seat's box.
 *
 * A seat's box is always a rounded square, so the box alone cannot say which
 * way the seat faces. These shapes do. Every coordinate is relative to the
 * placed box, and **front is the top edge** when `rotation` is 0 — the seat
 * `<g>` carries the rotation, so a glyph drawn to that convention turns with it
 * for free.
 *
 * Kept here, next to `element-shapes`, rather than inlined in the template: the
 * ratios below are the whole design, and they are worth testing.
 */

/**
 * Rounds a coordinate for the `d` attribute.
 *
 * The ratios below are decimals, so 100 * 0.28 lands on 28.000000000000004.
 * Three places is far finer than a viewBox unit ever renders and keeps the
 * emitted path readable.
 */
function r(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** How far the back edge tapers in, per side, as a fraction of the front width. */
const BACK_TAPER = 0.12;
/** Corner radius at the front (square-ish), as a fraction of the short edge. */
const FRONT_RADIUS = 0.08;
/** Corner radius at the back (soft, so the taper reads as a back), same units. */
const BACK_RADIUS = 0.34;

/** The selected seat's frame, as a fraction of the seat's short edge. */
const SELECTED_FRAME = 0.1;
/** The held figure's outline stroke, same units. */
const OCCUPANT_STROKE = 0.05;

type Point = readonly [number, number];

/**
 * A closed path through `points`, each corner rounded to its own radius.
 *
 * For each vertex: step back along the incoming edge by `radius`, then arc to
 * a point the same distance along the outgoing edge. A radius is clamped to
 * half the shorter of its two adjacent edges, so a tiny seat cannot fold a
 * corner back on itself. `points` must run clockwise in screen coordinates
 * (y down) — that is what makes every corner the same `sweep-flag`.
 */
function roundedPolygon(points: readonly Point[], radii: readonly number[]): string {
  const n = points.length;
  const dist = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const along = (from: Point, to: Point, d: number): Point => {
    const len = dist(from, to);
    if (len === 0) return from;
    const t = d / len;
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
  };

  let d = '';
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const radius = Math.min(radii[i], dist(prev, curr) / 2, dist(curr, next) / 2);
    const a = along(curr, prev, radius);
    const b = along(curr, next, radius);
    d += i === 0 ? `M ${r(a[0])} ${r(a[1])} ` : `L ${r(a[0])} ${r(a[1])} `;
    d += `A ${r(radius)} ${r(radius)} 0 0 1 ${r(b[0])} ${r(b[1])} `;
  }
  return `${d.trim()} Z`;
}

/**
 * The seat outline: a rounded trapezoid, square-ish at the front and tapered
 * at the back, so which way a seat faces is legible from the outline alone —
 * no separate frame mark is drawn on top of it.
 *
 * `inset` shrinks the whole shape uniformly (used to derive the selected
 * seat's core, which must stay just inside this outline). It shrinks the
 * bounding box rather than offsetting each edge along its own normal, so the
 * tapered sides move in slightly less than the front and back do — at a 0.12
 * taper that is a ~0.7% (cos 7°) difference, well under a viewBox unit and not
 * worth a true polygon offset for.
 *
 * Because a seat is square, an inset here is exactly a scaled copy about the
 * centre: `seatBodyPath(x, y, s, s, k)` and `seatBodyPath(x + k, y + k, s - 2k,
 * s - 2k)` emit the same `d`. {@link seatSelectedFrame} leans on that.
 */
export function seatBodyPath(
  x: number,
  y: number,
  width: number,
  height: number,
  inset = 0,
): string {
  const ix = x + inset;
  const iy = y + inset;
  const iw = width - inset * 2;
  const ih = height - inset * 2;
  const edge = Math.min(iw, ih);
  const taper = iw * BACK_TAPER;

  const points: Point[] = [
    [ix, iy], // front-left
    [ix + iw, iy], // front-right
    [ix + iw - taper, iy + ih], // back-right
    [ix + taper, iy + ih], // back-left
  ];
  const radii = [edge * FRONT_RADIUS, edge * FRONT_RADIUS, edge * BACK_RADIUS, edge * BACK_RADIUS];
  return roundedPolygon(points, radii);
}

/**
 * The width of the frame around a selected seat's core — feed it straight to
 * {@link seatBodyPath}'s `inset` to get the core.
 *
 * A seat is always square: `section-layout` places every one of them as
 * `size × size`, in both the grid and the freeform mode. That makes the inset
 * shape an *exact* scaled copy of the body about its centre, not merely a
 * similar-looking one, so any mark that clears the body also clears the core
 * when it is drawn to the core's own box. That is what lets the frame width
 * stay a free tuning knob: nothing downstream has to be re-checked when it
 * changes.
 */
export function seatSelectedFrame(width: number, height: number): number {
  return Math.min(width, height) * SELECTED_FRAME;
}

/**
 * @deprecated Renamed to {@link seatSelectedFrame}. The selected mark is a
 * frame around a filled core now, not a stroked ring, so "stroke" no longer
 * describes what the number is for.
 */
export const seatRingStroke = seatSelectedFrame;

/**
 * A person seated in the seat, head toward the front: the non-colour cue for
 * "you have this one", "someone is holding this one" or "someone has this
 * one" — see {@link seatFill}'s note on why colour no longer carries status.
 *
 * Head and torso are two subpaths of one path, so the silhouette is a single
 * node taking a single fill (or, for the held/"in progress" variant, a single
 * stroke). It is drawn *without* the label's counter-rotation, so the
 * occupant leans with the seat and reinforces which way it faces.
 *
 * It clears the tapered body on both axes: the torso spans 0.28–0.72 of the
 * width, well inside the back edge, which even at its narrowest (a 0.12
 * taper) is still 0.12–0.88. The margin is slim at the two hip corners,
 * though, so pass the box the figure is meant to sit *on*: a selected seat
 * draws it to the core's box, not the seat's, or the hips cross the frame.
 *
 * The ratios assume a square box, which is what `section-layout` always
 * places. On a wide box the head, sized from the width, would outgrow the
 * height.
 */
export function seatOccupantPath(x: number, y: number, width: number, height: number): string {
  const cx = r(x + width * 0.5);
  const headY = r(y + height * 0.3);
  const radius = r(width * 0.155);

  // Two 180° arcs, because an SVG circle cannot be a subpath.
  const head =
    `M ${r(cx - radius)} ${headY} ` +
    `a ${radius} ${radius} 0 1 1 ${r(radius * 2)} 0 ` +
    `a ${radius} ${radius} 0 1 1 ${r(-radius * 2)} 0 Z`;

  const shoulderY = r(y + height * 0.5);
  const hipY = r(y + height * 0.86);
  const leftX = r(x + width * 0.28);
  const rightX = r(x + width * 0.72);
  const easeY = r(y + height * 0.58);
  const shoulderIn = width * 0.08;

  const torso =
    `M ${leftX} ${hipY} ` +
    `C ${leftX} ${easeY} ${r(leftX + shoulderIn)} ${shoulderY} ${cx} ${shoulderY} ` +
    `C ${r(rightX - shoulderIn)} ${shoulderY} ${rightX} ${easeY} ${rightX} ${hipY} Z`;

  return `${head} ${torso}`;
}

/** The stroke width for the held variant of {@link seatOccupantPath} — drawn hollow. */
export function seatOccupantStroke(width: number, height: number): number {
  return Math.min(width, height) * OCCUPANT_STROKE;
}
