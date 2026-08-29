import { Element, KerusiMap, Seat, Section } from './kerusi-map.model';
import { KerusiSession, KerusiState, KerusiStateDelta, SeatStatus } from './kerusi-state.model';
import { resolveSeatPrice } from './kerusi-price';
import {
  checkSectionLayout,
  hasAnyCoordinate,
  hasCol,
  hasXY,
  resolveSectionLayoutMode,
} from './kerusi-layout-mode';
import { rowOrderIndexes } from './kerusi-rows';
import { error, errorsOf, KerusiViolation, warning } from './kerusi-violation';

export { errorsOf } from './kerusi-violation';
export type { KerusiViolation, ViolationSeverity } from './kerusi-violation';

/** The spec major version this library implements. */
const SUPPORTED_MAJOR = 1;

/** Valid `transferArmrest` values (§4.3.4). */
const TRANSFER_ARMREST = new Set(['left', 'right', 'both', 'fixed', 'none']);

/**
 * Thrown when a Kerusi document violates a MUST-level rule in the standard.
 * The message names the failing rule and the id that triggered it, so a
 * malformed document is diagnosable rather than surfacing as a generic parse
 * error (spec §4.6, §7).
 *
 * `violations` carries every finding from the same pass, not just the one that
 * was thrown — useful when reporting a document's problems all at once. Use the
 * non-throwing `checkKerusi*` functions when that is the primary goal.
 */
export class KerusiValidationError extends Error {
  constructor(
    message: string,
    /** Short slug of the violated rule, e.g. "seat-type-reference". */
    readonly rule: string,
    /** The id (seat, section, tier, ...) that triggered the failure, if any. */
    readonly id?: string,
    /** Every violation found in the same pass, in document order. */
    readonly violations: readonly KerusiViolation[] = [],
  ) {
    super(message);
    this.name = 'KerusiValidationError';
  }
}

// --- Non-throwing surface ---------------------------------------------------

/**
 * Collects every conformance violation in a {@link KerusiMap}, in document
 * order, without throwing. An empty array means the map is valid.
 *
 * Accepts `unknown` so it can be pointed at freshly parsed JSON: a value that
 * isn't a usable map yields a shape violation rather than a crash.
 */
export function checkKerusiMap(map: unknown): readonly KerusiViolation[] {
  return collectMapViolations(map as KerusiMap);
}

/** Collects every violation in a {@link KerusiState} without throwing. */
export function checkKerusiState(state: unknown): readonly KerusiViolation[] {
  const violations = collectStateEnvelope(state as KerusiState, 'KerusiState');
  const doc = state as KerusiState;
  if (doc && typeof doc === 'object' && (!doc.seats || typeof doc.seats !== 'object')) {
    violations.push(error('state-seats', 'KerusiState is missing the required "seats" object.'));
  } else if (doc && typeof doc === 'object') {
    violations.push(...collectSeatStatusViolations(doc.seats, 'seats'));
  }
  return violations;
}

/** Collects every violation in a {@link KerusiStateDelta} without throwing. */
export function checkKerusiStateDelta(delta: unknown): readonly KerusiViolation[] {
  const violations = collectStateEnvelope(delta as KerusiStateDelta, 'KerusiStateDelta');
  const doc = delta as KerusiStateDelta;
  if (doc && typeof doc === 'object' && (!doc.changes || typeof doc.changes !== 'object')) {
    violations.push(
      error('delta-changes', 'KerusiStateDelta is missing the required "changes" object.'),
    );
  } else if (doc && typeof doc === 'object') {
    violations.push(...collectSeatStatusViolations(doc.changes, 'changes'));
  }
  return violations;
}

/**
 * §5.1.1 applies to every timestamp in a document, `holdExpires` included: a
 * consumer that cannot parse it cannot show a correct hold countdown, which is
 * the one thing the field exists for.
 */
function collectSeatStatusViolations(
  seats: Record<string, SeatStatus> | undefined,
  member: 'seats' | 'changes',
): KerusiViolation[] {
  const violations: KerusiViolation[] = [];
  for (const [seatId, status] of Object.entries(seats ?? {})) {
    if (status?.holdExpires !== undefined && !isRfc3339(status.holdExpires)) {
      violations.push(
        error(
          'seat-status-hold-expires-format',
          `Seat "${seatId}" has "holdExpires": "${status.holdExpires}", which is not ` +
            'an RFC 3339 date-time (§5.1.1).',
          { id: seatId, path: `${member}.${seatId}` },
        ),
      );
    }
  }
  return violations;
}

