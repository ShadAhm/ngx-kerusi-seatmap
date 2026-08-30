/*
 * Public API Surface of @kerusiweb/core
 *
 * Framework-agnostic Kerusi seat-map logic. Nothing here imports Angular,
 * React, or any other framework — see docs/architecture.md for the boundary.
 */

// --- Kerusi format: document types, validation, pricing, locale, state ------
export * from './kerusi/index.js';

// --- Render model: the resolved view a renderer consumes, plus geometry -----
export * from './render/index.js';

// --- View policy: colours, ARIA strings, selection rules --------------------
export * from './view/index.js';
