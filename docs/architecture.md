# Architecture: core vs. framework bindings

The library is split into a framework-agnostic core and thin per-framework
bindings. This document is the contract for that split — read it before adding
code, and use it to decide where new code goes.

```
projects/
  core/            → @kerusiweb/core     pure TypeScript, no framework
  angular/         → @kerusiweb/angular  Angular binding
  react/           → @kerusiweb/react    React binding
  angular-demo/                          the Angular demo app
  react-demo/                            the React demo app
  demo-scenarios/                        the venues both demos show
```

Every binding depends on `@kerusiweb/core` as a **peer** dependency, so an
application installs one binding plus core and there is exactly one copy of the
format types in the graph:

```bash
npm install @kerusiweb/core @kerusiweb/angular   # Angular
npm install @kerusiweb/core @kerusiweb/react     # React
```

The second binding is what turns the split below from an assertion into a
tested one: `projects/react/src/kerusi-seatmap.spec.tsx` is the Angular
component spec's assertions run against React-rendered DOM, and for the same
documents the two emit byte-identical SVG.

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

- **No framework import.** Not Angular, not React, not RxJS. `grep -rniE "@angular|rxjs|from .react" projects/core/src` must stay empty; CI type-checks core with `tsc` alone.
- **No DOM.** Core runs in Node, in a build step, or on a server. Its tests run under plain `vitest` with `environment: 'node'`.
- **No `any`.** Core compiles under `"strict": true` (which the workspace root tsconfig does not set).
- **Relative imports carry a `.js` extension**, because core is `"type": "module"` built with `moduleResolution: nodenext`, so its output resolves in plain Node ESM as well as in a bundler.
- **Pure and immutable.** Functions take documents and return new values; nothing holds mutable module state.

## What belongs in a binding

Only what the framework itself supplies:

- **Components, decorators, templates** — the three components in `lib/kerusi-seatmap/` and their `.html`/`.css`. Their job is to bind data core already computed: `[attr.d]="seatBodyPath(...)"`, `@for` over `layout().seats`.
- **Reactivity primitives** — `signal`, `computed`, `effect`, `input`, `model`, `output`. Notably `KerusiStateStore` (`lib/kerusi-state-store.ts`) is _only_ a signal wrapper; the delta-ordering and hold-expiry logic it calls (`applyStateDeltaOrdered`, `expireHolds`) lives in core.
- **Dependency injection** — `inject(ElementRef)`.
- **Direct DOM access.** There are exactly two sites in either binding: reading `dataset['seatId']` off a key event's target, and locating a `<g>` to focus. Angular does the second with a `querySelectorAll` scan in `kerusi-seatmap.component.ts`; React registers each seat node in a ref map (`use-roving-focus.ts`). Same job, framework-native means, and neither belongs in core.
- **Style delivery.** Angular ships view-encapsulated component CSS through ng-packagr. React has no equivalent, so `@kerusiweb/react` ships a single `styles.css` the consumer imports once. The rules are the same in both; only how they reach the page differs.
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

`projects/react` is the worked example. Most of it maps across mechanically —
`computed()` becomes `useMemo`, `effect()` becomes `useEffect`, `input()` becomes
a prop, `output()` becomes an `on*` callback, and `model()` splits into the
controlled/uncontrolled pair React expects (`selection` + `onSelectionChange`,
or `defaultSelection`). Three things needed real thought rather than
translation:

- **The roving tab stop.** Held per section in both, because arrow keys never
  cross a section boundary. React moves DOM focus from an effect keyed on the
  tab stop, so the target's `tabindex` is already committed when `.focus()` runs.
- **Re-announcing an identical message.** A live region that sees no text change
  stays silent. Angular clears the region and refills it a microtask later — two
  commits, which React would batch back into one. React appends a zero-width
  space on alternate announcements instead: one commit, the text still differs,
  and no screen reader speaks the character.
- **`validate: 'throw'`.** Angular throws from an `effect`. React throws during
  render, where an error boundary can catch it.

Adding the second binding meant promoting three functions into core first, by
the rule above — each had been living in the Angular package, and each would
otherwise have been retyped verbatim:

| Promoted        | Now in                          | Was                                                                                                            |
| --------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `isRtlLocale`   | `view/rtl.ts`                   | a module-private helper in `kerusi-seatmap.component.ts`                                                       |
| `heldSeats`     | `kerusi/kerusi-state.ts`        | the body of `KerusiStateStore.heldSeats` — core already exported the `HeldSeat` type with nothing producing it |
| `resolveColors` | `view/kerusi-seatmap-colors.ts` | the `{...DEFAULT_KERUSI_COLORS, ...colors}` spread every paint call site repeated                              |

## Build order

The workspace root `tsconfig.json` holds only framework-neutral options; the
Angular-only `angularCompilerOptions` sit in `tsconfig.angular.json`, which just
the Angular binding and demo extend. Core and the React binding extend the
neutral root directly and never see them.

Core is a plain `tsc` build and every binding resolves it through the npm
workspace symlink to `projects/core/dist`, so **core must build first**.
`build:angular` and `build:react` each chain it. Both bindings set `"paths": {}` in
their build tsconfig deliberately: it cancels the workspace-root source alias so
`@kerusiweb/core` stays an external peer rather than being compiled into the
binding's own output.

`@kerusiweb/react` is built by `tsc` alone, like core — no bundler. Its
`styles.css` sits at the package root rather than under `src/`, so it ships via
`files` without a copy step and `exports` can name it directly.

| Command                      | Does                                             |
| ---------------------------- | ------------------------------------------------ |
| `npm run build:core`         | `tsc -p projects/core/tsconfig.json`             |
| `npm run build:angular`      | core, then `ng build angular`                    |
| `npm run build:react`        | core, then `tsc -p projects/react/tsconfig.json` |
| `npm run build:angular-demo` | the Angular demo                                 |
| `npm run build:react-demo`   | the React demo (Vite)                            |

Both demos run against **source**, not the built packages — the Angular demo
through the root tsconfig's path aliases, the React demo through matching Vite
aliases — so a change in core or in a binding hot-reloads in either.

## Test commands

| Command                     | Does                                    |
| --------------------------- | --------------------------------------- |
| `npm run test:core`         | `vitest run --root projects/core`       |
| `npm run test:angular`      | Angular's unit-test builder, on the lib |
| `npm run test:angular-demo` | the same builder, on the demo app       |
| `npm run test:react`        | `vitest run --root projects/react`      |
| `npm run test:ci`           | all four, in that order                 |
