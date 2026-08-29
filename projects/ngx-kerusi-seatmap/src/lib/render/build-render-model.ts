import { KerusiMap, RowMeta, Seat, Section } from '../kerusi/kerusi-map.model';
import { KerusiState } from '../kerusi/kerusi-state.model';
import { resolveSectionLayoutMode, SectionLayoutMode } from '../kerusi/kerusi-layout-mode';
import { resolveLocalizedText, resolveMapLocale } from '../kerusi/kerusi-locale';
import { resolveSeatPrice, resolveTierPrice } from '../kerusi/kerusi-price';
import { orderRowMeta } from '../kerusi/kerusi-rows';
import {
  RenderDirection,
  RenderElement,
  RenderLegendEntry,
  RenderMap,
  RenderRow,
  RenderSeat,
  RenderSection,
  SeatRenderStatus,
} from './render-model';

/** The default section proportions when none is declared (§4.5). */
const DEFAULT_ASPECT_RATIO = '1:1';

/** Which statuses a seat may be picked in, unless the caller says otherwise. */
export const DEFAULT_SELECTABLE_STATUSES: readonly SeatRenderStatus[] = ['available'];

export interface BuildRenderModelOptions {
  /** Overrides `KerusiMap.locale` for label resolution. */
  locale?: string;
  /** Render only these sections, in this order. Default: all, by `Section.index`. */
  sectionIds?: readonly string[];
  /** Statuses in which a seat may be picked. Default: `['available']`. */
  selectableStatuses?: readonly SeatRenderStatus[];
  /** A final say on whether a seat is selectable, applied after the status test. */
  seatSelectable?: (seat: RenderSeat) => boolean;
}

/**
 * Builds the renderer's view of a `KerusiMap` with its `KerusiState` merged in.
 *
 * Everything the standard makes a consumer resolve happens here, once:
 *  - sections ordered by `Section.index`, and each given its own layout mode
 *    per §4.5 — this is what lets a grid balcony and a freeform orchestra
 *    coexist in one map;
 *  - every row a section declares materialized, empty rows included, in the
 *    §4.2.1 order, with seats grouped into them by `Seat.row` and ordered by
 *    `col` (grid, mixed) or `x` (freeform);
 *  - availability merged by `Seat.id`, honoring §5.1's sparse rule that an
 *    absent seat is available;
 *  - price resolved through the §4.9 precedence order;
 *  - `Section.label` and `SeatType.label` localized against the map's locale.
 *
 * It does NOT validate — call `validateKerusiMap` or `checkKerusiMap` first.
 * Given an invalid document it builds the best model it can rather than
 * throwing, so a caller in "collect" mode can render and report at once.
 */
export function buildRenderModel(
  map: KerusiMap,
  state?: KerusiState,
  options: BuildRenderModelOptions = {},
): RenderMap {
  const locale = resolveMapLocale(map, options.locale);
  const selectableStatuses = new Set(options.selectableStatuses ?? DEFAULT_SELECTABLE_STATUSES);
  const legendById = new Map((map.legend ?? []).map((t) => [t.id, t]));
  const seatsById = new Map<string, RenderSeat>();
  const typeCounts = new Map<string, number>();
  const currencies = new Set<string>();

  const sections = selectSections(map, options.sectionIds).map((section) =>
    buildSection(section, {
      map,
      state,
      locale,
      selectableStatuses,
      seatSelectable: options.seatSelectable,
      legendById,
      seatsById,
      typeCounts,
      currencies,
    }),
  );

  const legend: RenderLegendEntry[] = (map.legend ?? []).map((type) => {
    const price = resolveTierPrice(map, type.defaultPriceTier);
    return {
      id: type.id,
      label: resolveLocalizedText(type.label, locale) ?? type.id,
      color: type.color,
      defaultTier: map.priceTiers?.find((t) => t.id === type.defaultPriceTier),
      price,
      seatCount: typeCounts.get(type.id) ?? 0,
    };
  });

  return {
    id: map.id,
    name: map.name,
    locale,
    domain: map.domain,
    sections,
    legend,
    // §4.9 forbids mixing currencies, so the first is the map's.
    currency: [...currencies][0],
    seatsById,
  };
}

