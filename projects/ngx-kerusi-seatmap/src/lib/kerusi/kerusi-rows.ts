import { RowMeta, Section } from './kerusi-map.model';

/**
 * The §4.2.1 row order, shared by the validator and the render model so both
 * derive the same order from the same document — which is exactly what §4.2.1
 * requires of two conformant consumers.
 */

/**
 * Orders a section's declared rows:
 *
 *  1. rows declaring `index` first, ascending;
 *  2. rows with no `index` after them, in declaration order;
 *  3. rows sharing an `index` in declaration order relative to one another.
 *
 * `index` is an ordering key, not a position: rows at 0 and 11 with nothing
 * between them are adjacent. Vertical space comes from declaring a row
 * (§4.2.2), never from a numeric hole here.
 */
export function orderRowMeta(rows: readonly RowMeta[]): RowMeta[] {
  return [...rows]
    .map((row, order) => ({ row, order }))
    .sort((a, b) => rowOrderKey(a.row, a.order) - rowOrderKey(b.row, b.order) || a.order - b.order)
    .map((entry) => entry.row);
}

/**
 * Each declared row's position in the §4.2.1 order, by id. Empty for a section
 * that declares no `rows`, where a seat's `row` is opaque free text (§4.6) and
 * there is no registry to resolve against.
 */
export function rowOrderIndexes(section: Section): Map<string, number> {
  const ordered = orderRowMeta(section.rows ?? []);
  return new Map(ordered.map((row, index) => [row.id, index]));
}

/** Sorts indexed rows ahead of unindexed ones, the latter in declaration order. */
function rowOrderKey(row: RowMeta, order: number): number {
  return row.index ?? Number.MAX_SAFE_INTEGER - 1_000_000 + order;
}