/** Collects every violation in a {@link KerusiSession} without throwing (§5.3). */
export function checkKerusiSession(session: unknown): readonly KerusiViolation[] {
  const doc = session as KerusiSession;
  if (!doc || typeof doc !== 'object') {
    return [error('session-shape', 'KerusiSession is missing or not an object.')];
  }
  const violations: KerusiViolation[] = [];
  if (!doc.kerusi) {
    violations.push(
      error('session-version', 'KerusiSession is missing the required "kerusi" version member.'),
    );
  } else {
    violations.push(...checkVersion(doc.kerusi, 'KerusiSession', 'session'));
  }
  if (!doc.id) {
    violations.push(error('session-id', 'KerusiSession is missing the required "id" member.'));
  }
  if (!doc.mapId) {
    violations.push(
      error('session-mapid', 'KerusiSession is missing the required "mapId" member.', {
        id: doc.id,
      }),
    );
  }
  for (const member of ['startsAt', 'endsAt'] as const) {
    const value = doc[member];
    if (value !== undefined && !isRfc3339(value)) {
      violations.push(
        error(
          `session-${member.toLowerCase()}-format`,
          `KerusiSession "${member}" is "${value}", which is not an RFC 3339 ` +
            'date-time (§5.1.1).',
          { id: doc.id },
        ),
      );
    }
  }
  return violations;
}

/**
 * An RFC 3339 `date-time` (§5.1.1) — the profile `format: "date-time"` has
 * always meant in the published JSON Schemas.
 *
 * "ISO 8601", which the spec said before rev 13, admits forms a consumer cannot
 * reliably parse: seconds omitted, the basic format without separators, ordinal
 * and week dates, and local times carrying no offset at all. The regex fixes
 * the shape; the calendar check then rejects a date the shape allows but the
 * calendar does not, such as a 31st of February. `Date.parse` cannot stand in
 * for that — it rolls such a date silently into the next month.
 */
const RFC_3339 =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/;

function isRfc3339(value: string): boolean {
  const match = RFC_3339.exec(value);
  if (!match) {
    return false;
  }

  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = match
    .slice(1)
    .map((part) => Number(part ?? 0));

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return false;
  }
  // A second of 60 is a leap second, which RFC 3339 permits.
  if (hour > 23 || minute > 59 || second > 60) {
    return false;
  }
  return offsetHour <= 23 && offsetMinute <= 59;
}

function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/**
 * Validates a map together with the session and/or state that reference it,
 * checking the joins the individual validators cannot see (§5.1, §5.3): a
 * state's `mapId` must be the map's id, its `sessionId` the session's, and the
 * session's `mapId` the map's.
 */
export function validateDocumentSet(docs: {
  map: KerusiMap;
  state?: KerusiState;
  session?: KerusiSession;
}): readonly KerusiViolation[] {
  const { map, state, session } = docs;
  const violations: KerusiViolation[] = [...collectMapViolations(map)];

  if (session) {
    violations.push(...checkKerusiSession(session));
    if (map?.id && session.mapId && session.mapId !== map.id) {
      violations.push(
        error(
          'session-map-mismatch',
          `KerusiSession "${session.id}" references mapId "${session.mapId}", but the ` +
            `supplied map is "${map.id}" (§5.3).`,
          { id: session.id },
        ),
      );
    }
  }

  if (state) {
    violations.push(...checkKerusiState(state));
    if (state.mapId !== undefined && map?.id && state.mapId !== map.id) {
      violations.push(
        error(
          'state-map-mismatch',
          `KerusiState references mapId "${state.mapId}", but the supplied map is ` +
            `"${map.id}" (§5.1).`,
        ),
      );
    }
    if (state.sessionId !== undefined && session && state.sessionId !== session.id) {
      violations.push(
        error(
          'state-session-mismatch',
          `KerusiState references sessionId "${state.sessionId}", but the supplied ` +
            `session is "${session.id}" (§5.1).`,
        ),
      );
    }
  }

  return violations;
}

// --- Throwing surface (signatures unchanged from 0.x) -----------------------

