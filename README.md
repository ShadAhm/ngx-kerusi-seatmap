# kerusiweb

[![CI](https://github.com/ShadAhm/kerusiweb/actions/workflows/ci.yml/badge.svg)](https://github.com/ShadAhm/kerusiweb/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A seat map that renders the **[Kerusi Seat Map & Availability
Format](https://github.com/ShadAhm/kerusi)** directly as inline SVG — cinemas,
aircraft, theatres, stadiums, coaches, trains — with keyboard navigation and
screen-reader support built in. Angular and React bindings ship today; the
renderer underneath them is plain TypeScript.

Give it a `KerusiMap` and a `KerusiState` and it draws the venue: each `Section`
in its own layout mode with its own proportions, seats coloured from the map's
legend, prices resolved through the standard's precedence order, and companion
seats booked as a unit.

**[Live demos →](https://shadahm.github.io/kerusiweb/)**

## Install

[`@kerusiweb/core`](projects/core) is always the first half — the
framework-agnostic logic: document types, the conformance validator, the render
model and its geometry. Add the binding for your framework:

```bash
npm install @kerusiweb/core @kerusiweb/angular   # Angular
npm install @kerusiweb/core @kerusiweb/react     # React
```

Each binding is a thin layer over core — components, reactivity, and the DOM.
Both expose the same surface and emit the same SVG. See
[docs/architecture.md](docs/architecture.md) for the boundary, and for what a
third binding would have to supply.

## Quick start

The same two documents drive either binding. They are documents, not framework
objects:

```ts
import type { KerusiMap, KerusiState } from '@kerusiweb/core';

const map: KerusiMap = {
  kerusi: '1.0',
  id: 'bus-42',
  domain: 'bus',
  legend: [{ id: 'standard', label: 'Standard' }],
  sections: [
    {
      id: 'main',
      seats: [
        { id: '1A', row: '1', col: 1, type: 'standard' },
        { id: '1B', row: '1', col: 2, type: 'standard' },
        // Column 3 is omitted — that gap is the aisle. No filler seat needed.
        { id: '1C', row: '1', col: 4, type: 'standard' },
        { id: '1D', row: '1', col: 5, type: 'standard' },
      ],
    },
  ],
};

const state: KerusiState = {
  kerusi: '1.0',
  mapId: 'bus-42',
  updatedAt: '2026-08-19T09:14:00Z',
  seats: { '1A': { status: 'booked' } }, // everything else is available
};
```

### Angular

```ts
import { Component, signal } from '@angular/core';
import { KerusiSeatmapComponent } from '@kerusiweb/angular';

@Component({
  selector: 'app-bus',
  imports: [KerusiSeatmapComponent],
  template: `<kerusi-seatmap [map]="map" [state]="state" [(selection)]="picked" />`,
})
export class BusComponent {
  protected readonly map = map;
  protected readonly state = state;
  protected readonly picked = signal<readonly string[]>([]);
}
```

### React

```tsx
import { useState } from 'react';
import { KerusiSeatmap } from '@kerusiweb/react';
import '@kerusiweb/react/styles.css';

export function Bus() {
  const [picked, setPicked] = useState<readonly string[]>([]);
  return <KerusiSeatmap map={map} state={state} selection={picked} onSelectionChange={setPicked} />;
}
```

`selection` is a plain list of seat ids in both. Nothing is mutated, so it works
with `OnPush`, signals, hooks, or any store you already have. The one asymmetry
is style delivery: React imports a stylesheet, Angular ships its CSS inside the
bundle.

See the [Angular README](projects/angular/README.md) or the
[React README](projects/react/README.md) for the full API, and
[docs/kerusi.md](docs/kerusi.md) for a tour of what the format can express.

## What it supports

The library is a conformant Kerusi consumer. [docs/kerusi-conformance.md](docs/kerusi-conformance.md)
is a feature-by-feature audit; the highlights:

|                                       |                                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **All three positioning modes**       | `grid`, `freeform` (percentage coordinates and per-seat rotation) and `mixed`, validated strictly per §4.5 and inferred when a section omits `layout`.                                     |
| **Sections as render units**          | Each `Section` is its own `<svg>` with its own layout mode, aspect ratio and heading — a freeform orchestra and a grid balcony coexist in one map.                                         |
| **The document drives the picture**   | `SeatType.color`, price tiers, attributes and `Element.kind` all affect what is drawn.                                                                                                     |
| **Space is declared, not configured** | An empty row (§4.2.2) reserves the throw in front of a cinema screen or a cross-aisle mid-section, so the same document produces the same vertical arrangement in any conformant renderer. |
| **Accessibility**                     | Roving tabindex, arrow keys that follow the §4.3.1 `col` order, and seats announced with their type, price, status and every §4.3.4 accessibility property.                                |
| **Companions**                        | `companions` closures book and release together, and a pair whose other half is sold is refused rather than half-taken.                                                                    |
| **Live availability**                 | `KerusiStateStore` (Angular) and `useKerusiState` (React) apply deltas in order, discard stale and out-of-scope ones, and revert lapsed holds.                                             |
| **Validation**                        | Every MUST-level rule, throwing or collecting, with a rule slug and document path per violation — asserted against the example corpus published with the standard.                         |

## Repository layout

| Path                       | What it is                                                                |
| -------------------------- | ------------------------------------------------------------------------- |
| `projects/core/`           | `@kerusiweb/core` — framework-agnostic format, render model and geometry. |
| `projects/angular/`        | `@kerusiweb/angular` — the Angular binding over core.                     |
| `projects/react/`          | `@kerusiweb/react` — the React binding over core.                         |
| `projects/angular-demo/`   | The Angular demo, deployed to GitHub Pages.                               |
| `projects/react-demo/`     | The React demo (Vite), deployed alongside it.                             |
| `projects/demo-scenarios/` | The five venue documents both demos render.                               |
| `docs/`                    | [Architecture](docs/architecture.md), format guide, conformance report.   |

## Develop

```bash
npm install
npm run start:angular  # serve the Angular demo at http://localhost:4200
npm run start:react    # serve the React demo (Vite)
npm run test:ci        # core + both bindings + both demos
npm run build:core     # build @kerusiweb/core into projects/core/dist
npm run build:angular  # build core, then @kerusiweb/angular into dist/angular
npm run build:react    # build core, then @kerusiweb/react into projects/react/dist
```

There is deliberately no bare `npm start` / `npm test` / `npm run build`: every
script names its framework, so no binding is the default and the others an
afterthought.

Every binding resolves `@kerusiweb/core` through the npm workspace, so core must
be built first — `build:angular` and `build:react` each chain it for you. Both
demos run against source, so a change in core or in either binding hot-reloads.

New here? [CONTRIBUTING.md](CONTRIBUTING.md) has the dev loop and the one rule
that decides where code goes.

## Publishing

Releases are cut manually (CI never publishes to npm):

1. Bump `version` in `projects/core/package.json`, `projects/angular/package.json`
   and `projects/react/package.json` (keep them in step, and update the
   `@kerusiweb/core` peer range in both bindings) and add a `CHANGELOG.md` entry.
2. `npm run build:angular && npm run build:react` (each builds core first).
3. `npm publish --workspace @kerusiweb/core --access public` — core must go out first,
   since both bindings declare it as a peer.
4. `cd dist/angular && npm publish --access public` (add `--dry-run` first to inspect contents).
5. `npm publish --workspace @kerusiweb/react --access public` (again, `--dry-run` first —
   it should list `dist/**` and `styles.css`, and nothing from core).
6. `git tag vX.Y.Z && git push --tags`, then cut a GitHub Release from the tag.

## History

This began as a small AngularJS 1.x directive called `keruSVG`, revived as a
modern standalone Angular library. Version 1.0 rebuilt it around the Kerusi
format, and 1.1 extracted the framework-agnostic core — making Angular one
binding among several rather than the project itself. See
[CHANGELOG.md](CHANGELOG.md) for details.

## License

MIT © Arshad Ahmad
