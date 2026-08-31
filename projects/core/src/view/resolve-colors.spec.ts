import { describe, expect, it } from 'vitest';
import { DEFAULT_KERUSI_COLORS, resolveColors } from './kerusi-seatmap-colors.js';

describe('resolveColors', () => {
  it('returns the defaults when given nothing', () => {
    expect(resolveColors()).toEqual(DEFAULT_KERUSI_COLORS);
    expect(resolveColors({})).toEqual(DEFAULT_KERUSI_COLORS);
  });

  it('overrides only the keys supplied', () => {
    const resolved = resolveColors({ selectedBg: '#123456' });
    expect(resolved.selectedBg).toBe('#123456');
    expect(resolved.bookedBg).toBe(DEFAULT_KERUSI_COLORS.bookedBg);
  });

  it('does not mutate the defaults', () => {
    const before = DEFAULT_KERUSI_COLORS.selectedBg;
    resolveColors({ selectedBg: '#000000' });
    expect(DEFAULT_KERUSI_COLORS.selectedBg).toBe(before);
  });
});
