# Rendering Kerusi documents

`ngx-kerusi-seatmap` consumes the [**Kerusi Seat Map & Availability
Format**](https://github.com/ShadAhm/kerusi) natively: a static `KerusiMap`
(layout, seat types, pricing) plus a live `KerusiState` (availability) go
straight into `<kerusi-seatmap>`.

Kerusi is a vendor-neutral, domain-agnostic JSON format — cinema, flight, bus,
theatre, stadium, train — and this page shows how each part of it turns into
something on screen. See the standard for the normative rules.

## The minimum

```ts
import { Component } from '@angular/core';
import { KerusiSeatmapComponent, type KerusiMap, type KerusiState } from 'ngx-kerusi-seatmap';

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
        // col 3 is omitted — that gap is the aisle (no filler seat, §4.3.2)
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
  seats: { '1A': { status: 'booked' } }, // everything else defaults to available
};

@Component({
  selector: 'app-bus',
  imports: [KerusiSeatmapComponent],
  template: `<kerusi-seatmap [map]="map" [state]="state" />`,
})
export class BusComponent {
  protected readonly map = map;
  protected readonly state = state;
}
```

That section declares no `layout`. Every seat has `col` and none has `x`/`y`, so
§4.5 infers `grid`.

## Positioning modes (§4.5)

`Section.layout` is a **strict, validated constraint**, not a hint. A section
that breaks it is invalid, and the library rejects it.

### `grid`

Every seat has `col`; no seat has `x` or `y`. `col` is required explicitly on
every seat — it is never inferred from array order, because `Section.seats` is
an unordered list.

```ts
{ id: 'cabin', layout: 'grid', seats: [
  { id: '12A', row: '12', col: 1, type: 'economy', attributes: ['window'] },
  { id: '12B', row: '12', col: 2, type: 'economy' },
  { id: '12C', row: '12', col: 3, type: 'economy', attributes: ['aisle'] },
  // col 4 is the aisle
  { id: '12D', row: '12', col: 5, type: 'economy', attributes: ['aisle'] },
]}
```

### `freeform`

Every seat has both `x` and `y`, as percentages of the section canvas; no seat
has `col`. `rotation` tilts a seat to follow a curve, and `aspectRatio` fixes
the canvas proportions so those percentages mean the same thing at any size.

```ts
{ id: 'house', layout: 'freeform', aspectRatio: '16:9', seats: [
  { id: 'A1', row: 'A', x: 20, y: 30, rotation: -8, type: 'standard' },
  { id: 'A2', row: 'A', x: 27, y: 28, rotation: -5, type: 'standard' },
]}
```

A `row` is still allowed here, purely as a label — it carries no positional
information, so it does not break the constraint, and the renderer uses it for
grouping and keyboard order.

### `mixed`

Every seat has `col` **and** both `x` and `y`. This is the only mode where a
seat may combine both. `x`/`y` places the seat; `col` remains its logical
adjacency ordinal, which is what arrow keys and screen readers follow (§4.3.1).

```ts
{ id: 'north-stand', layout: 'mixed', aspectRatio: '3:2', seats: [
  { id: 'N-1-1', row: 'N-1', col: 1, x: 34, y: 22, rotation: 0, type: 'main' },
  { id: 'N-1-2', row: 'N-1', col: 2, x: 38, y: 22, rotation: 0, type: 'main' },
]}
```

### Inference and rejection

Omit `layout` and it is inferred: all-`col`-no-coordinates is `grid`,
all-`x`-and-`y`-no-`col` is `freeform`. Anything else is rejected — there is no
inference for `mixed`, so a seat carrying all three must say so.

```ts
import { checkKerusiMap } from 'ngx-kerusi-seatmap';

checkKerusiMap(map);
// [{ rule: 'section-layout-grid', severity: 'error',
//    path: 'sections[0].seats[3]',
//    message: 'Seat "A4" is in grid section "main" but carries "x"/"y" ...' }]
```

## Sections are render units

Each `Section` gets its own `<svg>`, its own layout mode, its own aspect ratio
and its own heading. A venue can mix them freely:

```ts
sections: [
  { id: 'orchestra', index: 1, label: { en: 'Orchestra', ms: 'Orkestra' },
    layout: 'freeform', aspectRatio: '5:2', seats: [...] },
  { id: 'balcony', index: 2, label: { en: 'Balcony', ms: 'Balkoni' },
    layout: 'grid', seats: [...] },
]
```

Sections render in `Section.index` order. Restrict or reorder them with
`[sectionIds]`, and tune individual ones with `[sectionOverrides]`.

## Rows and vertical space (§4.2)

`Section.rows` is not a container — seats never live inside a row. But where a
section declares it, it is that section's **complete row registry**: the rows
come from it rather than from the seats that happen to reference one.

That is what makes an **empty row** work. A `RowMeta` no seat references is
still a row, occupies a slot, and reserves the vertical space one row of seats
would (§4.2.2). It is the row-axis counterpart to a skipped column: a grid
section opens the throw between a cinema screen and row A, or a cross-aisle
mid-section, by declaring rows for them.

```ts
{ id: 'stalls', layout: 'grid',
  rows: [
    { id: 'screen', index: 0 },       // no seats — the screen sits here
    { id: 'throw', index: 1 },        // no seats — the gap in front of row A
    { id: 'A', label: 'A', index: 2 },
    { id: 'B', label: 'B', index: 3 },
    { id: 'cross-aisle', index: 4 },  // no seats — a walkway
    { id: 'C', label: 'C', index: 5 },
  ],
  elements: [{ id: 'screen', kind: 'screen', label: 'SCREEN', row: 'screen' }],
  seats: [ /* rows A, B and C */ ],
}
```

`index` is an **ordering key, not a position**: rows numbered 0 and 11 with
nothing between them are adjacent, two rows and not twelve, so renumbering a
section reserves nothing. Rows without an `index` sort after those that have
one, in declaration order (§4.2.1). Every declared row reaches the render model
as a `RenderRow`, with `empty: true` on the seatless ones; keyboard navigation
steps over them.

With no `rows` at all, a seat's `row` is opaque free text and the section's rows
are exactly the ones its seats name, in first-appearance order.

## Elements (§4.4)

Non-bookable fixtures — screens, stages, exits, lavatories, gaps, tables. An
element is bound to its section's positioning mode exactly as a seat is
(§4.4.1), and `id` and `kind` are required.

```ts
elements: [
  // Freeform: x/y/width/height are percentages of the section canvas.
  { id: 'screen', kind: 'screen', label: 'SCREEN', x: 50, y: 7, width: 66, height: 4 },
  // Grid: row and col place it in the cell grid; width and height are cell
  // spans — positive integers, defaulting to 1.
  { id: 'lav', kind: 'lavatory', label: 'WC', row: '16', col: 7, width: 2 },
  // Omitting col spans the section's full column extent, the usual form for a
  // screen or a stage. height: 2 reaches into the row after this one.
  { id: 'stage', kind: 'stage', label: 'STAGE', row: 'stage-1', height: 2 },
];
```

A grid element carrying `x`/`y`, a freeform one carrying `col`, a fractional
span, or a row span reaching past the section's last row are all rejected —
`element-layout-mismatch`, `element-span-invalid`, `element-row-span-overrun`.

`kind` drives the shape: a `screen` draws as an arc, a `stage` as a raised
platform, an `exit` in the accent colour, an `aisle` or `gap` as a dashed
outline. An unrecognized kind draws as a labelled rectangle.

## Direction labels (§4.10)

`Section.directions` names what an addressing axis means in the physical
world — which end of a train a row is nearer, which compass direction a stand
faces:

```ts
directions: [{ axis: 'row', low: 'front of train', high: 'back of train' }];
```

Both ends may be a locale map, and both arrive localized on
`RenderSection.directions`. It is purely informational: no document is rejected
over it, and nothing here reads it to decide layout or which edge of the screen
an axis is drawn on — that stays a rendering decision.

## Seat types, pricing and the legend

`SeatType.color` is the standard's suggested render colour, and an available
seat takes it. Availability still outranks it — a booked seat renders as booked,
never in its type's colour.

Price resolves through the §4.9 order: `Seat.price`, then `Seat.priceTier`, then
`SeatType.defaultPriceTier`, then unpriced (a valid terminal state). Amounts are
minor units, and `formatMoney` reads the currency's exponent rather than
assuming two digits — so JPY and KWD come out right.

```ts
import { summarizeSelection, formatMoney, buildRenderModel } from 'ngx-kerusi-seatmap';

const model = buildRenderModel(map, state);
const { seats, total, unpriced } = summarizeSelection(model, selection());
formatMoney(total, 'ms-MY'); // "RM 104.00"
```

`[showLegend]="true"` renders a key from `KerusiMap.legend` and `priceTiers`.

## Companions (§4.6)

`companions` must be symmetric, and the library treats the transitive closure as
one unit: selecting a love seat takes its partner, deselecting either releases
both, `maxSelection` counts the pair, and a pair whose other half is sold is
refused with `reason: 'companion-unavailable'` rather than half-taken.

```ts
{ id: 'L1', row: 'L', x: 28, y: 90, type: 'sofa', companions: ['L2'] },
{ id: 'L2', row: 'L', x: 36, y: 89, type: 'sofa', companions: ['L1'] },
```

Set `[companionMode]="'independent'"` to handle the pairing yourself.

## Accessibility (§4.3.4)

`Seat.accessibility` is structured, not a free-text tag, and everything in it is
announced:

```ts
{
  id: '15C', row: '15', col: 3, type: 'accessible',
  attributes: ['aisle'],
  companions: ['15B'],
  accessibility: {
    wheelchairAccessible: true,
    transferArmrest: 'left',
    aisleChairCompatible: true,
    companionRequired: true,
  },
}
```

> "Row 15, seat C, Accessible, MYR 140.00, available, wheelchair accessible,
> transfer armrest left, aisle chair compatible, companion seat required, aisle."

Pair `companionRequired` with `companions` so the companion seat is actually
linked, not merely implied.

## Localization

`Section.label` and `SeatType.label` may be locale maps. Resolution walks the
BCP-47 chain — `ms-MY` → `ms` → the fallback locale → the first key — so a map
localized into languages you did not ask for still renders something.

```ts
legend: [{ id: 'standard', label: { en: 'Standard', 'ms-MY': 'Biasa' } }];
```

`[locale]` overrides `KerusiMap.locale`. `[rtl]` defaults to `auto` and derives
the direction from the resolved locale, mirroring the layout and the arrow keys
while leaving `col` order — and so reading order — untouched.

## Live availability (§5.1, §5.2)

A `KerusiState` is sparse: a seat absent from `seats` is available. Statuses are
`available`, `held` (with an optional `holdExpires`), `booked` and `blocked`;
all four render distinctly and only `available` is selectable by default.

For a push transport, `KerusiStateStore` applies `KerusiStateDelta` documents:

```ts
const store = new KerusiStateStore(initialState);
const result = store.apply(delta);
// 'applied' | 'stale' | 'duplicate' | 'gap' | 'scope-mismatch'
```

Set `[expireHolds]="true"` to have a lapsed hold revert to available on screen.

## Sessions (§5.3)

A `KerusiSession` joins a reusable map to a specific showtime, and a
`KerusiState` may reference it by `sessionId` instead of `mapId`. Pass it as
`[session]` and the library checks the joins actually resolve.

```ts
const session: KerusiSession = {
  kerusi: '1.0',
  id: 'hall-3-2026-08-19-1930',
  mapId: 'gsc-hall-3',
  label: 'Dune: Part Three — 7:30pm',
  startsAt: '2026-08-19T19:30:00+08:00',
};
```