/**
 * Validates a {@link KerusiMap} against the MUST-level rules of spec §4.
 * Throws {@link KerusiValidationError} on the first violation; returns the map
 * unchanged when valid, so it can be used inline.
 *
 * Enforced rules:
 *  - Required members present: `kerusi`, `id`, `legend`, `sections` (§4), and
 *    `kerusi` declares a supported major version.
 *  - Every seat has `col`, or `x`+`y`, or both — never neither (§4.3.1) — and
 *    conforms to its section's declared or inferred `layout` mode (§4.5).
 *  - Section, seat and element ids are unique (§4.1, §4.3, §4.4).
 *  - Every `Seat.type` resolves to a `SeatType.id` in `legend` (§4.6).
 *  - Every `Seat.priceTier` resolves to a `PriceTier.id` (§4.6).
 *  - Every `Seat.row` resolves to a `RowMeta.id` when the section declares
 *    `rows`; opaque free-text otherwise (§4.6).
 *  - Every `Seat.companions[]` entry resolves to another seat in the SAME
 *    section, and the relationship is symmetric (§4.6).
 *  - Every `Element` has the required `id` and `kind` (§4.4), is positioned in
 *    its section's own layout mode, and — in a grid section — carries integer
 *    column and row spans that stay inside the section's rows (§4.4.1, §4.6).
 *  - All resolved currencies across the map are identical (§4.9).
 *
 * Advisory findings never throw; use {@link checkKerusiMap} to see them.
 */
export function validateKerusiMap(map: KerusiMap): KerusiMap {
  throwFirstError(collectMapViolations(map));
  return map;
}

/**
 * Validates a {@link KerusiState} against the MUST-level rules of spec §5.1,
 * including the RFC 3339 timestamp profile of §5.1.1:
 * `kerusi` present and supported, `updatedAt` present, exactly one of
 * `sessionId`/`mapId`, and a `seats` object.
 */
export function validateKerusiState(state: KerusiState): KerusiState {
  throwFirstError(checkKerusiState(state));
  return state;
}

/**
 * Validates a {@link KerusiStateDelta} against the MUST-level rules of §5.2:
 * `kerusi` present and supported, `updatedAt` present, exactly one of
 * `sessionId`/`mapId`, and a `changes` object.
 */
export function validateKerusiStateDelta(delta: KerusiStateDelta): KerusiStateDelta {
  throwFirstError(checkKerusiStateDelta(delta));
  return delta;
}

/** Validates a {@link KerusiSession} against §5.3. */
export function validateKerusiSession(session: KerusiSession): KerusiSession {
  throwFirstError(checkKerusiSession(session));
  return session;
}

function throwFirstError(violations: readonly KerusiViolation[]): void {
  const errors = errorsOf(violations);
  if (errors.length > 0) {
    const first = errors[0];
    throw new KerusiValidationError(first.message, first.rule, first.id, violations);
  }
}

// --- Collectors -------------------------------------------------------------

/**
 * Walks a map and returns every violation in document order. The order matters:
 * `validateKerusiMap` throws the first error, so it must report the same rule
 * the pre-1.0 short-circuiting validator did for any given document.
 */
function collectMapViolations(map: KerusiMap): KerusiViolation[] {
  if (!map || typeof map !== 'object') {
    return [error('map-shape', 'KerusiMap is missing or not an object.')];
  }

  const violations: KerusiViolation[] = [];

  if (!map.kerusi) {
    violations.push(
      error('map-version', 'KerusiMap is missing the required "kerusi" version member.'),
    );
  } else {
    violations.push(...checkVersion(map.kerusi, 'KerusiMap', 'map'));
  }
  if (!map.id) {
    violations.push(error('map-id', 'KerusiMap is missing the required "id" member.'));
  }
  if (!Array.isArray(map.legend)) {
    violations.push(
      error('map-legend', 'KerusiMap is missing the required "legend" array.', { id: map.id }),
    );
  }
  if (!Array.isArray(map.sections)) {
    violations.push(
      error('map-sections', 'KerusiMap is missing the required "sections" array.', { id: map.id }),
    );
  }

  // Without a legend and sections there is nothing further to walk, and
  // reporting a hundred downstream failures would bury the real problem.
  if (!Array.isArray(map.legend) || !Array.isArray(map.sections)) {
    return violations;
  }

  const seatTypeIds = new Set(map.legend.map((t) => t.id));
  const priceTierIds = new Set((map.priceTiers ?? []).map((t) => t.id));
  const currencies = new Set<string>();

  // Tier-level currencies count toward the single-currency rule regardless of
  // whether a seat references the tier.
  for (const tier of map.priceTiers ?? []) {
    if (tier.price?.currency) {
      currencies.add(tier.price.currency);
    }
  }

  const seenSectionIds = new Set<string>();
  const seenSeatIds = new Set<string>();
  const duplicateSections: string[] = [];
  const duplicateSeats: string[] = [];

  map.sections.forEach((section, sectionIndex) => {
    const path = `sections[${sectionIndex}]`;
    violations.push(
      ...collectSectionViolations(section, map, seatTypeIds, priceTierIds, currencies, path),
    );

    if (seenSectionIds.has(section?.id)) {
      duplicateSections.push(section.id);
    }
    seenSectionIds.add(section?.id);

    for (const seat of section?.seats ?? []) {
      if (seenSeatIds.has(seat.id)) {
        duplicateSeats.push(seat.id);
      }
      seenSeatIds.add(seat.id);
    }
  });

  for (const id of duplicateSections) {
    violations.push(
      error('section-id-duplicate', `Section id "${id}" is declared more than once (§4.1).`, {
        id,
      }),
    );
  }
  for (const id of duplicateSeats) {
    violations.push(
      error(
        'seat-id-duplicate',
        `Seat id "${id}" is declared more than once; seat ids must be globally unique ` +
          'within a KerusiMap (§4.3).',
        { id },
      ),
    );
  }

  if (currencies.size > 1) {
    violations.push(
      error(
        'single-currency',
        `KerusiMap mixes currencies (${[...currencies].sort().join(', ')}); ` +
          'exactly one currency must apply to the whole map (§4.9).',
        { id: map.id },
      ),
    );
  }

  return violations;
}

