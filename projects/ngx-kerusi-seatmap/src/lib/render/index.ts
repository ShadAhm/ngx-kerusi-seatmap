/**
 * The pure render model: a `KerusiMap` + `KerusiState` resolved into everything
 * a renderer needs, and the geometry to place it.
 *
 * Nothing here imports `@angular/core` — the model can be built in a test, a
 * build step, or on a server.
 */

export * from './render-model';
export * from './build-render-model';
export * from './section-layout';
export * from './navigation-order';
export * from './element-shapes';
export * from './seat-shapes';
