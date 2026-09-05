import { describe, expect, it } from 'vitest';
import { KerusiState, KerusiStateDelta } from '@kerusiweb/core';
import { KerusiStateStore } from './kerusi-state-store';

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

describe('KerusiStateStore', () => {
  it('exposes the applied state and updatedAt as signals', () => {
    const store = new KerusiStateStore(base);
    expect(store.state()).toBe(base);
    store.apply(delta('2026-08-19T10:01:00Z'));
    expect(store.updatedAt()).toBe('2026-08-19T10:01:00Z');
    expect(store.state().seats['A2'].status).toBe('held');
  });

  it('leaves state untouched when a delta is discarded', () => {
    const store = new KerusiStateStore(base);
    expect(store.apply(delta('2026-08-19T09:00:00Z')).outcome).toBe('stale');
    expect(store.state()).toBe(base);
  });

  it('raises needsRefetch on a sequence gap, and reset clears it', () => {
    const store = new KerusiStateStore(base);
    store.apply(delta('2026-08-19T10:01:00Z', {}, { metadata: { seq: 1 } } as never));
    expect(store.needsRefetch()).toBe(false);

    store.apply(delta('2026-08-19T10:02:00Z', {}, { metadata: { seq: 4 } } as never));
    expect(store.needsRefetch()).toBe(true);

    store.reset({ ...base, updatedAt: '2026-08-19T10:03:00Z' });
    expect(store.needsRefetch()).toBe(false);
    expect(store.updatedAt()).toBe('2026-08-19T10:03:00Z');
  });

  it('lists held seats with the time remaining, soonest first', () => {
    let now = new Date('2026-08-19T10:00:00Z');
    const store = new KerusiStateStore(
      {
        ...base,
        seats: {
          L2: { status: 'held', holdExpires: '2026-08-19T10:30:00Z' },
          L1: { status: 'held', holdExpires: '2026-08-19T10:05:00Z' },
        },
      },
      { now: () => now },
    );

    expect(store.heldSeats().map((h) => h.seatId)).toEqual(['L1', 'L2']);
    expect(store.heldSeats()[0].msRemaining).toBe(5 * 60_000);

    // tick() against an injected clock expires the lapsed hold.
    now = new Date('2026-08-19T10:10:00Z');
    store.tick();
    expect(store.state().seats['L1']).toEqual({ status: 'available' });
    expect(store.heldSeats().map((h) => h.seatId)).toEqual(['L2']);
  });
});
