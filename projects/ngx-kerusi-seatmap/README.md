# ngx-kerusi-seatmap

An Angular seat map that renders [Kerusi](https://github.com/ShadAhm/kerusi)
documents as interactive, accessible inline SVG.

```bash
npm install ngx-kerusi-seatmap
```

Requires Angular 22+. Standalone, signal-based, zoneless-friendly, no runtime
dependencies beyond `tslib`.

---

## `<kerusi-seatmap>`

```ts
import { KerusiSeatmapComponent } from 'ngx-kerusi-seatmap';

@Component({ imports: [KerusiSeatmapComponent], /* ... */ })
```

```html
<kerusi-seatmap
  [map]="map"
  [state]="state"
  [(selection)]="picked"
  [showLegend]="true"
  (seatDisallowed)="explain($event)"
/>
```

### Inputs

**Documents**

| Input     | Type            | Default    |                                                                             |
| --------- | --------------- | ---------- | --------------------------------------------------------------------------- |
| `map`     | `KerusiMap`     | _required_ | The static venue layout.                                                    |
| `state`   | `KerusiState`   | —          | Live availability. Merged by `Seat.id`; an absent seat is available (§5.1). |
| `session` | `KerusiSession` | —          | The optional map↔event join (§5.3). Validated against the map and state.    |

**Selection**

| Input                | Type                            | Default         |                                                                                 |
| -------------------- | ------------------------------- | --------------- | ------------------------------------------------------------------------------- |
| `selection`          | `readonly string[]`             | `[]`            | Selected seat ids. Two-way — `[(selection)]` — or read-only with `[selection]`. |
| `selectableStatuses` | `SeatRenderStatus[]`            | `['available']` | Which statuses a seat may be picked in.                                         |
| `companionMode`      | `'auto' \| 'independent'`       | `'auto'`        | `auto` selects a seat's whole companion closure together (§4.6).                |
| `maxSelection`       | `number`                        | —               | Cap on selected seats. Counts a companion closure as its full size.             |
| `seatSelectable`     | `(seat: RenderSeat) => boolean` | —               | A final say, applied after the status test.                                     |
| `interactive`        | `boolean`                       | `true`          | `false` renders read-only.                                                      |

**Appearance**

| Input                             | Type                  | Default          |                                                                                                                                 |
| --------------------------------- | --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `colors`                          | `KerusiSeatmapColors` | theme defaults   | Per-status fills, element tones, focus ring, backdrop. See [Theming](#theming) for the CSS custom properties.                   |
| `typeColors`                      | `boolean`             | `true`           | Let an available seat take its `SeatType.color` (§4.7).                                                                         |
| `seatSize`                        | `number`              | `28`             | Grid cell edge, in viewBox units.                                                                                               |
| `seatGap`                         | `number`              | `6`              | Gap between grid cells.                                                                                                         |
| `freeformBasis`                   | `number`              | `1000`           | Freeform viewBox width; height follows the aspect ratio.                                                                        |
| `unitScale`                       | `number`              | `1`              | CSS pixels per viewBox unit. Caps each section at its natural size so a narrow section and a wide one draw seats the same size. |
| `showSectionLabels`               | `boolean`             | `true`           |                                                                                                                                 |
| `showLegend` / `showLegendPrices` | `boolean`             | `false` / `true` |                                                                                                                                 |

**Sections**

| Input              | Type                                   |                                                                     |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------- |
| `sectionIds`       | `readonly string[]`                    | Render only these, in this order. Default: all, by `Section.index`. |
| `sectionOverrides` | `Record<string, SectionRenderOptions>` | Per-section `hidden`, `aspectRatio`, `seatSize`, `label`.           |

**Localization, validation, lifecycle**

| Input              | Type                            | Default                      |                                                                        |
| ------------------ | ------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `locale`           | `string`                        | `KerusiMap.locale` ?? `'en'` | BCP-47. Resolves `Section.label` / `SeatType.label` locale maps.       |
| `rtl`              | `boolean \| 'auto'`             | `'auto'`                     | Mirrors layout and arrow direction. `auto` derives it from the locale. |
| `ariaStrings`      | `SeatAriaStrings`               | English                      | Every announced phrase, for translation.                               |
| `validate`         | `'collect' \| 'throw' \| 'off'` | `'collect'`                  | `collect` reports through `validationIssues` and renders anyway.       |
| `expireHolds`      | `boolean`                       | `false`                      | Revert a lapsed `holdExpires` to available on a ticker.                |
| `expiryIntervalMs` | `number`                        | `1000`                       |                                                                        |

### Outputs

| Output                        | Payload                      |                                                                                                        |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `selectionChange`             | `readonly string[]`          | From the `selection` model.                                                                            |
| `seatSelect` / `seatDeselect` | `SeatInteraction`            | The `RenderSeat`, the resulting selection, and every seat that changed (companions included).          |
| `seatDisallowed`              | `SeatDisallowed`             | `reason` is `booked`, `held`, `blocked`, `not-selectable`, `max-selection` or `companion-unavailable`. |
| `seatFocus`                   | `RenderSeat`                 |                                                                                                        |
| `validationIssues`            | `readonly KerusiViolation[]` | Emitted whenever the documents change.                                                                 |

### The seat glyph

**Colour means seat type; shape means status.** A seat's fill is always its
`SeatType.color`, or the theme's `availableBg` when the type has none — it
does not change when the seat is held or booked. Overloading fill with both
type and status hid the type colour on exactly the seats a busy map has most
of; see the doc comment on `seatFill` for the full argument. `selected` is the
one deliberate exception: it still owns the seat's colour outright, so your own picks
are never ambiguous, and a purple fill on its own would in any case fail WCAG
1.4.1 (Use of Colour) for anyone who cannot distinguish it — hence the shape
cues below.

The seat body itself carries orientation: square-ish at the front, tapered at
the back, so which way a seat faces is legible from its outline alone.
`Seat.rotation` turns the whole group, and the taper turns with it — no
separate frame is drawn on top. This is what makes a fanned lecture theatre or
a stadium stand read at a glance. The seat number counter-rotates and stays
upright regardless.

Status is read from two marks layered over the body, never from its colour:

| State     | Fill                                           | Wash       | Occupant figure                                      |
| --------- | ---------------------------------------------- | ---------- | ---------------------------------------------------- |
| Available | type colour                                    | —          | —                                                    |
| Selected  | `selectedBg` **frame** + `selectedFg` **core** | —          | solid, tinted `selectedBg`                           |
| Held      | type colour                                    | `heldBg`   | **hollow**, stroked `heldFg` — a hold is provisional |
| Booked    | type colour                                    | `bookedBg` | solid, tinted `bookedFg` — settled, someone else's   |
| Blocked   | `blockedBg`                                    | —          | — (withheld by the venue; no one is there)           |

Solid vs. hollow is the real distinction — settled vs. still in progress — and
every figure leans with the seat rather than staying upright, so it doubles as
an orientation cue too.

Selection is the only state drawn from **two** tones rather than one, and that
is deliberate. `selectedBg` frames the seat; `selectedFg` fills a core inside
that frame and is what the number and the figure are read against. Because the
treatment always holds a light tone and a dark one at once, one of the two
separates from the page whichever way you have themed it — so the library never
has to detect a colour scheme, and there is no `prefers-color-scheme` default to
fight with your own. An earlier revision had this inverted, a near-white rim
around a mid-purple middle, which put the low-contrast tone on the outside
boundary: a selected seat dissolved into a light page and sank into a dark one.

Both tokens therefore carry real visual weight — override them as a pair. Swapping
the two gives the inverse treatment, a light frame around a dark core, which works
just as well.

A theme that overrides `heldFg`/`bookedFg` owns the contrast of that mark
against whatever `SeatType.color` the document supplies — the library cannot
know the pairing in advance, since the figure tint is fixed while the type
colour underneath it is not. The shipped defaults are light marks over a
darkened wash, which reads across the tier colours in the demo fixtures.

The geometry is exported, if you want to draw a matching seat elsewhere:
`seatBodyPath`, `seatSelectedFrame`, `seatOccupantPath`, `seatOccupantStroke`.
(`seatRingStroke` is the old name for `seatSelectedFrame` and still resolves to
it.) A seat is always square, which makes `seatBodyPath`'s `inset` an exact
scaled copy about the centre — that is how the selected core is derived, and why
marks drawn to the core's box keep every clearance they had against the body.

### Theming

Colors resolve through three tiers, highest first:

1. A `--kerusi-*` custom property in **your** stylesheet.
2. The **`[colors]` input** — a partial `KerusiSeatmapColors`, merged over the defaults.
3. The library default.

The library never writes a `--kerusi-*` property onto its own host, which is
what keeps that order true: every fill is emitted as
`var(--kerusi-selected-bg, <the resolved input value>)`. Use whichever tier
fits — the input for values known at build time, CSS for anything that has to
respond to a media query or a theme class.

```css
kerusi-seatmap {
  --kerusi-selected-bg: #8b6ad6;
  --kerusi-available-bg: #2f6b45;
}

@media (prefers-color-scheme: dark) {
  kerusi-seatmap {
    --kerusi-element-bg: #232a36;
  }
}
```

Every key of `KerusiSeatmapColors` has a property, kebab-cased:

| Input key                             | Custom property                                             |
| ------------------------------------- | ----------------------------------------------------------- |
| `availableBg` / `availableFg`         | `--kerusi-available-bg` / `--kerusi-available-fg`           |
| `selectedBg` / `selectedFg`           | `--kerusi-selected-bg` / `--kerusi-selected-fg`             |
| `heldBg` / `heldFg`                   | `--kerusi-held-bg` / `--kerusi-held-fg`                     |
| `bookedBg` / `bookedFg`               | `--kerusi-booked-bg` / `--kerusi-booked-fg`                 |
| `blockedBg` / `blockedFg`             | `--kerusi-blocked-bg` / `--kerusi-blocked-fg`               |
| `elementBg` / `elementFg`             | `--kerusi-element-bg` / `--kerusi-element-fg`               |
| `elementAccentBg` / `elementAccentFg` | `--kerusi-element-accent-bg` / `--kerusi-element-accent-fg` |
| `elementMutedBg` / `elementMutedFg`   | `--kerusi-element-muted-bg` / `--kerusi-element-muted-fg`   |
| `focusRing`                           | `--kerusi-focus-ring`                                       |
| `backdrop`                            | `--kerusi-backdrop`                                         |

A `SeatType.color` from the document is deliberately **not** themable — it is
the map's own value under §4.7. Turn it off wholesale with
`[typeColors]="false"` if you want the theme to own every fill.

Overriding `selectedBg` does not cost you the selected cue: the core and the
figure are shape, not color. Do set `selectedFg` alongside it, though — it is the
core's fill, so it is most of a selected seat's area rather than just a label
tint, and the two are read against each other. `heldBg`/`bookedBg` are the wash
drawn over a taken seat's type colour, not the seat's own fill — see
[The seat glyph](#the-seat-glyph) for the full state table.

If you need the pre-1.1 flat selected seat back, the core is its own node:

```css
kerusi-seatmap .kerusi-seat__core {
  display: none;
}
/* Without the core, these would be selectedBg on selectedBg. */
kerusi-seatmap .kerusi-seat--selected .kerusi-seat__label,
kerusi-seatmap .kerusi-seat--selected .kerusi-seat__occupant,
kerusi-seatmap .kerusi-seat--selected .kerusi-seat__wheelchair {
  fill: var(--kerusi-selected-fg, #f3ecff);
  stroke: none;
}
```

For anything the palette does not cover, each seat group carries class hooks:

| Class                                                           |                                            |
| --------------------------------------------------------------- | ------------------------------------------ |
| `.kerusi-seat`                                                  | Every seat group.                          |
| `.kerusi-seat--available` / `--held` / `--booked` / `--blocked` | Its `SeatStatus`.                          |
| `.kerusi-seat--selected`                                        | Currently picked.                          |
| `.kerusi-seat--unselectable`                                    | Fails the status test or `seatSelectable`. |
| `.kerusi-seat--wheelchair`                                      | `accessibility.wheelchairAccessible`.      |
| `.kerusi-seat--companion`                                       | Has companions (§4.6).                     |

Inside a seat: `.kerusi-seat__box`, `__wash`, `__core`, `__occupant`
(`__occupant--selected` / `--held` / `--booked`), `__label`, `__wheelchair`.

### Keyboard

Tab moves between sections; each section keeps its own tab stop. Within a
section, arrow keys follow the §4.3.1 `col` order — so an aisle, which is a
column no seat occupies, is stepped across rather than into.

| Key                      |                                    |
| ------------------------ | ---------------------------------- |
| `←` `→`                  | Previous / next seat in the row    |
| `↑` `↓`                  | Nearest column in the adjacent row |
| `Home` / `End`           | First / last seat of the row       |
| `Ctrl+Home` / `Ctrl+End` | First / last seat of the section   |
| `PageUp` / `PageDown`    | First / last seat of the section   |
| `Enter` / `Space`        | Toggle                             |
| `Escape`                 | Clear the selection                |

Each seat is a `role="button"` announcing its position, type, price, status,
every `Seat.accessibility` property and its attributes. A polite live region
reports the running selection and any disallowed reason.

---

## `<kerusi-legend>`

Rendered inline by `[showLegend]="true"`, or placed anywhere yourself:

```html
<kerusi-legend [legend]="model.legend" [locale]="'ms'" [showPrices]="true" />
```

It resolves swatches through the same path as the seat fills, so the two cannot
drift apart. Every availability swatch — not just **Selected** — draws the
seat glyph itself (wash, ring, occupant, as it applies) rather than a flat
colour, because shape is the cue the map uses for status.

---

## Working with the format directly

Everything under `kerusi/` and `render/` is pure — no Angular import — so it can
run in a test, a build step or on a server.

```ts
import {
  buildRenderModel, // KerusiMap + KerusiState -> the resolved render model
  checkKerusiMap, // every violation, no throw
  validateKerusiMap, // throws on the first error
  validateDocumentSet, // map / session / state joins
  resolveSeatPrice, // the §4.9 precedence order
  resolveLocalizedText, // string | Record<string, string> -> string
  formatMoney, // minor units -> "RM 45.00", "¥1,200", "KD 12.500"
  summarizeSelection, // seats, total, unpriced count
  computeSectionLayout, // placed geometry for one section
  buildNavigationGraph, // per-seat keyboard neighbours
} from 'ngx-kerusi-seatmap';
```

### Validation

`checkKerusiMap` returns every violation in document order without throwing;
`validateKerusiMap` throws a `KerusiValidationError` carrying the first error
and the full list. Each violation has a stable `rule` slug, a `severity`
(`error` blocks conformance, `warning` is advisory) and a document `path`.

```ts
for (const v of checkKerusiMap(map)) {
  console.warn(`${v.severity} ${v.rule} at ${v.path}: ${v.message}`);
}
```

### Live availability

```ts
import { KerusiStateStore } from 'ngx-kerusi-seatmap';

const store = new KerusiStateStore(initialState);
socket.onmessage = (e) => {
  const result = store.apply(JSON.parse(e.data));
  if (result.outcome === 'gap') refetch(); // store.needsRefetch() is now true
};
const stop = store.startExpiryTicker();
```

Deltas that are stale, duplicate or scoped to another session are discarded.

> **Gap detection needs a sequence.** §5.2 requires `updatedAt` to be strictly
> increasing but not contiguous, so it cannot by itself distinguish "a delta was
> lost" from "nothing happened for a while". The store detects gaps when the
> transport supplies a monotonic sequence — `metadata.seq` by default, or your
> own `sequenceOf` reader. A gapped delta is still applied, so the map degrades
> rather than freezes while you re-fetch.

---

MIT © Arshad Ahmad
