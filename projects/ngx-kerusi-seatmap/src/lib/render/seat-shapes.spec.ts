import { describe, expect, it } from 'vitest';
import {
  seatBodyPath,
  seatOccupantPath,
  seatOccupantStroke,
  seatRingStroke,
  seatSelectedFrame,
} from './seat-shapes';

/** Every number in an SVG path's `d`, in order. */
const numbers = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

/**
 * Every on-curve point in a `d` string — the endpoints of its `M`/`L`
 * commands and the `(x, y)` at the end of each `A` command — as a flat
 * `[x0, y0, x1, y1, ...]` list. Excludes an `A` command's own `rx ry
 * x-axis-rotation large-arc-flag sweep-flag` numbers, which are not
 * coordinates and would otherwise corrupt a bounding-box check (they are
 * frequently 0, which looks like a valid minimum but isn't one).
 */
function points(d: string): number[] {
  const out: number[] = [];
  const tokens = d.trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i];
    if (cmd === 'M' || cmd === 'L') {
      out.push(Number(tokens[i + 1]), Number(tokens[i + 2]));
      i += 3;
    } else if (cmd === 'A') {
      out.push(Number(tokens[i + 6]), Number(tokens[i + 7]));
      i += 8;
    } else if (cmd === 'Z') {
      i += 1;
    } else {
      i += 1;
    }
  }
  return out;
}

describe('seatBodyPath', () => {
  it('draws a rounded trapezoid: square-ish front, tapered and softer back', () => {
    // A 100x100 box at the origin makes the ratios readable as percentages.
    // Golden value: four corners, each an `L` onto the incoming edge followed
    // by an `A` arc onto the outgoing edge, closed with `Z`.
    expect(seatBodyPath(0, 0, 100, 100)).toBe(
      'M 0.953 7.943 A 8 8 0 0 1 8 0 L 92 0 A 8 8 0 0 1 99.047 7.943 ' +
        'L 92.051 66.242 A 34 34 0 0 1 54 100 L 46 100 A 34 34 0 0 1 7.949 66.242 Z',
    );
  });

  it('is wider at the front than the back', () => {
    // The straight run between the two front corner arcs (the top edge) is
    // 8..92 — 84 units. The straight run between the two back corner arcs
    // (the bottom edge) is 46..54 — 8 units. Both are visible verbatim in
    // the golden value above.
    const d = seatBodyPath(0, 0, 100, 100);
    expect(d).toContain('L 92 0'); // front-right, after the front-left arc
    expect(d).toContain('L 46 100'); // back-left, after the back-right arc
  });

  it('offsets by the box origin', () => {
    expect(seatBodyPath(200, 50, 100, 100)).toBe(
      'M 200.953 57.943 A 8 8 0 0 1 208 50 L 292 50 A 8 8 0 0 1 299.047 57.943 ' +
        'L 292.051 116.242 A 34 34 0 0 1 254 150 L 246 150 A 34 34 0 0 1 207.949 116.242 Z',
    );
  });

  it('scales its radii and taper linearly with the box', () => {
    // Every `A rx ry` pair should scale with the box; a 10x box's radii are a
    // tenth of a 100x box's.
    const small = seatBodyPath(0, 0, 10, 10).match(/A ([\d.]+) ([\d.]+)/g);
    const large = seatBodyPath(0, 0, 100, 100).match(/A ([\d.]+) ([\d.]+)/g);
    expect(small).toEqual(['A 0.8 0.8', 'A 0.8 0.8', 'A 3.4 3.4', 'A 3.4 3.4']);
    expect(large).toEqual(['A 8 8', 'A 8 8', 'A 34 34', 'A 34 34']);
  });

  it('stays inside its own bounding box', () => {
    const p = points(seatBodyPath(0, 0, 100, 100));
    expect(Math.min(...p)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...p)).toBeLessThanOrEqual(100);
  });

  it('stays well-formed — no negative radius, no NaN, four arcs — down to a 1x1 seat', () => {
    // With `BACK_TAPER`/`BACK_RADIUS` fixed as they are, a corner radius never
    // actually exceeds half its adjacent edge for any positive box (both are
    // proportional to the same box, so the ratio is size-invariant) — the
    // roundedPolygon clamp is a safety net rather than something reachable
    // through these constants. This still pins the tiny-seat case down.
    const d = seatBodyPath(0, 0, 1, 1);
    const p = points(d);
    expect(p.every((v) => Number.isFinite(v))).toBe(true);
    expect(Math.min(...p)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...p)).toBeLessThanOrEqual(1);
    expect(d.match(/A /g)).toHaveLength(4);
  });

  it('insets uniformly, for the selected core to reuse', () => {
    const outer = points(seatBodyPath(0, 0, 28, 28));
    const inner = points(seatBodyPath(0, 0, 28, 28, 1.4));
    // Every inner extreme sits strictly inside the outer shape.
    expect(Math.min(...inner)).toBeGreaterThan(Math.min(...outer));
    expect(Math.max(...inner)).toBeLessThan(Math.max(...outer));
  });
});

