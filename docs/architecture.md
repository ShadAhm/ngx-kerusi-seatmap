# Architecture: core vs. framework bindings

The library is split into a framework-agnostic core and thin per-framework
bindings. This document is the contract for that split — read it before adding
code, and use it to decide where new code goes.

```
projects/
  core/                → @kerusiweb/core    pure TypeScript, no framework
  ngx-kerusi-seatmap/  → ngx-kerusi-seatmap Angular binding
  demo/                                     the demo app, consumes both
```

`ngx-kerusi-seatmap` depends on `@kerusiweb/core` as a **peer** dependency, so an
application installs both and there is exactly one copy of the format types in
the graph:

```bash
npm install @kerusiweb/core ngx-kerusi-seatmap
```

## What belongs in core

Anything that would be **written identically in a React binding**. In practice
that is everything from the wire format down to the SVG path strings — the whole
pipeline, stopping just short of markup.

| Folder        | Holds                                                                                                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/kerusi/` | The Kerusi document types (`KerusiMap`, `KerusiState`, `KerusiSession`), the conformance validator, and the price, locale, row-order, layout-mode and live-delta resolution built on them.                                               |
| `src/render/` | `buildRenderModel()` — a map + state resolved into a `RenderMap` — plus `computeSectionLayout()` geometry, `buildNavigationGraph()` keyboard order, and the `seat-shapes` / `element-shapes` functions that return SVG path `d` strings. |
| `src/view/`   | Presentation _policy_ that still knows nothing about markup: the colour system (`kerusi-seatmap-colors`), the announcement strings (`seat-aria`), and the rules deciding whether a seat may be toggled (`selection`).                    |

Rules for core:

- **No framework import.** Not Angular, not React, not RxJS. `grep -rn "@angular\|rxjs" projects/core/src` must stay empty; CI type-checks core with `tsc` alone.
- **No DOM.** Core runs in Node, in a build step, or on a server. Its tests run under plain `vitest` with `environment: 'node'`.
- **No `any`.** Core compiles under `"strict": true` (which the workspace root tsconfig does not set).
- **Relative imports carry a `.js` extension**, because core is `"type": "module"` built with `moduleResolution: nodenext`, so its output resolves in plain Node ESM as well as in a bundler.
- **Pure and immutable.** Functions take documents and return new values; nothing holds mutable module state.

## What belongs in a binding

Only what the framework itself supplies:

- **Components, decorators, templates** — the three components in `lib/kerusi-seatmap/` and their `.html`/`.css`. Their job is to bind data core already computed: `[attr.d]="seatBodyPath(...)"`, `@for` over `layout().seats`.
- **Reactivity primitives** — `signal`, `computed`, `effect`, `input`, `model`, `output`. Notably `KerusiStateStore` (`lib/kerusi-state-store.ts`) is _only_ a signal wrapper; the delta-ordering and hold-expiry logic it calls (`applyStateDeltaOrdered`, `expireHolds`) lives in core.
- **Dependency injection** — `inject(ElementRef)`.
- **Direct DOM access.** There are exactly two sites in the whole binding, both in `kerusi-seatmap.component.ts`: reading `dataset['seatId']` off a click target, and a `querySelectorAll` over `<g>` elements for focus management. They are the canonical example of "binding-only" — a React binding would use refs instead, and neither belongs in core.
- **Component I/O types** that describe the component's own surface: `SeatInteraction`, `SeatDisallowed`, `SectionRenderOptions`, `ValidationMode`.

## The test that settles an argument

> If a React binding would need to write this code again, it belongs in core.

A new colour rule, a new layout mode, a new validator check, a new seat shape:
core. A new `@Input`, a new template branch, a new `effect`: binding.

## Adding a new binding

A binding needs to supply, and nothing more:

1. A component that renders `computeSectionLayout()` output as SVG — the shapes are already path strings.
2. Reactive plumbing from its framework to `buildRenderModel()`.
3. Event handling that calls `toggleSeatSelection()` and surfaces `DisallowedReason`.
4. Focus management and an `aria-live` region fed by `seatAriaLabel()` / `disallowedAnnouncement()`.

## Build order

Core is a plain `tsc` build and the Angular package resolves it through the npm
workspace symlink to `projects/core/dist`, so **core must build first**.
`npm run build:lib` chains them. `projects/ngx-kerusi-seatmap/tsconfig.lib.json`
sets `"paths": {}` deliberately: it cancels the workspace-root source alias so
ng-packagr treats `@kerusiweb/core` as an external peer rather than compiling it
into the Angular bundle.

| Command              | Does                                     |
| -------------------- | ---------------------------------------- |
| `npm run build:core` | `tsc -p projects/core/tsconfig.json`     |
| `npm run build:lib`  | core, then `ng build ngx-kerusi-seatmap` |
| `npm run test:core`  | `vitest run --root projects/core`        |
| `npm run test:lib`   | Angular's unit-test builder              |
| `npm run test:ci`    | all three test suites                    |
