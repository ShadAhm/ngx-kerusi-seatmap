# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

1. **The framework-agnostic core is now its own package, `@kerusiweb/core`.**
   The Kerusi document types, the conformance validator, the price/locale/row
   resolution, the render model and its geometry, and the colour, ARIA and
   selection helpers all moved out of the Angular library into
   `projects/core/`. `ngx-kerusi-seatmap` is now the Angular binding alone —
   three components and the signal-backed `KerusiStateStore` — and declares
   `@kerusiweb/core` as a peer dependency.

   The split was mostly already there: only four files imported `@angular/core`
   and none imported RxJS. The one genuinely mixed file was
   `kerusi-state-store.ts`, whose pure delta-ordering and hold-expiry functions
   are now `@kerusiweb/core`'s `kerusi-state`, with the signal wrapper left
   behind in the Angular package. No logic changed. See
   [docs/architecture.md](docs/architecture.md) for what belongs where.

   Core compiles under `strict` with no framework, no DOM and no `any`, tests
   under plain Vitest, and — because it is `"type": "module"` with explicit
   import extensions — loads in Node ESM without a bundler, so validation can
   run server-side or in a build step.

### Breaking

- **Install both packages:** `npm install @kerusiweb/core ngx-kerusi-seatmap`.
- **Imports move.** Everything except `KerusiSeatmapComponent`,
  `KerusiSectionComponent`, `KerusiLegendComponent`, `KerusiStateStore` and the
  component I/O types (`SeatDisallowed`, `SeatInteraction`,
  `SectionRenderOptions`, `ValidationMode`) now comes from `@kerusiweb/core`:

  ```ts
  import { KerusiSeatmapComponent } from 'ngx-kerusi-seatmap';
  import type { KerusiMap, KerusiState } from '@kerusiweb/core';
  ```

  No symbol was renamed, removed or changed in behaviour — only its package.

## [1.1.0] - 2026-08-29

Brings the library up to **rev 13** of the Kerusi standard. The conformance
report was written against rev 9; revisions 10 through 13 have since added
empty rows, normative element spans, direction labels and an RFC 3339 timestamp
requirement. `docs/kerusi-conformance.md` is reassessed against rev 13.

### Added

1. **Empty rows reserve vertical space, because the document says so.**
   `Section.rows`, where present, is now read as the section's complete row
   registry (§4.2), so a `RowMeta` no seat references is materialized as a real
   row and reserves the space one row of seats would (§4.2.2). That is how a
   grid section opens the throw between a cinema screen and row A, or a
   cross-aisle between two rows.

   Rows were derived from the seats that referenced them, so a seatless row
   simply vanished and a grid cinema had nowhere to put its screen — §4.3.2
   mandated an `Element` for labelled space that grid mode gave that `Element`
   nowhere to occupy. The row order of §4.2.1 is now explicit too: indexed rows
   first ascending, then unindexed ones in declaration order, with `index`
   treated as an ordering key rather than a position. Every declared row reaches
   the render model as a `RenderRow`, carrying a new `empty` flag; keyboard
   navigation steps over the empty ones rather than into them.

2. **`Section.directions` (§4.10),** localized onto `RenderSection.directions`.
   A purely informational label for what an addressing axis means physically —
   "front of train" / "back of train", or compass points for open-air seating.
   Never validated against, and never read to decide layout or screen placement.

3. **The example corpus published with the standard is now a test.** All 42
   documents from the spec repository are vendored under
   `src/lib/kerusi/conformance/` and asserted file by file: the conformant ones
   accepted, the semantically invalid ones rejected by rule id. Five
   schema-invalid fixtures are accepted on purpose — one because §2 and §7
   require a consumer to ignore unrecognized members, four because they fail a
   producer-side shape constraint the published JSON Schemas own. That folder's
   README says which is which.

### Changed

1. **An element is now bound to its section's positioning mode, and its grid
   spans must be positive integers (§4.4.1).** Rev 12 gave `Element.width` and
   `height` normative units — column and row spans in cells, defaulting to 1 —
   and bound an element to its section's mode as §4.5 already bound its seats.
   Four rules enforce it, and all four are **errors** where the nearest previous
   check was a warning:

   | Rule                       | Rejects                                                       |
   | -------------------------- | ------------------------------------------------------------- |
   | `element-layout-mismatch`  | `x`/`y` on a grid element, `col` on a freeform one            |
   | `element-span-invalid`     | a fractional or non-positive span on a grid-addressed element |
   | `element-row-span-overrun` | a row span reaching past the section's last row               |
   | `element-row-unresolved`   | an `Element.row` the section's `rows` does not declare (§4.6) |

   `element-position-mode` is gone; it warned about the first of these and its
   name did not survive the promotion. A document that only drew oddly before is
   now rejected — most often a grid element positioned with a percentage `y`,
   which should become a `row` anchored to an empty row. An element positioned
   no way at all is still a warning: §4.4 does not require one to be placed.
   Omitting `col` now spans the section's full column extent, per §4.4.1.