interface BuildContext {
  map: KerusiMap;
  state?: KerusiState;
  locale: string;
  selectableStatuses: ReadonlySet<SeatRenderStatus>;
  seatSelectable?: (seat: RenderSeat) => boolean;
  legendById: Map<string, KerusiMap['legend'][number]>;
  seatsById: Map<string, RenderSeat>;
  typeCounts: Map<string, number>;
  currencies: Set<string>;
}

function buildSection(section: Section, ctx: BuildContext): RenderSection {
  const layoutMode = resolveSectionLayoutMode(section);
  const rows = buildRows(section, layoutMode, ctx);

  return {
    id: section.id,
    label: resolveLocalizedText(section.label, ctx.locale),
    layoutMode,
    aspectRatio: section.aspectRatio ?? DEFAULT_ASPECT_RATIO,
    rows,
    seats: rows.flatMap((r) => r.seats),
    elements: buildElements(section, rows),
    directions: buildDirections(section, ctx.locale),
    source: section,
  };
}

/**
 * Localizes `Section.directions` (§4.10) and carries it through. Both ends of a
 * `Direction` may be a locale map, exactly as `Section.label` may be.
 *
 * Nothing downstream reads this — §4.10 forbids a renderer deciding layout or
 * screen placement from it. It exists so an application can print "front of
 * train" beside the axis the document says means that.
 */
function buildDirections(section: Section, locale: string): RenderDirection[] | undefined {
  if (!section.directions?.length) {
    return undefined;
  }
  return section.directions.map((direction) => ({
    axis: direction.axis,
    low: resolveLocalizedText(direction.low, locale) ?? '',
    high: resolveLocalizedText(direction.high, locale) ?? '',
  }));
}

/**
 * Materializes a section's rows and groups its flat seat list into them.
 *
 * `Section.rows` is not a container (§4.2) — seats never live inside a row — but
 * where it is present it *is* the section's complete row registry (§4.2.2), so
 * the rows come from it rather than from the seats that happen to reference
 * one. That is what makes an **empty row** real: a `RowMeta` no seat mentions
 * still takes a slot, and the grid layout reserves a row of vertical space for
 * it. Without that, a document could not open the throw between a cinema screen
 * and row A, because rows would exist only where seats did.
 *
 * With no registry, a seat's `row` is opaque free text (§4.6) and the rows are
 * exactly those the seats name, in first-appearance order — a document that
 * declares no row metadata still renders in the order its author wrote it.
 */
function buildRows(
  section: Section,
  layoutMode: SectionLayoutMode,
  ctx: BuildContext,
): RenderRow[] {
  const byRowKey = new Map<string, Seat[]>();
  const firstSeen = new Map<string, number>();

  (section.seats ?? []).forEach((seat, i) => {
    const key = seat.row ?? '';
    if (!byRowKey.has(key)) {
      byRowKey.set(key, []);
      firstSeen.set(key, i);
    }
    byRowKey.get(key)!.push(seat);
  });

  const registry = section.rows;
  const ordered: { key: string; meta?: RowMeta }[] = registry
    ? orderRowMeta(registry).map((meta) => ({ key: meta.id, meta }))
    : [...byRowKey.keys()]
        .sort((a, b) => firstSeen.get(a)! - firstSeen.get(b)!)
        .map((key) => ({ key }));

  if (registry) {
    // A seat naming a row the registry does not declare is a §4.6 violation the
    // validator reports. Render it anyway, after the declared rows — dropping
    // seats would hide the error rather than show it.
    const declared = new Set(registry.map((r: RowMeta) => r.id));
    for (const key of byRowKey.keys()) {
      if (!declared.has(key)) {
        ordered.push({ key });
      }
    }
  }

  return ordered.map(({ key, meta }, rowIndex) => {
    const seats = byRowKey.get(key) ?? [];
    const label = meta?.label ?? (key || undefined);
    const row: RenderRow = {
      id: key,
      label,
      index: rowIndex,
      seats: sortSeats(seats, layoutMode).map((seat) =>
        buildSeat(seat, section, { rowIndex, rowLabel: label }, ctx),
      ),
      empty: seats.length === 0,
    };
    return row;
  });
}