function collectSectionViolations(
  section: Section,
  map: KerusiMap,
  seatTypeIds: Set<string>,
  priceTierIds: Set<string>,
  currencies: Set<string>,
  path: string,
): KerusiViolation[] {
  if (!section || typeof section !== 'object') {
    return [error('section-shape', 'A section is missing or not an object.', { path })];
  }

  const violations: KerusiViolation[] = [];

  if (!section.id) {
    violations.push(error('section-id', 'A section is missing the required "id".', { path }));
  }
  if (!Array.isArray(section.seats)) {
    violations.push(
      error('section-seats', `Section "${section.id}" is missing the required "seats" array.`, {
        id: section.id,
        path,
      }),
    );
    return violations;
  }

  const rowIds = section.rows ? new Set(section.rows.map((r) => r.id)) : null;
  const seatIds = new Set(section.seats.map((s) => s.id));
  const companionsBySeat = new Map<string, Set<string>>();

  section.seats.forEach((seat, seatIndex) => {
    const seatPath = `${path}.seats[${seatIndex}]`;

    // §4.3.1 positioning. Checked before the §4.5 mode rules so a seat with no
    // position at all gets the clearer message rather than a mode complaint.
    if (!hasCol(seat) && !hasXY(seat)) {
      violations.push(
        error(
          'seat-position',
          `Seat "${seat.id}" has neither "col" nor "x"+"y"; a seat must specify ` +
            'at least one positioning method (§4.3.1).',
          { id: seat.id, path: seatPath },
        ),
      );
    }

    // §4.6 type reference.
    if (!seatTypeIds.has(seat.type)) {
      violations.push(
        error(
          'seat-type-reference',
          `Seat "${seat.id}" references unknown type "${seat.type}"; not found in ` +
            'the map legend (§4.6).',
          { id: seat.id, path: seatPath },
        ),
      );
    }

    // §4.6 priceTier reference.
    if (seat.priceTier !== undefined && !priceTierIds.has(seat.priceTier)) {
      violations.push(
        error(
          'seat-pricetier-reference',
          `Seat "${seat.id}" references unknown priceTier "${seat.priceTier}" (§4.6).`,
          { id: seat.id, path: seatPath },
        ),
      );
    }

    // §4.6 row reference — only when the section declares a rows array.
    if (rowIds && seat.row !== undefined && !rowIds.has(seat.row)) {
      violations.push(
        error(
          'seat-row-reference',
          `Seat "${seat.id}" references unknown row "${seat.row}"; not found in ` +
            `section "${section.id}" rows (§4.6).`,
          { id: seat.id, path: seatPath },
        ),
      );
    }

    // §4.3.4 accessibility. Advisory rather than fatal: §7 tells consumers to
    // ignore members they don't recognize instead of rejecting the document.
    const armrest = seat.accessibility?.transferArmrest;
    if (armrest !== undefined && !TRANSFER_ARMREST.has(armrest)) {
      violations.push(
        warning(
          'accessibility-transfer-armrest',
          `Seat "${seat.id}" has transferArmrest "${armrest}", which is not one of ` +
            'left | right | both | fixed | none (§4.3.4).',
          { id: seat.id, path: seatPath },
        ),
      );
    }

    // Collect the resolved currency for the single-currency rule (§4.9).
    const price = resolveSeatPrice(seat, map);
    if (price?.currency) {
      currencies.add(price.currency);
    }

    companionsBySeat.set(seat.id, new Set(seat.companions ?? []));
  });

  // §4.6 companion resolution + symmetry.
  for (const [seatId, companions] of companionsBySeat) {
    for (const companionId of companions) {
      if (!seatIds.has(companionId)) {
        violations.push(
          error(
            'companion-reference',
            `Seat "${seatId}" lists companion "${companionId}", which is not a ` +
              `seat in section "${section.id}" (§4.6).`,
            { id: seatId, path },
          ),
        );
        continue;
      }
      const back = companionsBySeat.get(companionId);
      if (!back || !back.has(seatId)) {
        violations.push(
          error(
            'companion-symmetry',
            `Companion link is not symmetric: seat "${seatId}" lists "${companionId}", ` +
              `but "${companionId}" does not list "${seatId}" in return (§4.6).`,
            { id: seatId, path },
          ),
        );
      }
    }
  }

  // §4.5 layout modes — a strict, validated constraint at v1.0.
  violations.push(...checkSectionLayout(section, path));

  // §4.4 elements.
  violations.push(...collectElementViolations(section, path));

  return violations;
}

