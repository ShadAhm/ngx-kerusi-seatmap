import { describe, expect, it } from 'vitest';
import { KerusiMap, Seat, Section } from './kerusi-map.model.js';
import {
  checkSectionLayout,
  inferSectionLayoutMode,
  resolveSectionLayoutMode,
  SectionLayoutMode,
} from './kerusi-layout-mode.js';
import { checkKerusiMap, KerusiValidationError, validateKerusiMap } from './kerusi-validator.js';

/** A section wrapping the given seats, with an optional declared mode. */
const section = (seats: Seat[], layout?: SectionLayoutMode): Section => ({
  id: 'main',
  ...(layout ? { layout } : {}),
  seats,
});

const gridSeat = (id: string, col: number): Seat => ({ id, col, type: 'standard' });
const freeSeat = (id: string, x: number, y: number): Seat => ({ id, x, y, type: 'standard' });
const mixedSeat = (id: string, col: number, x: number, y: number): Seat => ({
  id,
  col,
  x,
  y,
  type: 'standard',
});

const rules = (s: Section) => checkSectionLayout(s).map((v) => v.rule);

describe('§4.5 declared layout modes are strict constraints', () => {
  const cases: {
    name: string;
    layout: SectionLayoutMode;
    seats: Seat[];
    expected: string[];
  }[] = [
    // grid
    {
      name: 'grid: every seat has col, none has x/y',
      layout: 'grid',
      seats: [gridSeat('A1', 1), gridSeat('A2', 2)],
      expected: [],
    },
    {
      name: 'grid: a seat missing col',
      layout: 'grid',
      seats: [gridSeat('A1', 1), { id: 'A2', type: 'standard' } as Seat],
      expected: ['section-layout-grid'],
    },
    {
      name: 'grid: a seat carrying x/y',
      layout: 'grid',
      seats: [gridSeat('A1', 1), mixedSeat('A2', 2, 10, 10)],
      expected: ['section-layout-grid'],
    },
    {
      name: 'grid: a seat carrying only x',
      layout: 'grid',
      seats: [{ id: 'A1', col: 1, x: 10, type: 'standard' }],
      expected: ['section-layout-grid'],
    },

    // freeform
    {
      name: 'freeform: every seat has x and y, none has col',
      layout: 'freeform',
      seats: [freeSeat('A1', 10, 10), freeSeat('A2', 20, 10)],
      expected: [],
    },
    {
      name: 'freeform: a seat missing y',
      layout: 'freeform',
      seats: [{ id: 'A1', x: 10, type: 'standard' } as Seat],
      expected: ['section-layout-freeform'],
    },
    {
      name: 'freeform: a seat carrying col',
      layout: 'freeform',
      seats: [mixedSeat('A1', 1, 10, 10)],
      expected: ['section-layout-freeform'],
    },

    // mixed
    {
      name: 'mixed: every seat has col, x and y',
      layout: 'mixed',
      seats: [mixedSeat('A1', 1, 10, 10), mixedSeat('A2', 2, 20, 10)],
      expected: [],
    },
    {
      name: 'mixed: a seat missing col',
      layout: 'mixed',
      seats: [freeSeat('A1', 10, 10)],
      expected: ['section-layout-mixed'],
    },
    {
      name: 'mixed: a seat missing x/y',
      layout: 'mixed',
      seats: [gridSeat('A1', 1)],
      expected: ['section-layout-mixed'],
    },
  ];

  for (const { name, layout, seats, expected } of cases) {
    it(name, () => {
      expect(rules(section(seats, layout))).toEqual(expected);
    });
  }

  it('reports every offending seat, not just the first', () => {
    const violations = checkSectionLayout(
      section([gridSeat('A1', 1), freeSeat('A2', 10, 10), freeSeat('A3', 20, 10)], 'grid'),
    );
    expect(violations.map((v) => v.id)).toEqual(['A2', 'A2', 'A3', 'A3']);
  });

  it('allows a free-text row as a label in every mode', () => {
    const withRow = (s: Seat): Seat => ({ ...s, row: 'L' });
    expect(rules(section([withRow(gridSeat('A1', 1))], 'grid'))).toEqual([]);
    expect(rules(section([withRow(freeSeat('A1', 10, 10))], 'freeform'))).toEqual([]);
    expect(rules(section([withRow(mixedSeat('A1', 1, 10, 10))], 'mixed'))).toEqual([]);
  });
});