describe('seatSelectedFrame', () => {
  it("takes its width from the seat's short edge", () => {
    expect(seatSelectedFrame(28, 28)).toBeCloseTo(2.8);
    expect(seatSelectedFrame(40, 20)).toBeCloseTo(2);
  });

  it('keeps the core, inset by the frame, inside the seat body', () => {
    const frame = seatSelectedFrame(28, 28);
    const core = points(seatBodyPath(0, 0, 28, 28, frame));
    const body = points(seatBodyPath(0, 0, 28, 28));
    expect(Math.min(...core)).toBeGreaterThan(Math.min(...body));
    expect(Math.max(...core)).toBeLessThan(Math.max(...body));
  });

  it('insets to an exact scaled copy, so a mark clearing the body clears the core', () => {
    // This is what lets the selected seat draw its occupant and wheelchair dot
    // to the core's box and inherit every clearance they had against the body —
    // and what keeps the frame width free to change without re-checking them.
    const frame = seatSelectedFrame(100, 100);
    expect(seatBodyPath(0, 0, 100, 100, frame)).toBe(
      seatBodyPath(frame, frame, 100 - frame * 2, 100 - frame * 2),
    );
  });

  it('still answers to its old name, which is exported', () => {
    expect(seatRingStroke).toBe(seatSelectedFrame);
  });
});

describe('seatOccupantPath', () => {
  const d = seatOccupantPath(0, 0, 100, 100);

  it('stays inside the seat box', () => {
    const n = numbers(d);
    // Absolute commands only after the two relative head arcs, which are
    // deltas — so check the shape's declared extremes instead.
    expect(Math.min(...n)).toBeGreaterThanOrEqual(-31);
    expect(Math.max(...n)).toBeLessThanOrEqual(100);
  });

  it('puts the head toward the front, above the torso', () => {
    // Head centre at 0.30h, shoulders at 0.50h: the figure faces "up".
    expect(d).toContain('M 34.5 30');
    expect(d).toContain('M 28 86');
  });

  it('clears the tapered body on both sides', () => {
    // Torso spans 0.28-0.72; even the back edge — the narrowest point of the
    // body, at a 0.12 taper per side — only comes in to 0.12-0.88.
    expect(28).toBeGreaterThan(100 * 0.12);
    expect(72).toBeLessThan(100 * (1 - 0.12));
  });

  it('is two subpaths, so it draws as one node with one fill', () => {
    expect(d.match(/M /g)).toHaveLength(2);
    expect(d.match(/Z/g)).toHaveLength(2);
  });
});

describe('seatOccupantStroke', () => {
  it("takes its width from the seat's short edge", () => {
    expect(seatOccupantStroke(100, 100)).toBeCloseTo(5);
    expect(seatOccupantStroke(40, 20)).toBeCloseTo(1);
  });
});