2. **Timestamps must be RFC 3339 `date-time` (§5.1.1).** `KerusiState.updatedAt`,
   `SeatStatus.holdExpires`, `KerusiStateDelta.updatedAt`,
   `KerusiSession.startsAt` and `endsAt` are now format-checked, calendar
   included, and a document failing the check is rejected —
   `state-updatedat-format`, `seat-status-hold-expires-format`,
   `session-startsat-format`, `session-endsat-format`.

   Rev 13 narrowed the requirement from "ISO 8601", which admits forms a
   consumer cannot reliably parse: seconds omitted, the basic format without
   separators, ordinal and week dates, local times with no offset. A consumer
   that cannot parse `holdExpires` cannot show a correct countdown. A document
   whose timestamps were already `2026-08-17T09:14:00Z` is unaffected.

3. **A selected seat is drawn from two tones instead of one.** `selectedBg` is
   now a frame around a `selectedFg` core, and the number, occupant figure and
   wheelchair marker are tinted `selectedBg` to read against that core.

   It was the other way round before — a near-white rim around a mid-purple
   middle — which put the low-contrast tone on the outside boundary. A selected
   seat therefore dissolved into a light page and sank into a dark one, and it
   separated poorly from its neighbours in both. Holding a light tone and a dark
   one at once means one of them always separates, whichever way the page is
   themed, without the library detecting anything. Worst-case contrast against a
   neighbouring seat, over every status and both themes, goes from 1.09:1 to
   3.16:1.

   Two knock-ons worth knowing about. The occupant figure and wheelchair marker
   on a selected seat are now measured from the core's box rather than the
   seat's, so they no longer cross the frame. And the number carries a
   core-coloured halo, because it sits on the occupant silhouette rather than on
   bare core — that lifts its real contrast from 2.6:1 to the full 4.95:1.

   If you set `selectedBg` and left `selectedFg` at its default, set both now:
   `selectedFg` is most of a selected seat's area rather than just a label tint.
   `README.md` carries a CSS snippet that restores the flat pre-1.1 treatment.

4. **`.kerusi-seat__ring` is now `.kerusi-seat__core`,** and it is filled rather
   than stroked.

5. **`seatRingStroke` is renamed `seatSelectedFrame`.** The old name is still
   exported and still resolves to the same function; it is deprecated.

### Removed

1. **The `headroomRows` input.** It reserved rows' worth of space above a grid
   section's first row, and was never released. Rev 12 considered exactly this
   field on the document side and rejected it — a renderer hint in a format §2
   keeps renderer-agnostic, solving the top margin and leaving mid-section space
   unrepresentable. Declare the rows instead: `{ id: 'throw' }` with no seats
   reserves the same space, travels with the document, and works between two
   rows as well as above the first.

## [1.0.0] - 2026-08-19

The library is renamed and rebuilt around the Kerusi Seat Map & Availability
Format. `KerusiMap` and `KerusiState` are now the renderer's primary input
rather than something adapted into a grid model.

The unreleased 0.2 work described in the previous edition of this file is
folded into this release.

### Breaking

1. **The package is renamed** `ngx-keruc-seatpicker` → `ngx-kerusi-seatmap`.
   The repository moved to `github.com/ShadAhm/ngx-kerusi-seatmap` (GitHub
   redirects the old URL), and the demo now lives at
   `shadahm.github.io/ngx-kerusi-seatmap/`.

2. **The Angular prefix is `kerusi`, not `keruc`.** `<keruc-seatpicker>` is now
   `<kerusi-seatpicker>`, and the CSS classes `.keruc-seat` / `.keruc-element`
   are now `.kerusi-seat` / `.kerusi-element`. Stylesheets targeting the old
   class names need updating.

3. **`Section.layout` is a validated constraint, not a rendering hint.** The
   standard's strict-layout revision requires a conformant validator to enforce
   it at v1.0, so documents that previously adapted are now rejected:

   - a `grid` section whose seats carry `x` or `y`;
   - a `grid` section with a seat lacking `col` (it is never inferred from array
     order);
   - a `freeform` section whose seats carry `col`, or lack `x` or `y`;
   - a `mixed` section whose seats lack any of `col`, `x`, `y`;
   - a section omitting `layout` whose seats mix positioning methods, so no mode
     can be inferred.

   Layout is no longer inferred as "any seat has `x`/`y` ⇒ freeform".

4. **The `kerusi` member's value is checked.** A document declaring a major
   version other than `1` is rejected (`map-version-unsupported`). A future
   `1.x` minor is still accepted, per §7.

5. **`Element.id` and `Element.kind` are enforced.** Both are REQUIRED by §4.4
   and were previously unchecked.

6. **Seat and section ids must be unique.** Seat ids are globally unique within
   a map (§4.3); section ids and per-section element ids are unique too.

7. **`KerusiValidationError` gains a fourth constructor argument**,
   `violations`, carrying every finding from the same pass. The thrown error is
   still the first in document order, but a document with several faults may now
   report a newly added rule ahead of one that existed before.

### Added

**The Kerusi-native renderer**

