import { describe, expect, it } from 'vitest';
import { KerusiMap } from '../kerusi/kerusi-map.model.js';
import { KerusiState } from '../kerusi/kerusi-state.model.js';
import { buildRenderModel } from '../render/build-render-model.js';
import { companionClosure, summarizeSelection, toggleSeatSelection } from './selection.js';

/** A row of singles, a love-seat pair, and a three-seat family pod. */
const MAP: KerusiMap = {
  kerusi: '1.0',
  id: 'm',
  legend: [
    { id: 'standard', defaultPriceTier: 'base' },
    { id: 'sofa', defaultPriceTier: 'top' },
  ],
  priceTiers: [
    { id: 'base', price: { amount: 1500, currency: 'MYR' } },
    { id: 'top', price: { amount: 4500, currency: 'MYR' } },
  ],
  sections: [
    {
      id: 'main',
      layout: 'grid',
      seats: [
        { id: 'A1', row: 'A', col: 1, type: 'standard' },
        { id: 'A2', row: 'A', col: 2, type: 'standard' },
        { id: 'L1', row: 'L', col: 1, type: 'sofa', companions: ['L2'] },
        { id: 'L2', row: 'L', col: 2, type: 'sofa', companions: ['L1'] },
        { id: 'F1', row: 'F', col: 1, type: 'standard', companions: ['F2'] },
        { id: 'F2', row: 'F', col: 2, type: 'standard', companions: ['F1', 'F3'] },
        { id: 'F3', row: 'F', col: 3, type: 'standard', companions: ['F2'] },
      ],
    },
  ],
};

const ctxFor = (state?: KerusiState, extra = {}) => ({
  seatsById: buildRenderModel(MAP, state).seatsById,
  ...extra,
});

describe('companionClosure', () => {
  it('is just the seat when it has no companions', () => {
    expect(companionClosure('A1', ctxFor().seatsById)).toEqual(['A1']);
  });

  it('closes over a symmetric pair', () => {
    expect(companionClosure('L1', ctxFor().seatsById).sort()).toEqual(['L1', 'L2']);
  });

  it('closes transitively over a chain, so a family pod is one unit', () => {
    expect(companionClosure('F1', ctxFor().seatsById).sort()).toEqual(['F1', 'F2', 'F3']);
  });

  it('skips a companion id that does not resolve, rather than throwing', () => {
    const dangling = buildRenderModel({
      ...MAP,
      sections: [
        {
          id: 'main',
          layout: 'grid',
          seats: [{ id: 'A1', row: 'A', col: 1, type: 'standard', companions: ['ghost'] }],
        },
      ],
    }).seatsById;
    expect(companionClosure('A1', dangling)).toEqual(['A1']);
  });
});

describe('toggleSeatSelection', () => {
  it('selects and deselects a lone seat', () => {
    const ctx = ctxFor();
    const on = toggleSeatSelection([], 'A1', ctx);
    expect(on).toMatchObject({ kind: 'select', selection: ['A1'], changed: ['A1'] });

    const off = toggleSeatSelection(on.selection, 'A1', ctx);
    expect(off).toMatchObject({ kind: 'deselect', selection: [], changed: ['A1'] });
  });

  it('selects a companion pair together', () => {
    const result = toggleSeatSelection([], 'L1', ctxFor());
    expect(result.kind).toBe('select');
    expect([...result.selection].sort()).toEqual(['L1', 'L2']);
  });

  it('deselects the whole pair when either half is clicked', () => {
    const ctx = ctxFor();
    const selected = toggleSeatSelection([], 'L1', ctx).selection;
    expect(toggleSeatSelection(selected, 'L2', ctx).selection).toEqual([]);
  });

  it('leaves companions alone in independent mode', () => {
    const result = toggleSeatSelection(
      [],
      'L1',
      ctxFor(undefined, { companionMode: 'independent' }),
    );
    expect(result.selection).toEqual(['L1']);
  });

  it('refuses a pair whose other half is already sold', () => {
    const state: KerusiState = {
      kerusi: '1.0',
      mapId: 'm',
      updatedAt: 't',
      seats: { L2: { status: 'booked' } },
    };
    const result = toggleSeatSelection([], 'L1', ctxFor(state));
    expect(result).toMatchObject({ kind: 'disallowed', reason: 'companion-unavailable' });
    expect(result.selection).toEqual([]);
  });

  it('reports the availability status as the disallowed reason', () => {
    const state: KerusiState = {
      kerusi: '1.0',
      mapId: 'm',
      updatedAt: 't',
      seats: {
        A1: { status: 'booked' },
        A2: { status: 'held' },
      },
    };
    const ctx = ctxFor(state);
    expect(toggleSeatSelection([], 'A1', ctx).reason).toBe('booked');
    expect(toggleSeatSelection([], 'A2', ctx).reason).toBe('held');
  });

  it('counts the whole companion closure against maxSelection', () => {
    const ctx = ctxFor(undefined, { maxSelection: 2 });
    // The pod needs three slots and only two are free.
    expect(toggleSeatSelection([], 'F1', ctx)).toMatchObject({
      kind: 'disallowed',
      reason: 'max-selection',
    });
    // The pair needs two, and fits.
    expect(toggleSeatSelection([], 'L1', ctx).kind).toBe('select');
  });

  it('always allows deselection, even at the limit', () => {
    const ctx = ctxFor(undefined, { maxSelection: 1 });
    expect(toggleSeatSelection(['A1'], 'A1', ctx).kind).toBe('deselect');
  });

  it('never mutates the selection it was given', () => {
    const selection = Object.freeze(['A1']);
    expect(() => toggleSeatSelection(selection, 'A2', ctxFor())).not.toThrow();
    expect(selection).toEqual(['A1']);
  });

  it('reports an unknown seat id as not selectable', () => {
    expect(toggleSeatSelection([], 'nope', ctxFor())).toMatchObject({
      kind: 'disallowed',
      reason: 'not-selectable',
    });
  });
});

describe('summarizeSelection', () => {
  const model = buildRenderModel(MAP);

  it('totals a selection in the map currency, in minor units', () => {
    const summary = summarizeSelection(model, ['A1', 'L1']);
    expect(summary.seats.map((s) => s.id)).toEqual(['A1', 'L1']);
    expect(summary.total).toEqual({ amount: 6000, currency: 'MYR' });
    expect(summary.unpriced).toBe(0);
  });

  it('counts unpriced seats rather than treating them as free', () => {
    const unpricedMap: KerusiMap = {
      ...MAP,
      priceTiers: undefined,
      legend: [{ id: 'standard' }, { id: 'sofa' }],
    };
    const summary = summarizeSelection(buildRenderModel(unpricedMap), ['A1', 'A2']);
    expect(summary.total).toBeUndefined();
    expect(summary.unpriced).toBe(2);
  });

  it('is empty for an empty selection', () => {
    expect(summarizeSelection(model, [])).toEqual({ seats: [], total: undefined, unpriced: 0 });
  });
});
