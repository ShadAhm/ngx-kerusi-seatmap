import type { RenderMap } from '@kerusiweb/core';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface RovingFocus {
  /** The seat holding each section's tab stop, keyed by section id. */
  focusedSeatIds: Readonly<Record<string, string>>;
  /** Records the tab stop without moving DOM focus — for a focus that already happened. */
  setFocusedSeat(sectionId: string, seatId: string): void;
  /** Moves the tab stop and the DOM focus that follows it. */
  moveFocusTo(sectionId: string, seatId: string): void;
  /** Focuses a seat wherever it is, if it is currently rendered. */
  focusSeat(seatId: string): void;
  /** Ref callback each seat `<g>` registers itself through. */
  registerSeat(seatId: string, node: SVGGElement | null): void;
}

/**
 * The roving tab stop, held per section rather than per map.
 *
 * Arrow keys never cross a section boundary, so a single map-wide tab stop
 * would leave every section after the first unreachable by keyboard. Tab moves
 * between sections, arrows move within.
 *
 * Seats register their DOM node here as they mount, which is what replaces the
 * Angular binding's `querySelectorAll` scan: seat ids come from the document,
 * so they cannot be interpolated into a selector unescaped, and `CSS.escape` is
 * absent in jsdom and under SSR. A ref map has neither problem.
 */
export function useRovingFocus(renderMap: RenderMap): RovingFocus {
  const [focusedSeatIds, setFocusedSeatIds] = useState<Readonly<Record<string, string>>>({});
  const nodes = useRef(new Map<string, SVGGElement>());
  /** Set when a keyboard move asks for focus, consumed after the commit. */
  const pendingFocus = useRef<string | null>(null);

  // Keep every section's tab stop pointing at a seat that still exists.
  useEffect(() => {
    setFocusedSeatIds((current) => {
      const next: Record<string, string> = {};
      let changed = Object.keys(current).length !== renderMap.sections.length;

      for (const section of renderMap.sections) {
        const held = current[section.id];
        const valid = held && section.seats.some((seat) => seat.id === held);
        const resolved = valid ? held : section.seats[0]?.id;
        if (resolved) {
          next[section.id] = resolved;
          changed ||= resolved !== held;
        }
      }

      return changed ? next : current;
    });
  }, [renderMap]);

  const registerSeat = useCallback((seatId: string, node: SVGGElement | null) => {
    if (node) {
      nodes.current.set(seatId, node);
    } else {
      nodes.current.delete(seatId);
    }
  }, []);

  const focusSeat = useCallback((seatId: string) => {
    nodes.current.get(seatId)?.focus?.();
  }, []);

  const setFocusedSeat = useCallback((sectionId: string, seatId: string) => {
    setFocusedSeatIds((all) => (all[sectionId] === seatId ? all : { ...all, [sectionId]: seatId }));
  }, []);

  const moveFocusTo = useCallback(
    (sectionId: string, seatId: string) => {
      // The target's `tabindex` only becomes 0 on the next commit, so defer the
      // focus until then — focusing a `tabindex="-1"` node works, but leaves
      // the tab stop and the focus ring momentarily disagreeing.
      pendingFocus.current = seatId;
      setFocusedSeat(sectionId, seatId);
    },
    [setFocusedSeat],
  );

  useEffect(() => {
    const target = pendingFocus.current;
    if (target !== null) {
      pendingFocus.current = null;
      nodes.current.get(target)?.focus?.();
    }
  }, [focusedSeatIds]);

  return { focusedSeatIds, setFocusedSeat, moveFocusTo, focusSeat, registerSeat };
}