function collectElementViolations(section: Section, path: string): KerusiViolation[] {
  const violations: KerusiViolation[] = [];
  const mode = resolveSectionLayoutMode(section);
  const rowIndexes = rowOrderIndexes(section);
  const declaresRows = Boolean(section.rows);
  const seen = new Set<string>();

  (section.elements ?? []).forEach((element: Element, i) => {
    const elementPath = `${path}.elements[${i}]`;

    if (!element.id) {
      violations.push(
        error('element-id', `An element in section "${section.id}" has no "id" (§4.4).`, {
          path: elementPath,
        }),
      );
    } else {
      if (seen.has(element.id)) {
        violations.push(
          error(
            'element-id-duplicate',
            `Element id "${element.id}" is declared more than once in section ` +
              `"${section.id}" (§4.4).`,
            { id: element.id, path: elementPath },
          ),
        );
      }
      seen.add(element.id);
    }

    if (!element.kind) {
      violations.push(
        error('element-kind', `Element "${element.id}" has no "kind" (§4.4).`, {
          id: element.id,
          path: elementPath,
        }),
      );
    }

    // §4.6: an element's row resolves against the registry exactly as a seat's
    // does, and for the same reason — a row that does not exist places nothing.
    if (declaresRows && element.row !== undefined && !rowIndexes.has(element.row)) {
      violations.push(
        error(
          'element-row-unresolved',
          `Element "${element.id}" references unknown row "${element.row}" in ` +
            `section "${section.id}" rows (§4.6).`,
          { id: element.id, path: elementPath },
        ),
      );
    }

    const usesGrid = hasCol(element) || element.row !== undefined;
    const usesFreeform = hasAnyCoordinate(element);

    if (!usesGrid && !usesFreeform) {
      violations.push(
        warning(
          'element-position',
          `Element "${element.id}" has neither "row"/"col" nor "x"/"y"; it cannot be ` +
            'placed within the seating area (§4.4).',
          { id: element.id, path: elementPath },
        ),
      );
      return;
    }

    // §4.4.1 binds an element to its section's positioning mode exactly as §4.5
    // binds its seats: a section whose elements are addressed differently from
    // its seats cannot be laid out deterministically by two renderers. `mixed`
    // permits either, and a freeform element may still carry `row` as a label.
    if (mode === 'grid' && usesFreeform) {
      violations.push(
        error(
          'element-layout-mismatch',
          `Element "${element.id}" carries "x"/"y" in grid section "${section.id}"; ` +
            'a grid element is positioned by "row" and/or "col" (§4.4.1).',
          { id: element.id, path: elementPath },
        ),
      );
    } else if (mode === 'freeform' && hasCol(element)) {
      violations.push(
        error(
          'element-layout-mismatch',
          `Element "${element.id}" carries "col" in freeform section ` +
            `"${section.id}", which has no column grid to place it in (§4.4.1).`,
          { id: element.id, path: elementPath },
        ),
      );
    }

    violations.push(
      ...collectElementSpanViolations(element, section, mode, rowIndexes, elementPath),
    );
  });

  return violations;
}

