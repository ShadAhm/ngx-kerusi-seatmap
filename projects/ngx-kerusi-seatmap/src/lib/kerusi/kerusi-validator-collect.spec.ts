import { describe, expect, it } from 'vitest';
import { KerusiMap } from './kerusi-map.model';
import { KerusiSession, KerusiState } from './kerusi-state.model';
import { BUS_MAP } from './kerusi-examples.fixture';
import {
  checkKerusiMap,
  checkKerusiSession,
  checkKerusiState,
  checkKerusiStateDelta,
  errorsOf,
  KerusiValidationError,
  validateDocumentSet,
  validateKerusiMap,
  validateKerusiSession,
} from './kerusi-validator';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('checkKerusiMap — non-throwing collection', () => {
  it('returns an empty array for a valid document', () => {
    expect(checkKerusiMap(BUS_MAP)).toEqual([]);
  });

  it('collects every fault instead of stopping at the first', () => {
    const map = clone(BUS_MAP);
    map.sections[0].seats[0].type = 'nope';
    map.sections[0].seats[1].priceTier = 'nope';
    map.sections[0].seats[2].companions = ['ghost'];

    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual([
      'seat-type-reference',
      'seat-pricetier-reference',
      'companion-reference',
    ]);
  });

  it('throws the first collected error, and carries the rest along', () => {
    const map = clone(BUS_MAP);
    map.sections[0].seats[0].type = 'nope';
    map.sections[0].seats[1].type = 'also-nope';

    const collected = checkKerusiMap(map);
    try {
      validateKerusiMap(map);
      throw new Error('expected throw');
    } catch (e) {
      const err = e as KerusiValidationError;
      expect(err.rule).toBe(collected[0].rule);
      expect(err.id).toBe(collected[0].id);
      expect(err.violations).toHaveLength(2);
    }
  });

  it('does not throw for warning-severity findings', () => {
    const map = clone(BUS_MAP);
    map.sections[0].seats[0].accessibility = { transferArmrest: 'sideways' as never };

    const violations = checkKerusiMap(map);
    expect(violations.map((v) => v.rule)).toEqual(['accessibility-transfer-armrest']);
    expect(violations[0].severity).toBe('warning');
    expect(errorsOf(violations)).toEqual([]);
    expect(() => validateKerusiMap(map)).not.toThrow();
  });

  it('returns a shape violation for malformed input rather than crashing', () => {
    for (const bad of [null, undefined, 42, 'a map', []]) {
      const violations = checkKerusiMap(bad);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].severity).toBe('error');
    }
  });

  it('stops walking when legend or sections are missing, to keep the report readable', () => {
    expect(checkKerusiMap({ kerusi: '1.0', id: 'm' }).map((v) => v.rule)).toEqual([
      'map-legend',
      'map-sections',
    ]);
  });
});

describe('version negotiation', () => {
  it('accepts a future minor version — unknown members are ignored, not rejected', () => {
    const map = clone(BUS_MAP);
    map.kerusi = '1.4' as never;
    expect(checkKerusiMap(map)).toEqual([]);
  });

  it('rejects a different major version', () => {
    const map = clone(BUS_MAP);
    map.kerusi = '2.0' as never;
    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual(['map-version-unsupported']);
  });

  it('applies the same rule to states, deltas and sessions', () => {
    expect(
      checkKerusiState({ kerusi: '3.0', mapId: 'm', updatedAt: 't', seats: {} }).map((v) => v.rule),
    ).toContain('state-version-unsupported');
    expect(
      checkKerusiStateDelta({ kerusi: '3.0', mapId: 'm', updatedAt: 't', changes: {} }).map(
        (v) => v.rule,
      ),
    ).toContain('delta-version-unsupported');
    expect(checkKerusiSession({ kerusi: '3.0', id: 's', mapId: 'm' }).map((v) => v.rule)).toContain(
      'session-version-unsupported',
    );
  });
});

