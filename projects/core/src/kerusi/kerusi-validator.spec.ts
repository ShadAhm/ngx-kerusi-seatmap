import {
  KerusiValidationError,
  validateKerusiMap,
  validateKerusiState,
  validateKerusiStateDelta,
} from './kerusi-validator.js';
import { KerusiMap } from './kerusi-map.model.js';
import { KerusiState, KerusiStateDelta } from './kerusi-state.model.js';
import { BUS_MAP, CINEMA_MAP, FLIGHT_MAP } from './kerusi-examples.fixture.js';

// Deep-clone a fixture so a negative test can corrupt it without leaking into
// other tests that share the same imported object.
const clone = <T>(v: T): T => structuredClone(v);

describe('validateKerusiMap — valid documents', () => {
  it('accepts the §6.1 bus map', () => {
    expect(() => validateKerusiMap(BUS_MAP)).not.toThrow();
  });
  it('accepts the §6.2 cinema map', () => {
    expect(() => validateKerusiMap(CINEMA_MAP)).not.toThrow();
  });
  it('accepts the §6.3 flight map', () => {
    expect(() => validateKerusiMap(FLIGHT_MAP)).not.toThrow();
  });
});

describe('validateKerusiMap — referential integrity (§4.6)', () => {
  it('rejects a dangling companions reference and names the rule + id', () => {
    const map = clone(CINEMA_MAP);
    map.sections[0].seats.find((s) => s.id === 'L1')!.companions = ['L9'];
    // keep L2's back-reference so the failure is dangling, not asymmetry
    try {
      validateKerusiMap(map);
      throw new Error('expected validation to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(KerusiValidationError);
      const err = e as KerusiValidationError;
      expect(err.rule).toBe('companion-reference');
      expect(err.id).toBe('L1');
      expect(err.message).toContain('L9');
    }
  });

  it('rejects an asymmetric companions pair', () => {
    const map = clone(CINEMA_MAP);
    // L1 -> L2 stays, but drop L2's back-reference to L1
    map.sections[0].seats.find((s) => s.id === 'L2')!.companions = [];
    expect(() => validateKerusiMap(map)).toThrowError(/not symmetric/i);
    try {
      validateKerusiMap(map);
    } catch (e) {
      expect((e as KerusiValidationError).rule).toBe('companion-symmetry');
    }
  });

  it('rejects an unknown seat type', () => {
    const map = clone(BUS_MAP);
    map.sections[0].seats[0].type = 'nonexistent';
    try {
      validateKerusiMap(map);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as KerusiValidationError).rule).toBe('seat-type-reference');
      expect((e as KerusiValidationError).id).toBe('1A');
    }
  });

  it('rejects an unknown priceTier reference', () => {
    const map = clone(CINEMA_MAP);
    map.sections[0].seats.find((s) => s.id === 'A1')!.priceTier = 'ghost';
    try {
      validateKerusiMap(map);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as KerusiValidationError).rule).toBe('seat-pricetier-reference');
    }
  });

  it('rejects a dangling row reference when the section declares rows', () => {
    const map = clone(CINEMA_MAP);
    map.sections[0].seats.find((s) => s.id === 'A1')!.row = 'Z';
    try {
      validateKerusiMap(map);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as KerusiValidationError).rule).toBe('seat-row-reference');
    }
  });

  it('treats a free-text row as opaque when the section declares no rows', () => {
    const map = clone(BUS_MAP); // no `rows` array on the section
    map.sections[0].seats[0].row = 'anything-goes';
    expect(() => validateKerusiMap(map)).not.toThrow();
  });
});

describe('validateKerusiMap — positioning (§4.3.1)', () => {
  it('rejects a seat with neither col nor x/y', () => {
    const map = clone(BUS_MAP);
    delete map.sections[0].seats[0].col;
    try {
      validateKerusiMap(map);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as KerusiValidationError).rule).toBe('seat-position');
      expect((e as KerusiValidationError).id).toBe('1A');
    }
  });
});

describe('validateKerusiMap — single currency (§4.9)', () => {
  it('rejects a map that mixes currencies', () => {
    const map = clone(CINEMA_MAP);
    map.priceTiers!.find((t) => t.id === 'premium')!.price.currency = 'USD';
    try {
      validateKerusiMap(map);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as KerusiValidationError).rule).toBe('single-currency');
      expect((e as KerusiValidationError).message).toMatch(/MYR/);
      expect((e as KerusiValidationError).message).toMatch(/USD/);
    }
  });
});

describe('validateKerusiState / Delta — scope rule (§5.1)', () => {
  const baseState: KerusiState = {
    kerusi: '1.0',
    mapId: 'm',
    updatedAt: '2026-08-17T09:14:00Z',
    seats: {},
  };

  it('accepts a state with exactly one of sessionId/mapId', () => {
    expect(() => validateKerusiState(baseState)).not.toThrow();
  });

  it('rejects a state with both sessionId and mapId', () => {
    const bad = { ...baseState, sessionId: 's' };
    try {
      validateKerusiState(bad);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as KerusiValidationError).rule).toBe('state-scope');
      expect((e as KerusiValidationError).message).toContain('both');
    }
  });

  it('rejects a state with neither sessionId nor mapId', () => {
    const bad: KerusiState = { kerusi: '1.0', updatedAt: '2026-08-17T09:14:00Z', seats: {} };
    try {
      validateKerusiState(bad);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as KerusiValidationError).rule).toBe('state-scope');
      expect((e as KerusiValidationError).message).toContain('neither');
    }
  });

  it('applies the same scope rule to a delta', () => {
    const delta: KerusiStateDelta = {
      kerusi: '1.0',
      sessionId: 's',
      mapId: 'm',
      updatedAt: '2026-08-17T09:14:00Z',
      changes: {},
    };
    expect(() => validateKerusiStateDelta(delta)).toThrowError(/exactly one/i);
  });
});
