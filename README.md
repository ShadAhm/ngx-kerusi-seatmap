# ngx-kerusi-seatmap

[![CI](https://github.com/ShadAhm/ngx-kerusi-seatmap/actions/workflows/ci.yml/badge.svg)](https://github.com/ShadAhm/ngx-kerusi-seatmap/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/ngx-kerusi-seatmap.svg)](https://www.npmjs.com/package/ngx-kerusi-seatmap)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An Angular seat map that renders the **[Kerusi Seat Map & Availability
Format](https://github.com/ShadAhm/kerusi)** directly as inline SVG — cinemas,
aircraft, theatres, stadiums, coaches, trains — with keyboard navigation and
screen-reader support built in.

Give it a `KerusiMap` and a `KerusiState` and it draws the venue: each `Section`
in its own layout mode with its own proportions, seats coloured from the map's
legend, prices resolved through the standard's precedence order, and companion
seats booked as a unit.

**[Live demo →](https://shadahm.github.io/ngx-kerusi-seatmap/)**

## Install

```bash
npm install @kerusiweb/core ngx-kerusi-seatmap
```

Two packages: [`@kerusiweb/core`](projects/core) holds the framework-agnostic
logic — document types, the conformance validator, the render model and its
geometry — and `ngx-kerusi-seatmap` is the Angular binding over it. See
[docs/architecture.md](docs/architecture.md) for the boundary.

## Quick start

```ts
import { Component, signal } from '@angular/core';
import { KerusiSeatmapComponent } from 'ngx-kerusi-seatmap';
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

`selection` is a plain list of seat ids. Nothing is mutated, so it works with
`OnPush`, signals, or any store you already have.

See the [library README](projects/ngx-kerusi-seatmap/README.md) for the full API,
and [docs/kerusi.md](docs/kerusi.md) for a tour of what the format can express.

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
| **Live availability**                 | `KerusiStateStore` applies deltas in order, discards stale and out-of-scope ones, and reverts lapsed holds.                                                                                |
| **Validation**                        | Every MUST-level rule, throwing or collecting, with a rule slug and document path per violation — asserted against the example corpus published with the standard.                         |

## Repository layout

| Path                           | What it is                                                                |
| ------------------------------ | ------------------------------------------------------------------------- |
| `projects/core/`               | `@kerusiweb/core` — framework-agnostic format, render model and geometry. |
| `projects/ngx-kerusi-seatmap/` | The Angular binding over core.                                            |
| `projects/demo/`               | Demo app, deployed to GitHub Pages.                                       |
| `docs/`                        | [Architecture](docs/architecture.md), format guide, conformance report.   |

## Develop

```bash
npm install
npm start          # serve the demo at http://localhost:4200
npm run test:ci    # run core + library + demo unit tests
npm run build:core # build @kerusiweb/core into projects/core/dist
npm run build:lib  # build core, then the library into dist/ngx-kerusi-seatmap
```

The Angular library resolves `@kerusiweb/core` through the npm workspace, so
core must be built before the library — `build:lib` chains them for you.

## Publishing

Releases are cut manually (CI never publishes to npm):

1. Bump `version` in `projects/core/package.json` and `projects/ngx-kerusi-seatmap/package.json`
   (keep them in step, and update the `@kerusiweb/core` peer range) and add a `CHANGELOG.md` entry.
2. `npm run build:lib` (builds core first).
3. `npm publish --workspace @kerusiweb/core --access public` — core must go out first,
   since the library declares it as a peer.
4. `cd dist/ngx-kerusi-seatmap && npm publish --access public` (add `--dry-run` first to inspect contents).
5. `git tag vX.Y.Z && git push --tags`, then cut a GitHub Release from the tag.

## History

This began as a small AngularJS 1.x directive called `keruSVG`, revived as a
modern standalone Angular library. Version 1.0 renamed it to
`ngx-kerusi-seatmap` and rebuilt it around the Kerusi format. See
[CHANGELOG.md](CHANGELOG.md) for details.

## License

MIT © Arshad Ahmad