describe('id uniqueness', () => {
  it('rejects a duplicate seat id across sections (§4.3 global uniqueness)', () => {
    const map = clone(BUS_MAP);
    map.sections.push({ ...clone(map.sections[0]), id: 'upper' });
    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual([
      'seat-id-duplicate',
      'seat-id-duplicate',
      'seat-id-duplicate',
      'seat-id-duplicate',
    ]);
  });

  it('rejects a duplicate section id', () => {
    const map = clone(BUS_MAP);
    map.sections.push({ id: map.sections[0].id, layout: 'grid', seats: [] });
    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual(['section-id-duplicate']);
  });
});

describe('§4.4 element validation', () => {
  const withElements = (elements: unknown[]): KerusiMap => {
    const map = clone(BUS_MAP);
    map.sections[0].elements = elements as never;
    return map;
  };

  it('requires id and kind', () => {
    expect(checkKerusiMap(withElements([{ kind: 'exit', col: 3 }])).map((v) => v.rule)).toEqual([
      'element-id',
    ]);
    expect(checkKerusiMap(withElements([{ id: 'e1', col: 3 }])).map((v) => v.rule)).toEqual([
      'element-kind',
    ]);
  });

  it('rejects a duplicate element id within a section', () => {
    const violations = checkKerusiMap(
      withElements([
        { id: 'e1', kind: 'exit', col: 3 },
        { id: 'e1', kind: 'exit', col: 6 },
      ]),
    );
    expect(violations.map((v) => v.rule)).toEqual(['element-id-duplicate']);
  });

  it('warns, rather than rejects, an unpositioned element', () => {
    const violations = checkKerusiMap(withElements([{ id: 'e1', kind: 'gap' }]));
    expect(violations.map((v) => v.rule)).toEqual(['element-position']);
    expect(violations[0].severity).toBe('warning');
  });

  it('rejects an element addressed in the other mode from its section (§4.4.1)', () => {
    const violations = checkKerusiMap(withElements([{ id: 'e1', kind: 'exit', x: 50, y: 50 }]));
    expect(violations.map((v) => v.rule)).toEqual(['element-layout-mismatch']);
    // Rev 12 binds an element to its section's mode exactly as §4.5 binds its
    // seats, so this is a MUST — it was a warning up to 1.0.
    expect(violations[0].severity).toBe('error');
  });

  it('accepts a row-only element in a grid section, which spans the full width', () => {
    expect(checkKerusiMap(withElements([{ id: 'e1', kind: 'screen', row: '1' }]))).toEqual([]);
  });

  it('rejects a grid span that is not a positive integer (§4.4.1)', () => {
    const violations = checkKerusiMap(
      withElements([{ id: 'e1', kind: 'screen', col: 1, width: 2.5, height: 0 }]),
    );
    expect(violations.map((v) => v.rule)).toEqual(['element-span-invalid', 'element-span-invalid']);
  });

  it('leaves a freeform element\u2019s percentage width and height alone', () => {
    const map = clone(BUS_MAP);
    map.sections[0] = {
      id: 'stalls',
      layout: 'freeform',
      seats: [{ id: 's1', x: 50, y: 50, type: map.legend[0].id }],
      elements: [{ id: 'screen', kind: 'screen', x: 50, y: 5, width: 74.5, height: 5 }],
    } as never;
    expect(checkKerusiMap(map)).toEqual([]);
  });

  it('rejects a row span reaching past the section\u2019s last row (§4.2.1)', () => {
    const map = clone(BUS_MAP);
    map.sections[0].rows = [
      { id: 'screen', index: 0 },
      { id: '1', index: 1 },
    ];
    map.sections[0].elements = [
      { id: 'screen', kind: 'screen', row: 'screen', height: 3 },
    ] as never;
    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual(['element-row-span-overrun']);
  });

  it('rejects an element row that the registry does not declare (§4.6)', () => {
    const map = clone(BUS_MAP);
    map.sections[0].rows = [{ id: '1', index: 0 }];
    map.sections[0].elements = [{ id: 'e1', kind: 'exit', row: 'nowhere', col: 3 }] as never;
    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual(['element-row-unresolved']);
  });
});

