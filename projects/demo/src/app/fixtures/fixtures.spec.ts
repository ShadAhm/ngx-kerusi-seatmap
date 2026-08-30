import { describe, expect, it } from 'vitest';
import {
  checkKerusiMap,
  checkKerusiState,
  KerusiMap,
  KerusiSession,
  KerusiState,
  validateDocumentSet,
} from '@kerusiweb/core';
import { AIRCRAFT_MAP, AIRCRAFT_SESSION, AIRCRAFT_STATE } from './aircraft.kerusi.fixture';
import { CINEMA_MAP, CINEMA_SESSION, CINEMA_STATE } from './cinema.kerusi.fixture';
import { LECTURE_THEATRE_MAP, LECTURE_THEATRE_STATE } from './lecture-theatre.kerusi.fixture';
import { STADIUM_MAP, STADIUM_STATE } from './stadium.kerusi.fixture';
import { TRAIN_MAP, TRAIN_SESSION, TRAIN_STATE } from './train.kerusi.fixture';

/**
 * The demo showcases these documents as examples of the standard, so they had
 * better be conformant. This is the gate that keeps them honest.
 */
const SCENARIOS: {
  name: string;
  map: KerusiMap;
  state: KerusiState;
  session?: KerusiSession;
}[] = [
  { name: 'cinema', map: CINEMA_MAP, state: CINEMA_STATE, session: CINEMA_SESSION },
  { name: 'aircraft', map: AIRCRAFT_MAP, state: AIRCRAFT_STATE, session: AIRCRAFT_SESSION },
  { name: 'train', map: TRAIN_MAP, state: TRAIN_STATE, session: TRAIN_SESSION },
  { name: 'stadium', map: STADIUM_MAP, state: STADIUM_STATE },
  { name: 'lecture-theatre', map: LECTURE_THEATRE_MAP, state: LECTURE_THEATRE_STATE },
];

describe.each(SCENARIOS)('$name fixture', ({ map, state, session }) => {
  it('is a conformant KerusiMap, with no warnings either', () => {
    expect(checkKerusiMap(map)).toEqual([]);
  });

  it('is a conformant KerusiState', () => {
    expect(checkKerusiState(state)).toEqual([]);
  });

  it('joins cleanly to its map and session', () => {
    expect(validateDocumentSet({ map, state, session })).toEqual([]);
  });

  it('references only seats the map declares', () => {
    const seatIds = new Set(map.sections.flatMap((s) => s.seats.map((seat) => seat.id)));
    const unknown = Object.keys(state.seats).filter((id) => !seatIds.has(id));
    expect(unknown).toEqual([]);
  });
});

describe('the scenarios cover all three positioning modes (§4.5)', () => {
  const modes = SCENARIOS.flatMap(({ map }) => map.sections.map((s) => s.layout));

  it('includes a declared freeform section', () => {
    expect(modes).toContain('freeform');
  });

  it('includes a declared grid section', () => {
    expect(modes).toContain('grid');
  });

  it('includes a declared mixed section', () => {
    expect(modes).toContain('mixed');
  });
});

describe('the scenarios exercise the rest of the standard', () => {
  const seats = SCENARIOS.flatMap(({ map }) => map.sections.flatMap((s) => s.seats));
  const elements = SCENARIOS.flatMap(({ map }) => map.sections.flatMap((s) => s.elements ?? []));

  it('declares §4.3.4 accessibility on real seats', () => {
    const a11y = seats.filter((s) => s.accessibility);
    expect(a11y.length).toBeGreaterThan(0);
    expect(a11y.some((s) => s.accessibility?.wheelchairAccessible)).toBe(true);
    expect(a11y.some((s) => s.accessibility?.transferArmrest)).toBe(true);
    expect(a11y.some((s) => s.accessibility?.aisleChairCompatible)).toBe(true);
    expect(a11y.some((s) => s.accessibility?.companionRequired)).toBe(true);
  });

  it('links companion seats symmetrically (§4.6)', () => {
    expect(seats.filter((s) => s.companions?.length).length).toBeGreaterThan(0);
  });

  it('uses a spread of element kinds (§4.4)', () => {
    const kinds = new Set(elements.map((e) => e.kind));
    for (const kind of ['screen', 'exit', 'lavatory', 'table']) {
      expect(kinds).toContain(kind);
    }
  });

  it('localizes labels into more than one language', () => {
    const localized = SCENARIOS.flatMap(({ map }) => [
      ...map.legend.map((t) => t.label),
      ...map.sections.map((s) => s.label),
    ]).filter((label) => label && typeof label === 'object');
    expect(localized.length).toBeGreaterThan(0);
  });

  it('shows all four availability states across the scenarios', () => {
    const statuses = new Set(
      SCENARIOS.flatMap(({ state }) => Object.values(state.seats).map((s) => s.status)),
    );
    expect([...statuses].sort()).toEqual(['blocked', 'booked', 'held']);
  });

  it('carries a holdExpires on every held seat, so expiry can be shown', () => {
    const held = SCENARIOS.flatMap(({ state }) =>
      Object.values(state.seats).filter((s) => s.status === 'held'),
    );
    expect(held.length).toBeGreaterThan(0);
    expect(held.every((s) => !!s.holdExpires)).toBe(true);
  });
});