- `<kerusi-seatmap>` (`KerusiSeatmapComponent`) takes `[map]`, `[state]` and
  `[session]` directly. Each `Section` renders as its own `<svg>` with its own
  layout mode, aspect ratio and `<h3>` heading, so a multi-section venue is
  structure rather than one continuous run of rows, and a freeform orchestra can
  sit above a grid balcony in the same map.
- Selection is immutable: `[(selection)]` is a list of seat ids, and nothing on
  the seat is mutated. With `companionMode: 'auto'` (the default) a seat's whole
  companion closure selects and deselects as one unit, `maxSelection` counts the
  closure, and a pair whose other half is unavailable is refused with
  `reason: 'companion-unavailable'`.
- The document now drives the picture: `SeatType.color` colours an available
  seat (with a contrast-correct label), `Element.kind` chooses a shape, prices
  render, and grid-addressed elements finally appear — the pre-1.0 renderer drew
  elements only in freeform sections.
- Rich events: `seatSelect`, `seatDeselect`, `seatDisallowed` (with a typed
  reason), `seatFocus`, `validationIssues`.
- `<kerusi-legend>` (`KerusiLegendComponent`), opt-in via `[showLegend]`. It
  resolves swatches through the same path as the seat fills, so the two cannot
  drift apart.

**Accessibility**, previously absent entirely

- Every seat is a `role="button"` with a per-section roving tabindex — Tab moves
  between sections, arrows move within.
- Arrow keys follow the §4.3.1 `col` order, including in `mixed` sections, so an
  aisle (a column no seat occupies) is stepped across rather than into.
  `Home`/`End`, `Ctrl+Home`/`Ctrl+End`, `PageUp`/`PageDown`, `Enter`/`Space` and
  `Escape` all work.
- Each seat announces its position, type, price, availability, hold expiry,
  attributes and every `Seat.accessibility` property. A polite live region
  reports the running selection and any disallowed reason.
- Right-to-left rendering derived from the locale, mirroring layout and arrow
  direction while leaving `col` order intact.
- `[ariaStrings]` makes every announced phrase translatable.

**Format support**

- `Seat.accessibility` (§4.3.4): `wheelchairAccessible`, `transferArmrest`,
  `aisleChairCompatible`, `companionRequired`.
- Non-throwing validation: `checkKerusiMap`, `checkKerusiState`,
  `checkKerusiStateDelta`, `checkKerusiSession` return every violation with a
  rule slug, a `severity` and a document path. `validateKerusiSession` and
  `validateDocumentSet` are new; `validateDocumentSet` checks the map, session
  and state actually reference each other.
- Localization: `resolveLocalizedText` walks the BCP-47 chain for
  `Section.label` and `SeatType.label`; `resolveMapLocale`, `formatMoney`,
  `toMajorUnits`, `minorUnitDigits`, `sumMoney`.
- `KerusiStateStore` for live availability: `applyStateDeltaOrdered` discards
  stale, duplicate and out-of-scope deltas, `expireHolds` reverts a lapsed hold,
  and `needsRefetch` flags a detected gap. `[expireHolds]` wires the same
  behaviour into the component.
- A pure, framework-free render layer: `buildRenderModel`,
  `computeSectionLayout`, `buildNavigationGraph`, `elementStyle`,
  `summarizeSelection`. Nothing under `kerusi/` or `render/` imports
  `@angular/core`.

### Fixed

- **A section no longer stretches to fill a fixed canvas.** Sections are sized
  intrinsically and capped at their natural width, so a wide auditorium is not
  squashed and a four-tier theatre does not draw box seats several times the
  size of orchestra seats.
- **`formatMoney` reads the currency's minor-unit exponent** instead of dividing
  by 100, which rendered JPY 100× too small and KWD 10× too large.
- Element ids now survive into the render model.
- `CSS.escape` is no longer used to locate a seat node — it is undefined in
  jsdom and under SSR.

## [0.1.0] - 2026-08-16

First release as a modern Angular library, superseding the never-released
AngularJS 1.x directive.

### Added

- Standalone, signal-based `SeatPickerComponent` that renders a seat map as
  inline SVG.
- Typed data model: `NodeType`, `SeatState`, `SeatNode`, `SeatRow`, and
  `SeatPickerColors`.
- Inputs `rows`, `canvasWidth`, `canvasHeight`, and `colors`.
- Outputs `selected`, `deselected`, and `disallowedSelected`.
- Demo app deployed to GitHub Pages.

### Fixed

Carried over from the legacy directive:

- `canvasWidth` / `canvasHeight` now drive the rendered SVG dimensions (were
  hardcoded to 500×500).
- Clicking an occupied seat now emits `disallowedSelected` instead of silently
  doing nothing.
- Rendering is per-instance (no global element id lookup), so multiple pickers
  can coexist on one page.

[1.0.0]: https://github.com/ShadAhm/ngx-kerusi-seatmap/releases/tag/v1.0.0
[0.1.0]: https://github.com/ShadAhm/ngx-kerusi-seatmap/releases/tag/v0.1.0