/**
 * Orders seats within a row. `col` is the adjacency ordinal in grid and mixed
 * sections — including mixed, where `x`/`y` places the seat but `col` is what
 * "the seat to the right" means (§4.3.1). Freeform rows have no columns, so
 * they order by `x`.
 */
function sortSeats(seats: readonly Seat[], layoutMode: SectionLayoutMode): Seat[] {
  const byCol = layoutMode !== 'freeform';
  return [...seats]
    .map((seat, order) => ({ seat, order }))
    .sort((a, b) => {
      const left = byCol ? a.seat.col : a.seat.x;
      const right = byCol ? b.seat.col : b.seat.x;
      if (left === undefined || right === undefined || left === right) {
        return (a.seat.y ?? 0) - (b.seat.y ?? 0) || a.order - b.order;
      }
      return left - right;
    })
    .map((entry) => entry.seat);
}

function buildSeat(
  seat: Seat,
  section: Section,
  row: { rowIndex: number; rowLabel?: string },
  ctx: BuildContext,
): RenderSeat {
  const type = ctx.legendById.get(seat.type) ?? { id: seat.type };
  const price = resolveSeatPrice(seat, ctx.map);
  if (price?.currency) {
    ctx.currencies.add(price.currency);
  }
  ctx.typeCounts.set(seat.type, (ctx.typeCounts.get(seat.type) ?? 0) + 1);

  // §5.1: a seat absent from the state document is available.
  const status = ctx.state?.seats?.[seat.id];

  const rendered: RenderSeat = {
    id: seat.id,
    sectionId: section.id,
    label: seat.label ?? seat.id,
    row: seat.row,
    rowLabel: row.rowLabel,
    rowIndex: row.rowIndex,
    col: seat.col,
    x: seat.x,
    y: seat.y,
    rotation: seat.rotation,
    type,
    typeLabel: resolveLocalizedText(type.label, ctx.locale) ?? type.id,
    typeColor: type.color,
    attributes: seat.attributes ?? [],
    accessibility: seat.accessibility,
    price,
    companions: seat.companions ?? [],
    status: status?.status ?? 'available',
    holdExpires: status?.holdExpires,
    selectable: false,
    source: seat,
  };

  rendered.selectable =
    ctx.selectableStatuses.has(rendered.status) && (ctx.seatSelectable?.(rendered) ?? true);

  ctx.seatsById.set(rendered.id, rendered);
  return rendered;
}

/**
 * Carries elements through with their `id` intact — the pre-1.0 adapter dropped
 * it, leaving the render model with no element identity. A grid-addressed
 * element gets its row's index so the layout can place it in the cell grid.
 */
function buildElements(section: Section, rows: readonly RenderRow[]): RenderElement[] {
  const rowIndexById = new Map(rows.map((r) => [r.id, r.index]));

  return (section.elements ?? []).map((element) => ({
    id: element.id,
    kind: element.kind,
    label: element.label,
    row: element.row,
    rowIndex: element.row !== undefined ? rowIndexById.get(element.row) : undefined,
    col: element.col,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation,
    source: element,
  }));
}

/** Sections in `Section.index` order, optionally filtered to an explicit set. */
function selectSections(map: KerusiMap, sectionIds?: readonly string[]): Section[] {
  const all = map.sections ?? [];

  if (sectionIds) {
    // An explicit list is also an explicit order — honor it verbatim.
    return sectionIds
      .map((id) => all.find((s) => s.id === id))
      .filter((s): s is Section => s !== undefined);
  }

  return [...all]
    .map((section, order) => ({ section, order }))
    .sort((a, b) => orderKey(a.section.index, a.order) - orderKey(b.section.index, b.order))
    .map((entry) => entry.section);
}

/**
 * A sort key that keeps entries without an explicit `index` in declaration
 * order, and after every entry that has one.
 */
function orderKey(index: number | undefined, fallbackOrder: number): number {
  return index ?? Number.MAX_SAFE_INTEGER - 1_000_000 + fallbackOrder;
}