/**
 * §4.4.1 spans. For a grid-addressed element `width` and `height` are
 * dimensionless cell counts — positive integers, defaulting to 1 — so a
 * fractional or zero span leaves two renderers to disagree about how much space
 * it occupies. They are percentages once `x`/`y` governs placement, where any
 * positive number is meaningful, so nothing is checked there. A mixed section
 * can hold both kinds, one element at a time.
 *
 * A row span is also bounded, and only in a grid section as §4.6 scopes it: an
 * element reaching past the last row in the §4.2.1 order occupies rows that do
 * not exist.
 */
function collectElementSpanViolations(
  element: Element,
  section: Section,
  mode: ReturnType<typeof resolveSectionLayoutMode>,
  rowIndexes: Map<string, number>,
  elementPath: string,
): KerusiViolation[] {
  const gridAddressed = mode === 'grid' || (mode === 'mixed' && !hasAnyCoordinate(element));
  if (!gridAddressed) {
    return [];
  }

  const violations: KerusiViolation[] = [];

  for (const [axis, span] of [
    ['width', element.width],
    ['height', element.height],
  ] as const) {
    if (span !== undefined && (!Number.isInteger(span) || span < 1)) {
      violations.push(
        error(
          'element-span-invalid',
          `Element "${element.id}" has "${axis}": ${span} in grid section ` +
            `"${section.id}"; a grid span is a positive integer count of cells (§4.4.1).`,
          { id: element.id, path: elementPath },
        ),
      );
    }
  }

  const start =
    mode === 'grid' && element.row !== undefined ? rowIndexes.get(element.row) : undefined;
  const span = element.height ?? 1;
  if (start !== undefined && Number.isInteger(span) && span >= 1) {
    const last = start + span - 1;
    if (last > rowIndexes.size - 1) {
      violations.push(
        error(
          'element-row-span-overrun',
          `Element "${element.id}" spans ${span} rows from "${element.row}", ` +
            `reaching past the last row of section "${section.id}" (§4.2.1, §4.6).`,
          { id: element.id, path: elementPath },
        ),
      );
    }
  }

  return violations;
}

function collectStateEnvelope(
  doc: { kerusi?: string; sessionId?: string; mapId?: string; updatedAt?: string },
  typeName: 'KerusiState' | 'KerusiStateDelta',
): KerusiViolation[] {
  if (!doc || typeof doc !== 'object') {
    return [error('state-shape', `${typeName} is missing or not an object.`)];
  }

  const violations: KerusiViolation[] = [];
  const slug = typeName === 'KerusiState' ? 'state' : 'delta';

  if (!doc.kerusi) {
    violations.push(
      error('state-version', `${typeName} is missing the required "kerusi" version member.`),
    );
  } else {
    violations.push(...checkVersion(doc.kerusi, typeName, slug));
  }
  if (!doc.updatedAt) {
    violations.push(
      error('state-updatedat', `${typeName} is missing the required "updatedAt" timestamp.`),
    );
  } else if (!isRfc3339(doc.updatedAt)) {
    violations.push(
      error(
        'state-updatedat-format',
        `${typeName} "updatedAt" is "${doc.updatedAt}", which is not an RFC 3339 ` +
          'date-time (§5.1.1).',
      ),
    );
  }

  const hasSession = doc.sessionId !== undefined && doc.sessionId !== null;
  const hasMap = doc.mapId !== undefined && doc.mapId !== null;
  if (hasSession === hasMap) {
    violations.push(
      error(
        'state-scope',
        `${typeName} must specify exactly one of "sessionId" or "mapId" ` +
          `(found ${hasSession ? 'both' : 'neither'}) (§5.1).`,
      ),
    );
  }

  return violations;
}

/**
 * Checks a document's `kerusi` member declares a major version this library
 * understands. A future *minor* version is accepted — §7 requires consumers to
 * ignore members they don't recognize rather than reject the document — but a
 * different major is not.
 */
function checkVersion(version: string, typeName: string, slug: string): KerusiViolation[] {
  const major = Number.parseInt(String(version).split('.')[0], 10);
  if (Number.isNaN(major) || major !== SUPPORTED_MAJOR) {
    return [
      error(
        `${slug}-version-unsupported`,
        `${typeName} declares kerusi version "${version}"; this library implements ` +
          `${SUPPORTED_MAJOR}.x. A future minor version is accepted, a different major is not.`,
      ),
    ];
  }
  return [];
}
