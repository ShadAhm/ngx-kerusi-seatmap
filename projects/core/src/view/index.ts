/**
 * Presentation policy that is still framework-free: the colour system a
 * renderer resolves seat fills from, the ARIA strings it announces, and the
 * selection rules that decide whether a seat may be toggled.
 *
 * A binding turns these into markup; none of them know how.
 */

export * from './kerusi-seatmap-colors.js';
export * from './seat-aria.js';
export * from './selection.js';
