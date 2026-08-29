# Kerusi conformance report

Which parts of the **Kerusi Seat Map and Availability Format** this library
implements, and which it does not.

|               |                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Library       | `ngx-kerusi-seatmap` 1.1.0 (this repository)                                                                              |
| Spec assessed | [Kerusi standard v1.0.0-draft](https://github.com/ShadAhm/kerusi/blob/master/RFC/kerusi-standard_v1.0.0-draft.md), rev 13 |
| Date          | 2026-08-29                                                                                                                |

**Headline:** the library is a conformant **consumer** and **validator** by the
spec's own §7 definition, on every one of the six requirements §7 now lists. It
merges state by `Seat.id`, enforces §4.6 referential integrity including
companion symmetry, enforces §4.5 layout consistency, materializes every row a
section declares including the empty ones (§4.2.2), enforces the element
positioning and span rules of §4.4.1, applies the §4.9 price-resolution order,
and ignores unrecognized members.

Each claim above is asserted file by file against the corpus published with the
standard, vendored under
`projects/ngx-kerusi-seatmap/src/lib/kerusi/conformance/` — including the five
schema-invalid fixtures this library accepts on purpose, which that folder's
README explains.

The remaining gaps are scope decisions rather than modelling limits: this is a
renderer, so it defines no transport, and it ships no JSON Schema.

Status key: ✅ supported · ⚠️ partial · ❌ not supported

---

## §3 Document types

| Type               | Status | Notes                                                                                                              |
| ------------------ | ------ | ------------------------------------------------------------------------------------------------------------------ |
| `KerusiMap`        | ✅     | Typed, validated, resolved, rendered.                                                                              |
| `KerusiState`      | ✅     | Typed, validated, merged by `Seat.id`; sparse rule honored.                                                        |
| `KerusiStateDelta` | ✅     | `KerusiStateStore` applies deltas with ordering and scope enforced. See §5.2 on gap detection.                     |
| `KerusiSession`    | ✅     | Typed, validated, and joined — `validateDocumentSet` checks a state's `sessionId` and a session's `mapId` resolve. |

## §4 KerusiMap

| Field                      | Status | Notes                                                                                                           |
| -------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `kerusi`                   | ✅     | Presence **and value** checked. `1.x` accepted (a future minor must not break a parser); other majors rejected. |
| `id`, `sections`, `legend` | ✅     | Required-presence validated.                                                                                    |
| `name`                     | ✅     | The map's accessible name.                                                                                      |
| `domain`                   | ✅     | Correctly ignored for rendering and never used to reject; surfaced on `RenderMap.domain` as a hint only.        |
| `locale`                   | ✅     | Resolves localized labels; overridable via `[locale]`. Drives RTL when `[rtl]="'auto'"`.                        |
| `priceTiers`               | ✅     | Resolved, validated, rendered in the legend and the selection total.                                            |
| `metadata`                 | ⚠️     | Preserved on the input types and reachable via `RenderSeat.source`, but not surfaced as its own field.          |

## §4.1 Section / §4.2 RowMeta

| Feature                                | Status | Notes                                                                                                                      |
| -------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `seats` as a flat list                 | ✅     | Grouped into render rows by `Seat.row`; seats never live inside rows.                                                      |
| `rows` (RowMeta) labels, `index`       | ✅     | Row naming and ordering. A free-text `row` with no `RowMeta` also works.                                                   |
| `rows` as a complete registry (§4.2)   | ✅     | Where `rows` is present the section's rows come from it, not from the seats that reference one.                            |
| **§4.2.1** row order                   | ✅     | Indexed rows first ascending, then unindexed in declaration order; `index` treated as a key, never as a position.          |
| **§4.2.2** empty rows                  | ✅     | A row no seat references is materialized, marked `RenderRow.empty`, and reserves a full row of vertical space in a grid.   |
| `directions` (§4.10)                   | ✅     | Localized onto `RenderSection.directions`. Informational: never validated against, never read for layout.                  |
| `Section.index` ordering               | ✅     |                                                                                                                            |
| **Sections as render units**           | ✅     | Each section is its own `<svg>` with its own `viewBox` and layout mode, and a real `<h3>` heading it is `aria-labelledby`. |
| Per-section `layout` / `aspectRatio`   | ✅     | Resolved per section. A freeform orchestra and a grid balcony coexist in one map.                                          |
| Localized `Section.label`              | ✅     | BCP-47 chain resolution.                                                                                                   |
| Section subsetting / overrides         | ✅     | `[sectionIds]` and `[sectionOverrides]`.                                                                                   |
| `Section.metadata`, `RowMeta.metadata` | ⚠️     | Reachable through `RenderSection.source`, not surfaced separately.                                                         |

## §4.3 Seat

| Field                             | Status | Notes                                                                                                                          |
| --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`, `label`, `row`              | ✅     | `label` defaults to `id`. Seat ids are checked for global uniqueness.                                                          |
| `col` (grid)                      | ✅     | Places the seat, and orders it for keyboard navigation.                                                                        |
| `x` / `y` (freeform)              | ✅     | Percentage coordinates mapped onto the section viewBox.                                                                        |
| `rotation`                        | ✅     | SVG rotation about the seat center.                                                                                            |
| `type`                            | ✅     | Validated, resolved to the full `SeatType`, and **drives the seat's colour** via `SeatType.color`.                             |
| `priceTier` / `price`             | ✅     | Resolved per §4.9 and displayed — in the legend, the announcement and the selection total.                                     |
| `companions`                      | ✅     | Validated for symmetry **and enforced in booking**: the transitive closure selects and deselects as one unit.                  |
| `attributes`                      | ✅     | Carried on `RenderSeat` and announced. Never affects price or fill (§4.3.3).                                                   |
| **`accessibility`** (§4.3.4)      | ✅     | Typed, validated, announced in full, and `wheelchairAccessible` marks the seat visually.                                       |
| `metadata`                        | ⚠️     | Reachable via `RenderSeat.source`.                                                                                             |
| **§4.3.1** positioning            | ✅     | A seat with neither `col` nor `x`+`y` is rejected. Where both are present, `x`/`y` wins for placement and `col` for adjacency. |
| **§4.3.1** logical adjacency      | ✅     | `col` orders arrow-key and screen-reader traversal, including in `mixed` sections.                                             |
| **§4.3.2** no filler objects      | ✅     | A skipped column is empty space. No spacer nodes are synthesized.                                                              |
| **§4.3.3** `type` vs `attributes` | ✅     | Attributes influence neither price nor colour.                                                                                 |

## §4.4 Element

| Feature                             | Status | Notes                                                                                                                                                                                                                |
| ----------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering elements                  | ✅     | In **every** layout mode. Grid-addressed elements place in the cell grid.                                                                                                                                            |
| `x`/`y`/`width`/`height`/`rotation` | ✅     | Percentages in freeform; `width`/`height` are cell spans in grid mode.                                                                                                                                               |
| `row` / `col` positioning           | ✅     |                                                                                                                                                                                                                      |
| `label`                             | ✅     | Drawn centered, except on kinds that read better unlabelled.                                                                                                                                                         |
| `kind`                              | ✅     | Drives the shape: screen (arc), stage, exit (accent), lavatory/galley/table, aisle/gap (dashed). Unknown kinds get a labelled rectangle.                                                                             |
| `id`                                | ✅     | Preserved on `RenderElement`.                                                                                                                                                                                        |
| Validation                          | ✅     | `id` and `kind` required; duplicate ids rejected; cross-mode placement, invalid spans and overrunning row spans rejected. An element positioned no way at all is a warning — §4.4 does not require one to be placed. |

## §4.5 Positioning modes

| Feature                                         | Status | Notes                                                                                      |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| `grid` — every seat has `col`, none has `x`/`y` | ✅     | Both halves enforced, including "`col` must be explicit, never inferred from array order". |
| `freeform` — every seat has `x`+`y`, none `col` | ✅     | Enforced. A free-text `row` is permitted as a label.                                       |
| `mixed` — every seat has `col` **and** `x`+`y`  | ✅     | Enforced. Laid out from `x`/`y`, navigated by `col`.                                       |
| Inference when `layout` is omitted              | ✅     | All-`col` ⇒ grid; all-`x`+`y` ⇒ freeform.                                                  |
| **Rejecting an inconsistent section**           | ✅     | `section-layout-inconsistent`, naming the offending seat. §7 requires this at v1.0.        |
| `aspectRatio` undistorted canvas                | ✅     | The section's viewBox _is_ its content box, so percentages map linearly.                   |
| Intrinsic sizing                                | ✅     | A section is sized from its own extents, not stretched into a fixed canvas.                |

## §4.6 Referential integrity

| Rule                                                | Status                                      |
| --------------------------------------------------- | ------------------------------------------- |
| `Seat.type` resolves in `legend`                    | ✅                                          |
| `Seat.priceTier` resolves in `priceTiers`           | ✅                                          |
| `Seat.row` resolves in `Section.rows` when declared | ✅                                          |
| `Element.row` resolves the same way                 | ✅ `element-row-unresolved`.                |
| Element span stays inside the section's rows        | ✅ `element-row-span-overrun`.              |
| `Seat.companions[]` resolve within the same section | ✅                                          |
| `companions` fully symmetric                        | ✅                                          |
| Errors identify the failing rule and id             | ✅ plus a `severity` and a document `path`. |
| Seat / section / element id uniqueness              | ✅                                          |

## §4.7–§4.9 Seat types and pricing

| Feature                   | Status | Notes                                                                                             |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| Price-resolution order    | ✅     | `price` → `priceTier` → `type.defaultPriceTier` → unpriced.                                       |
| One-currency-per-map rule | ✅     | Validated across seats and tiers.                                                                 |
| Money in minor units      | ✅     | `formatMoney` reads the currency's exponent from `Intl`, so JPY (0) and KWD (3) render correctly. |
| **Displaying price**      | ✅     | In the legend, the accessible name, and `summarizeSelection`.                                     |
| `SeatType.label`          | ✅     | Localized, rendered in the legend, announced per seat.                                            |
| `SeatType.color`          | ✅     | Applied to available seats, with a contrast-correct label colour. Availability outranks it.       |

## §5 State, deltas, sessions

| Feature                                       | Status | Notes                                                                                                                                           |
| --------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Merge by `Seat.id`                            | ✅     |                                                                                                                                                 |
| Sparse rule (absent ⇒ available)              | ✅     |                                                                                                                                                 |
| `available`/`booked`/`held`/`blocked`         | ✅     | Four distinct render states; only `available` is selectable by default, and the set is configurable.                                            |
| Exactly one of `sessionId`/`mapId`            | ✅     | Validated.                                                                                                                                      |
| `holdExpires`                                 | ✅     | Announced as a clock time, and `[expireHolds]` reverts a lapsed hold on a ticker.                                                               |
| **§5.1.1** RFC 3339 timestamps                | ✅     | Every timestamp is checked against the RFC 3339 profile, calendar included. An ISO 8601 form the profile excludes is rejected.                  |
| **§5.2** delta application                    | ✅     | Ordered by `updatedAt`; stale, duplicate and out-of-scope deltas discarded.                                                                     |
| **§5.2** gap detection                        | ⚠️     | Detected when the transport supplies a monotonic sequence. `updatedAt` alone cannot distinguish a lost message from a quiet period — see below. |
| Delta transport                               | ❌     | No WebSocket/SSE layer, by design. The spec defines a format, not a transport (§9).                                                             |
| **§5.3** sessions                             | ✅     | `validateDocumentSet` checks the map/session/state joins.                                                                                       |
| `KerusiState.metadata`, `SeatStatus.metadata` | ⚠️     | Carried on the input types; not surfaced on the render model.                                                                                   |

**On gap detection.** §5.2 requires `updatedAt` to be strictly increasing, not
contiguous. Two deltas an hour apart are indistinguishable from two deltas with
a lost message between them, so no consumer can detect a gap from `updatedAt`
alone. `KerusiStateStore` therefore detects gaps only when the transport
supplies a sequence — `metadata.seq` by default, or an injected `sequenceOf`
reader — and applies a gapped delta anyway, so the map degrades rather than
freezes while the consumer re-fetches, per the spec's "SHOULD discard and
re-fetch".

## §7 Conformance / §8 Interchange

| Requirement                                         | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merge state by `Seat.id`                            | ✅     |                                                                                                                                                                                                                                                                                                                                                                                                               |
| Enforce §4.6 incl. companion symmetry               | ✅     |                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Enforce `Section.layout` consistency**            | ✅     | Required of validators at v1.0, and enforced.                                                                                                                                                                                                                                                                                                                                                                 |
| **Materialize every declared row (§4.2.2)**         | ✅     | Empty rows included, in §4.2.1 order.                                                                                                                                                                                                                                                                                                                                                                         |
| **Enforce §4.4.1 element positioning and spans**    | ✅     | Mode binding, span integrality, and row-span bounds.                                                                                                                                                                                                                                                                                                                                                          |
| Apply §4.9 price order                              | ✅     |                                                                                                                                                                                                                                                                                                                                                                                                               |
| Ignore unrecognized members                         | ✅     | Nothing is rejected for an unknown member, and a future `1.x` minor is accepted.                                                                                                                                                                                                                                                                                                                              |
| Producer conformance                                | n/a    | This library consumes documents; it does not emit them.                                                                                                                                                                                                                                                                                                                                                       |
| Published JSON Schema (§8)                          | ❌     | None shipped. Validation is the hand-written TypeScript validator, which does enforce every MUST-level rule of §7. A handful of producer-side shape constraints — a currency's letter case, a price's integrality, the `aspectRatio` pattern, the status enum — belong to the schemas published with the spec and are not duplicated here; vendor those alongside when a producer-side gate is what you need. |
| `.kerusi.json` / `application/vnd.kerusi+json` (§8) | ❌     | No loader or media-type handling — callers supply already-parsed objects.                                                                                                                                                                                                                                                                                                                                     |
| Version negotiation                                 | ✅     | The `kerusi` member's value is checked, accepting `1.x` and rejecting other majors.                                                                                                                                                                                                                                                                                                                           |

## Accessibility and rendering concerns

These are not spec requirements — the standard is renderer-agnostic — but §4.3.1
names screen-reader ordering as a purpose of `col`, and §4.3.4 exists to be
surfaced.

| Feature                      | Status | Notes                                                                                                          |
| ---------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| Keyboard navigation          | ✅     | Per-section roving tabindex; arrows follow `col`; Home/End/PageUp/PageDown/Enter/Space/Escape.                 |
| Screen-reader announcement   | ✅     | Position, type, price, status, hold expiry, every accessibility property, attributes.                          |
| Live region                  | ✅     | Announces the running selection and the reason a seat could not be taken.                                      |
| Right-to-left                | ✅     | Derived from the locale; mirrors layout and arrow direction, leaving `col` order intact.                       |
| Focus visibility             | ✅     | A themed `:focus-visible` ring that follows a rotated seat.                                                    |
| Reduced motion               | ✅     | Transitions disabled under `prefers-reduced-motion`.                                                           |
| Multi-leg / multi-day (§5.4) | ❌     | Out of scope. The spec scopes itself to one configuration at a time and takes no position on correlating them. |

---

## What is left

1. **A published JSON Schema (§8).** The TypeScript validator enforces every
   MUST-level rule, but a schema would let non-TypeScript producers validate.
2. **Loader and media-type conventions (§8).** `.kerusi.json` and
   `application/vnd.kerusi+json` have no handling; callers parse their own JSON.
3. **`metadata` on the render model.** It survives on `*.source`, but a
   first-class field would save consumers a hop.
4. **Transport.** Deliberately absent — the spec defines a data format, and a
   renderer should not own the socket.
