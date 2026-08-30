/**
 * The React binding for the Kerusi Seat Map & Availability Format.
 *
 * Everything framework-free lives in `@kerusiweb/core` and is imported from
 * there, not re-exported here: the document types (`KerusiMap`, `KerusiState`,
 * `KerusiSession`), the conformance validator, the render model
 * (`buildRenderModel`, `RenderMap`, `RenderSeat`), the geometry
 * (`computeSectionLayout`), and the view helpers (`summarizeSelection`,
 * `seatAriaLabel`, `DEFAULT_KERUSI_COLORS`). This package supplies only what is
 * React's: components, hooks, and their props.
 *
 * The stylesheet is a separate import: `import '@kerusiweb/react/styles.css'`.
 */

export { KerusiSeatmap } from './kerusi-seatmap.js';
export { KerusiSection } from './kerusi-section.js';
export type { KerusiSectionProps } from './kerusi-section.js';
export { KerusiLegend } from './kerusi-legend.js';
export type { KerusiLegendProps } from './kerusi-legend.js';
export { useKerusiState } from './use-kerusi-state.js';
export type { UseKerusiState, UseKerusiStateOptions } from './use-kerusi-state.js';
export type {
  KerusiSeatmapHandle,
  KerusiSeatmapProps,
  SeatDisallowed,
  SeatInteraction,
  SectionRenderOptions,
  ValidationMode,
} from './types.js';