describe('§5.1.1 RFC 3339 timestamps', () => {
  const state = (updatedAt: string): unknown => ({
    kerusi: '1.0',
    mapId: 'm',
    updatedAt,
    seats: {},
  });

  it('accepts the profile the published schemas mean by format: date-time', () => {
    expect(checkKerusiState(state('2026-08-17T09:14:00Z'))).toEqual([]);
    expect(checkKerusiState(state('2026-08-17T21:15:00+08:00'))).toEqual([]);
    expect(checkKerusiState(state('2026-08-17T09:14:00.123Z'))).toEqual([]);
  });

  it('rejects the ISO 8601 forms rev 13 narrowed away', () => {
    // Seconds omitted, basic format, and a local time with no offset: each is
    // ISO 8601 and none can be parsed interoperably.
    for (const value of ['2026-08-17T09:14Z', '20260817T091400Z', '2026-08-17T09:14:00']) {
      expect(checkKerusiState(state(value)).map((v) => v.rule)).toEqual(['state-updatedat-format']);
    }
  });

  it('rejects a shape-valid but impossible date', () => {
    expect(checkKerusiState(state('2026-02-31T09:14:00Z')).map((v) => v.rule)).toEqual([
      'state-updatedat-format',
    ]);
  });

  it('checks holdExpires, which a countdown depends on', () => {
    const doc = {
      kerusi: '1.0',
      mapId: 'm',
      updatedAt: '2026-08-17T09:14:00Z',
      seats: { A1: { status: 'held', holdExpires: '2026-08-17T09:29Z' } },
    };
    const violations = checkKerusiState(doc);
    expect(violations.map((v) => v.rule)).toEqual(['seat-status-hold-expires-format']);
    expect(violations[0].id).toBe('A1');
  });

  it('checks a delta and a session too', () => {
    expect(
      checkKerusiStateDelta({
        kerusi: '1.0',
        mapId: 'm',
        updatedAt: 'yesterday',
        changes: {},
      }).map((v) => v.rule),
    ).toEqual(['state-updatedat-format']);
    expect(
      checkKerusiSession({
        kerusi: '1.0',
        id: 's',
        mapId: 'm',
        startsAt: '2026-08-17T19:30',
        endsAt: '2026-08-17T21:30:00+08:00',
      }).map((v) => v.rule),
    ).toEqual(['session-startsat-format']);
  });
});

describe('§5.3 sessions and document joins', () => {
  const session: KerusiSession = { kerusi: '1.0', id: 'sess-1', mapId: BUS_MAP.id };
  const state: KerusiState = {
    kerusi: '1.0',
    sessionId: 'sess-1',
    updatedAt: '2026-08-19T00:00:00Z',
    seats: {},
  };

  it('requires kerusi, id and mapId on a session', () => {
    expect(checkKerusiSession({ kerusi: '1.0' }).map((v) => v.rule)).toEqual([
      'session-id',
      'session-mapid',
    ]);
    expect(() => validateKerusiSession(session)).not.toThrow();
  });

  it('accepts a consistent map/session/state trio', () => {
    expect(validateDocumentSet({ map: BUS_MAP, session, state })).toEqual([]);
  });

  it('rejects a session pointing at a different map', () => {
    const wrong = { ...session, mapId: 'other-bus' };
    expect(validateDocumentSet({ map: BUS_MAP, session: wrong }).map((v) => v.rule)).toEqual([
      'session-map-mismatch',
    ]);
  });

  it('rejects a state pointing at a different map', () => {
    const wrong: KerusiState = { ...state, sessionId: undefined, mapId: 'other-bus' };
    expect(validateDocumentSet({ map: BUS_MAP, state: wrong }).map((v) => v.rule)).toEqual([
      'state-map-mismatch',
    ]);
  });

  it('rejects a state pointing at a different session', () => {
    const wrong: KerusiState = { ...state, sessionId: 'sess-2' };
    expect(validateDocumentSet({ map: BUS_MAP, session, state: wrong }).map((v) => v.rule)).toEqual(
      ['state-session-mismatch'],
    );
  });
});
