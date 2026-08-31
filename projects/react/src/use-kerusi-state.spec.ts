import type { KerusiState, KerusiStateDelta } from '@kerusiweb/core';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKerusiState } from './use-kerusi-state.js';

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

describe('useKerusiState', () => {
  afterEach(() => vi.useRealTimers());

  it('exposes the applied state and updatedAt', () => {
    const { result } = renderHook(() => useKerusiState(base));
    expect(result.current.state).toBe(base);

    act(() => {
      result.current.apply(delta('2026-08-19T10:01:00Z'));
    });
    expect(result.current.updatedAt).toBe('2026-08-19T10:01:00Z');
    expect(result.current.state.seats!['A2']!.status).toBe('held');
  });

  it('leaves state untouched when a delta is discarded', () => {
    const { result } = renderHook(() => useKerusiState(base));
    let outcome: string | undefined;
    act(() => {
      outcome = result.current.apply(delta('2026-08-19T09:00:00Z')).outcome;
    });
    expect(outcome).toBe('stale');
    expect(result.current.state).toBe(base);
  });

  it('raises needsRefetch on a sequence gap, and reset clears it', () => {
    const { result } = renderHook(() => useKerusiState(base));

    act(() => {
      result.current.apply(delta('2026-08-19T10:01:00Z', {}, { metadata: { seq: 1 } } as never));
    });
    expect(result.current.needsRefetch).toBe(false);

    act(() => {
      result.current.apply(delta('2026-08-19T10:02:00Z', {}, { metadata: { seq: 4 } } as never));
    });
    expect(result.current.needsRefetch).toBe(true);

    act(() => {
      result.current.reset({ ...base, updatedAt: '2026-08-19T10:03:00Z' });
    });
    expect(result.current.needsRefetch).toBe(false);
    expect(result.current.updatedAt).toBe('2026-08-19T10:03:00Z');
  });

  it('applies consecutive deltas in sequence without a gap', () => {
    const { result } = renderHook(() => useKerusiState(base));
    act(() => {
      result.current.apply(delta('2026-08-19T10:01:00Z', {}, { metadata: { seq: 1 } } as never));
      result.current.apply(delta('2026-08-19T10:02:00Z', {}, { metadata: { seq: 2 } } as never));
    });
    expect(result.current.needsRefetch).toBe(false);
    expect(result.current.updatedAt).toBe('2026-08-19T10:02:00Z');
  });

  it('lists held seats with the time remaining, soonest first', () => {
    let now = new Date('2026-08-19T10:00:00Z');
    const held: KerusiState = {
      ...base,
      seats: {
        L2: { status: 'held', holdExpires: '2026-08-19T10:30:00Z' },
        L1: { status: 'held', holdExpires: '2026-08-19T10:05:00Z' },
      },
    };
    const { result } = renderHook(() => useKerusiState(held, { now: () => now }));

    expect(result.current.heldSeats.map((h) => h.seatId)).toEqual(['L1', 'L2']);
    expect(result.current.heldSeats[0]!.msRemaining).toBe(5 * 60_000);

    // tick() against an injected clock expires the lapsed hold.
    now = new Date('2026-08-19T10:10:00Z');
    act(() => result.current.tick());
    expect(result.current.state.seats!['L1']).toEqual({ status: 'available' });
    expect(result.current.heldSeats.map((h) => h.seatId)).toEqual(['L2']);
  });

  it('ticks on an interval when asked, and stops on unmount', () => {
    vi.useFakeTimers();
    let now = new Date('2026-08-19T10:00:00Z');
    const held: KerusiState = {
      ...base,
      seats: { L1: { status: 'held', holdExpires: '2026-08-19T10:05:00Z' } },
    };
    const { result, unmount } = renderHook(() =>
      useKerusiState(held, { now: () => now, expiryIntervalMs: 1000 }),
    );

    expect(result.current.state.seats!['L1']!.status).toBe('held');

    now = new Date('2026-08-19T10:06:00Z');
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.state.seats!['L1']).toEqual({ status: 'available' });

    // No pending interval survives the unmount.
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps apply stable across renders, so an effect can subscribe once', () => {
    const { result, rerender } = renderHook(() => useKerusiState(base));
    const first = result.current.apply;
    act(() => {
      result.current.apply(delta('2026-08-19T10:01:00Z'));
    });
    rerender();
    expect(result.current.apply).toBe(first);
  });
});