describe('§4.5 inference when layout is omitted', () => {
  it('infers grid when every seat has col and no seat has x/y', () => {
    const s = section([gridSeat('A1', 1), gridSeat('A2', 2)]);
    expect(inferSectionLayoutMode(s)).toBe('grid');
    expect(resolveSectionLayoutMode(s)).toBe('grid');
    expect(rules(s)).toEqual([]);
  });

  it('infers freeform when every seat has x and y and no seat has col', () => {
    const s = section([freeSeat('A1', 10, 10), freeSeat('A2', 20, 10)]);
    expect(inferSectionLayoutMode(s)).toBe('freeform');
    expect(resolveSectionLayoutMode(s)).toBe('freeform');
    expect(rules(s)).toEqual([]);
  });

  it('rejects an inconsistent section rather than guessing', () => {
    const s = section([gridSeat('A1', 1), freeSeat('A2', 20, 10)]);
    expect(inferSectionLayoutMode(s)).toBeUndefined();
    const [violation] = checkSectionLayout(s);
    expect(violation.rule).toBe('section-layout-inconsistent');
    expect(violation.message).toContain('A2');
  });

  it('does not infer mixed — a seat carrying all three must declare it', () => {
    const s = section([mixedSeat('A1', 1, 10, 10)]);
    expect(inferSectionLayoutMode(s)).toBeUndefined();
    expect(rules(s)).toEqual(['section-layout-inconsistent']);
  });

  it('infers grid for an empty section', () => {
    expect(inferSectionLayoutMode(section([]))).toBe('grid');
    expect(rules(section([]))).toEqual([]);
  });

  it('falls back to grid for an inconsistent section so a renderer can still draw', () => {
    expect(resolveSectionLayoutMode(section([gridSeat('A1', 1), freeSeat('A2', 20, 10)]))).toBe(
      'grid',
    );
  });
});

describe('the validator enforces §4.5 at map level', () => {
  const mapWith = (s: Section): KerusiMap => ({
    kerusi: '1.0',
    id: 'm',
    legend: [{ id: 'standard' }],
    sections: [s],
  });

  it('rejects a grid section whose seats carry only coordinates', () => {
    // This document adapted cleanly before the strict-layout revision.
    const map = mapWith(section([freeSeat('S1', 10, 10), freeSeat('S2', 20, 10)], 'grid'));
    try {
      validateKerusiMap(map);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as KerusiValidationError).rule).toBe('section-layout-grid');
      expect((e as KerusiValidationError).id).toBe('S1');
    }
  });

  it('rejects a freeform section whose seats carry col', () => {
    const map = mapWith(section([mixedSeat('S1', 1, 10, 10)], 'freeform'));
    expect(() => validateKerusiMap(map)).toThrowError(/freeform section .* carries "col"/);
  });

  it('reports the seat-position rule ahead of the mode rule', () => {
    // A seat with no position at all deserves the clearer message.
    const map = mapWith(section([{ id: 'S1', type: 'standard' }], 'grid'));
    expect(checkKerusiMap(map).map((v) => v.rule)).toEqual([
      'seat-position',
      'section-layout-grid',
    ]);
  });

  it('carries a document path on each violation', () => {
    const map = mapWith(section([freeSeat('S1', 10, 10)], 'grid'));
    expect(checkKerusiMap(map)[0].path).toBe('sections[0].seats[0]');
  });
});
