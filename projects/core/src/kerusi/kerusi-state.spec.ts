import { describe, expect, it } from 'vitest';
import { KerusiState, KerusiStateDelta } from './kerusi-state.model.js';
import { applyStateDeltaOrdered, expireHolds } from './kerusi-state.js';

const base: KerusiState = {
  kerusi: '1.0',
  mapId: 'hall-a',
  updatedAt: '2026-08-19T10:00:00Z',
  seats: { A1: { status: 'booked' } },
};

const delta = (
  updatedAt: string,
  changes: KerusiStateDelta['changes'] = { A2: { status: 'held' } },
  extra: Partial<KerusiStateDelta> = {},
): KerusiStateDelta => ({
  kerusi: '1.0',
  mapId: 'hall-a',
  updatedAt,
  changes,
  ...extra,
});

describe('applyStateDeltaOrdered — §5.2 ordering', () => {
  it('applies a newer delta and advances updatedAt', () => {
    const result = applyStateDeltaOrdered(base, delta('2026-08-19T10:01:00Z'));
    expect(result.outcome).toBe('applied');
    expect(result.state.updatedAt).toBe('2026-08-19T10:01:00Z');
    expect(result.state.seats).toEqual({ A1: { status: 'booked' }, A2: { status: 'held' } });
  });

  it('discards a delta that precedes the current state', () => {
    const result = applyStateDeltaOrdered(base, delta('2026-08-19T09:59:00Z'));
    expect(result.outcome).toBe('stale');
    expect(result.state).toBe(base);
  });

  it('discards a delta with the same timestamp as a duplicate', () => {
    const result = applyStateDeltaOrdered(base, delta('2026-08-19T10:00:00Z'));
    expect(result.outcome).toBe('duplicate');
    expect(result.state).toBe(base);
  });

  it('discards a delta scoped to a different map', () => {
    const result = applyStateDeltaOrdered(
      base,
      delta('2026-08-19T10:01:00Z', { A2: { status: 'held' } }, { mapId: 'hall-b' }),
    );
    expect(result.outcome).toBe('scope-mismatch');
    expect(result.state).toBe(base);
  });

  it('discards a delta scoped to a different session', () => {
    const sessionBase: KerusiState = { ...base, mapId: undefined, sessionId: 'sess-1' };
    const result = applyStateDeltaOrdered(
      sessionBase,
      delta('2026-08-19T10:01:00Z', {}, { mapId: undefined, sessionId: 'sess-2' }),
    );
    expect(result.outcome).toBe('scope-mismatch');
  });

  it('an explicit "available" reverts a seat; omission means unchanged', () => {
    const result = applyStateDeltaOrdered(
      base,
      delta('2026-08-19T10:01:00Z', { A1: { status: 'available' } }),
    );
    expect(result.state.seats['A1']).toEqual({ status: 'available' });
  });

  it('never mutates the base state', () => {
    applyStateDeltaOrdered(base, delta('2026-08-19T10:01:00Z'));
    expect(base.seats).toEqual({ A1: { status: 'booked' } });
    expect(base.updatedAt).toBe('2026-08-19T10:00:00Z');
  });

  it('reports a gap only when the transport supplies a sequence', () => {
    // updatedAt alone cannot distinguish a gap from a quiet period, so a
    // sequence-free delta is simply applied.
    expect(applyStateDeltaOrdered(base, delta('2026-08-19T10:05:00Z')).outcome).toBe('applied');

    const seq = (n: number) => delta('2026-08-19T10:05:00Z', {}, { metadata: { seq: n } } as never);
    expect(applyStateDeltaOrdered(base, seq(5), { lastSequence: 4 }).outcome).toBe('applied');
    expect(applyStateDeltaOrdered(base, seq(7), { lastSequence: 4 }).outcome).toBe('gap');
  });

  it('still applies a gapped delta, so the map degrades rather than freezes', () => {
    const gapped = delta('2026-08-19T10:05:00Z', { A3: { status: 'booked' } }, {
      metadata: { seq: 9 },
    } as never);
    const result = applyStateDeltaOrdered(base, gapped, { lastSequence: 4 });
    expect(result.outcome).toBe('gap');
    expect(result.state.seats['A3']).toEqual({ status: 'booked' });
  });
});

describe('expireHolds', () => {
  const held: KerusiState = {
    ...base,
    seats: {
      L1: { status: 'held', holdExpires: '2026-08-19T10:05:00Z' },
      L2: { status: 'held', holdExpires: '2026-08-19T10:30:00Z' },
      L3: { status: 'held' },
      B1: { status: 'booked' },
    },
  };

  it('reverts a lapsed hold and leaves a live one alone', () => {
    const next = expireHolds(held, '2026-08-19T10:10:00Z');
    expect(next.seats['L1']).toEqual({ status: 'available' });
    expect(next.seats['L2'].status).toBe('held');
    expect(next.seats['B1'].status).toBe('booked');
  });

  it('leaves a hold with no expiry alone — it is managed elsewhere', () => {
    expect(expireHolds(held, '2027-01-01T00:00:00Z').seats['L3'].status).toBe('held');
  });

  it('returns the same object when nothing lapsed, so signals do not fire', () => {
    expect(expireHolds(held, '2026-08-19T10:00:00Z')).toBe(held);
  });

  it('never mutates the input', () => {
    expireHolds(held, '2026-08-19T10:10:00Z');
    expect(held.seats['L1'].status).toBe('held');
  });
});
