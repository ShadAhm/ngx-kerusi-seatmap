/**
 * The pure render model: a `KerusiMap` + `KerusiState` resolved into everything
 * a renderer needs, and the geometry to place it.
 *
 * Nothing here imports a framework — the model can be built in a test, a
 * build step, or on a server.
 */

export * from './render-model.js';
export * from './build-render-model.js';
export * from './section-layout.js';
export * from './navigation-order.js';
export * from './element-shapes.js';
export * from './seat-shapes.js';
