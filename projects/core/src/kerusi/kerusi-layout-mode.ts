import { Seat, Section } from './kerusi-map.model.js';
import { error, KerusiViolation } from './kerusi-violation.js';

/** The three positioning modes a section may use (§4.5). */
export type SectionLayoutMode = 'grid' | 'freeform' | 'mixed';

/**
 * `Section.layout` is a strict, validated constraint — not a rendering hint.
 * This module is the single implementation of §4.5, shared by the validator and
 * the render-model builder so the two can never disagree about what mode a
 * section is in.
 *
 * Per §4.5:
 *  - `grid`     — every seat MUST have `col`; no seat may have `x` or `y`.
 *  - `freeform` — every seat MUST have both `x` and `y`; no seat may have `col`.
 *  - `mixed`    — every seat MUST have `col` AND both `x` and `y`.
 *
 * A free-text `row` is permitted in every mode: it carries no positional
 * information, so it never participates in the constraint.
 */

/**
 * The positional members a seat or element may carry. Elements are positioned
 * the same way seats are (§4.4), so these predicates take the shape rather than
 * the full `Seat`.
 */
export interface Positioned {
  col?: number;
  x?: number;
  y?: number;
}

/** True when the item carries a usable grid column. */
export function hasCol(item: Positioned): boolean {
  return item.col !== undefined && item.col !== null;
}

/** True when the item carries both freeform coordinates. Neither alone counts. */
export function hasXY(item: Positioned): boolean {
  return item.x !== undefined && item.x !== null && item.y !== undefined && item.y !== null;
}

/** True when the item carries either coordinate — the `grid` prohibition. */
export function hasAnyCoordinate(item: Positioned): boolean {
  return (item.x !== undefined && item.x !== null) || (item.y !== undefined && item.y !== null);
}

/**
 * Infers a section's mode from its seats when `Section.layout` is omitted
 * (§4.5). Returns `undefined` when the seats are inconsistent — the caller MUST
 * reject such a section.
 *
 * An empty section infers `grid`: it satisfies "every seat has `col`" vacuously
 * and grid is the cheaper mode to render.
 */
export function inferSectionLayoutMode(section: Section): SectionLayoutMode | undefined {
  const seats = section.seats ?? [];
  if (seats.length === 0) {
    return 'grid';
  }
  if (seats.every((s) => hasCol(s) && !hasAnyCoordinate(s))) {
    return 'grid';
  }
  if (seats.every((s) => hasXY(s) && !hasCol(s))) {
    return 'freeform';
  }
  // The spec defines no inference for `mixed`; declaring it is required. Every
  // other shape is inconsistent.
  return undefined;
}

/**
 * The mode a section renders in: its declared `layout`, or the inferred one.
 * Falls back to `grid` for an inconsistent section so a renderer can still draw
 * *something* after the validator has reported the fault. Callers that must not
 * render an invalid document should check {@link checkSectionLayout} first.
 */
export function resolveSectionLayoutMode(section: Section): SectionLayoutMode {
  return section.layout ?? inferSectionLayoutMode(section) ?? 'grid';
}

/**
 * Validates a section against §4.5. Returns every violation found, in seat
 * declaration order; an empty array means the section conforms.
 *
 * @param path Document path prefix for the violations, e.g. `sections[1]`.
 */
export function checkSectionLayout(section: Section, path?: string): KerusiViolation[] {
  const seats = section.seats ?? [];

  if (section.layout === undefined) {
    if (inferSectionLayoutMode(section) === undefined) {
      const offender = firstInconsistentSeat(seats);
      return [
        error(
          'section-layout-inconsistent',
          `Section "${section.id}" omits "layout" and its seats mix positioning ` +
            `methods, so no mode can be inferred: seat "${offender?.id}" does not ` +
            'match the section\'s prevailing method. Declare "layout" explicitly, ' +
            'or make every seat use the same method (§4.5).',
          { id: section.id, path },
        ),
      ];
    }
    // An inferred mode is, by construction, satisfied by every seat.
    return [];
  }

  const violations: KerusiViolation[] = [];
  seats.forEach((seat, i) => {
    const seatPath = path ? `${path}.seats[${i}]` : undefined;
    switch (section.layout) {
      case 'grid':
        if (!hasCol(seat)) {
          violations.push(
            error(
              'section-layout-grid',
              `Seat "${seat.id}" is in grid section "${section.id}" but has no ` +
                '"col". Every seat in a grid section must declare "col" ' +
                'explicitly; it is never inferred from array order (§4.5).',
              { id: seat.id, path: seatPath },
            ),
          );
        }
        if (hasAnyCoordinate(seat)) {
          violations.push(
            error(
              'section-layout-grid',
              `Seat "${seat.id}" is in grid section "${section.id}" but carries ` +
                '"x"/"y". No seat in a grid section may have freeform ' +
                'coordinates; use layout "mixed" to combine both (§4.5).',
              { id: seat.id, path: seatPath },
            ),
          );
        }
        break;

      case 'freeform':
        if (!hasXY(seat)) {
          violations.push(
            error(
              'section-layout-freeform',
              `Seat "${seat.id}" is in freeform section "${section.id}" but is ` +
                'missing "x" or "y". Every seat in a freeform section must have ' +
                'both (§4.5).',
              { id: seat.id, path: seatPath },
            ),
          );
        }
        if (hasCol(seat)) {
          violations.push(
            error(
              'section-layout-freeform',
              `Seat "${seat.id}" is in freeform section "${section.id}" but ` +
                'carries "col". No seat in a freeform section may have a grid ' +
                'column; use layout "mixed" to combine both (§4.5).',
              { id: seat.id, path: seatPath },
            ),
          );
        }
        break;

      case 'mixed':
        if (!hasCol(seat) || !hasXY(seat)) {
          violations.push(
            error(
              'section-layout-mixed',
              `Seat "${seat.id}" is in mixed section "${section.id}" but does not ` +
                'have all of "col", "x" and "y". A mixed section requires every ' +
                'seat to carry both addressing methods (§4.5).',
              { id: seat.id, path: seatPath },
            ),
          );
        }
        break;
    }
  });

  return violations;
}

/**
 * The first seat that breaks the section's prevailing positioning method, used
 * to make an "inconsistent" message point at something concrete.
 */
function firstInconsistentSeat(seats: readonly Seat[]): Seat | undefined {
  const gridLike = seats.filter((s) => hasCol(s) && !hasAnyCoordinate(s)).length;
  const freeformLike = seats.filter((s) => hasXY(s) && !hasCol(s)).length;
  return gridLike >= freeformLike
    ? seats.find((s) => !(hasCol(s) && !hasAnyCoordinate(s)))
    : seats.find((s) => !(hasXY(s) && !hasCol(s)));
}
