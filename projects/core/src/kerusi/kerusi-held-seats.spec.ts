import { describe, expect, it } from 'vitest';
import { heldSeats } from './kerusi-state.js';
import type { KerusiState } from './kerusi-state.model.js';

const NOW = '2026-08-19T09:00:00Z';

const STATE: KerusiState = {
  kerusi: '1.0',
  mapId: 'm1',
  updatedAt: NOW,
  seats: {
    A1: { status: 'held', holdExpires: '2026-08-19T09:05:00Z' },
    A2: { status: 'held', holdExpires: '2026-08-19T09:01:00Z' },
    A3: { status: 'held' }, // no expiry — managed elsewhere
    A4: { status: 'booked' },
    A5: { status: 'held', holdExpires: '2026-08-19T08:59:00Z' }, // already lapsed
  },
};

describe('heldSeats', () => {
  it('lists held seats with an expiry, soonest first', () => {
    expect(heldSeats(STATE, NOW).map((s) => s.seatId)).toEqual(['A5', 'A2', 'A1']);
  });

  it('reports the time left, negative once lapsed', () => {
    const byId = new Map(heldSeats(STATE, NOW).map((s) => [s.seatId, s.msRemaining]));
    expect(byId.get('A1')).toBe(5 * 60_000);
    expect(byId.get('A2')).toBe(60_000);
    expect(byId.get('A5')).toBe(-60_000);
  });

  it('omits held seats with no holdExpires, and every other status', () => {
    const ids = heldSeats(STATE, NOW).map((s) => s.seatId);
    expect(ids).not.toContain('A3');
    expect(ids).not.toContain('A4');
  });

  it('accepts a Date as well as an ISO string', () => {
    expect(heldSeats(STATE, new Date(NOW))).toEqual(heldSeats(STATE, NOW));
  });

  it('is empty for a state with no seats', () => {
    expect(heldSeats({ kerusi: '1.0', mapId: 'm1', updatedAt: NOW })).toEqual([]);
  });
});
