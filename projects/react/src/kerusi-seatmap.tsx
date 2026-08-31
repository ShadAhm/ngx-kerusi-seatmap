import {
  buildNavigationGraph,
  buildRenderModel,
  DEFAULT_SEAT_ARIA_STRINGS,
  disallowedAnnouncement,
  computeSectionLayout,
  errorsOf,
  expireHolds as expireHoldsIn,
  formatMoney,
  isRtlLocale,
  KerusiValidationError,
  resolveColors,
  resolveMapLocale,
  seatAriaLabel,
  summarizeSelection,
  toggleSeatSelection,
  validateDocumentSet,
} from '@kerusiweb/core';
import type {
  KerusiState,
  KerusiViolation,
  Money,
  NavigationGraph,
  RenderMap,
  RenderSection,
  SectionLayout,
} from '@kerusiweb/core';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { KerusiLegend } from './kerusi-legend.js';
import { KerusiSection } from './kerusi-section.js';
import type {
  KerusiSeatmapHandle,
  KerusiSeatmapProps,
  SeatInteraction,
  SectionRenderOptions,
} from './types.js';
import { useRovingFocus } from './use-roving-focus.js';

const NO_SELECTION: readonly string[] = [];
const DEFAULT_SELECTABLE_STATUSES = ['available'] as const;
const NO_OVERRIDES: Readonly<Record<string, SectionRenderOptions>> = {};

/**
 * Renders a Kerusi seat map.
 *
 * Takes a `KerusiMap` and its `KerusiState` directly — no adapter, no
 * intermediate row model. Each `Section` becomes its own `<svg>` with its own
 * layout mode and proportions, seats take their color from the map's legend,
 * every seat is keyboard-reachable and announced with its type, price, status
 * and §4.3.4 accessibility properties, and selection is an immutable list of
 * seat ids.
 *
 * ```tsx
 * <KerusiSeatmap map={map} state={state} selection={picked} onSelectionChange={setPicked} />
 * ```
 *
 * Import the stylesheet once, anywhere in the app:
 * `import '@kerusiweb/react/styles.css'`.
 */
export const KerusiSeatmap = forwardRef<KerusiSeatmapHandle, KerusiSeatmapProps>(
  function KerusiSeatmap(props, ref) {
    const {
      map,
      state,
      session,
      selection: controlledSelection,
      defaultSelection = NO_SELECTION,
      onSelectionChange,
      locale,
      rtl = 'auto',
      ariaStrings = DEFAULT_SEAT_ARIA_STRINGS,
      colors,
      typeColors = true,
      seatSize = 28,
      seatGap = 6,
      freeformBasis = 1000,
      unitScale = 1,
      showSectionLabels = true,
      showLegend = false,
      showLegendPrices = true,
      sectionIds,
      sectionOverrides = NO_OVERRIDES,
      selectableStatuses = DEFAULT_SELECTABLE_STATUSES,
      companionMode = 'auto',
      maxSelection,
      seatSelectable,
      interactive = true,
      expireHolds = false,
      expiryIntervalMs = 1000,
      validate = 'collect',
      onSeatSelect,
      onSeatDeselect,
      onSeatDisallowed,
      onSeatFocus,
      onValidationIssues,
      className,
      style,
      children,
    } = props;

    // --- selection: controlled or not ---------------------------------------

    const [uncontrolledSelection, setUncontrolledSelection] =
      useState<readonly string[]>(defaultSelection);
    const isControlled = controlledSelection !== undefined;
    const selection = isControlled ? controlledSelection : uncontrolledSelection;

    const commitSelection = useCallback(
      (next: readonly string[]) => {
        if (!isControlled) {
          setUncontrolledSelection(next);
        }
        onSelectionChange?.(next);
      },
      [isControlled, onSelectionChange],
    );

    // --- validation ---------------------------------------------------------

    const issues = useMemo<readonly KerusiViolation[]>(
      () => (validate === 'off' ? [] : validateDocumentSet({ map, state, session })),
      [validate, map, state, session],
    );

    useEffect(() => {
      if (validate !== 'off') {
        onValidationIssues?.(issues);
      }
      // `onValidationIssues` is deliberately absent: an inline callback would
      // re-announce the same issues on every render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [issues, validate]);

    if (validate === 'throw') {
      // Thrown during render, not from an effect, so a React error boundary
      // catches it — the idiomatic equivalent of the Angular binding's throw.
      const [first] = errorsOf(issues);
      if (first) {
        throw new KerusiValidationError(first.message, first.rule, first.id, issues);
      }
    }

    // --- derived model ------------------------------------------------------

    /** Bumped by the hold ticker to force the state to be re-derived. */
    const [expiryTick, setExpiryTick] = useState(0);

    useEffect(() => {
      if (!expireHolds) {
        return;
      }
      const handle = setInterval(() => setExpiryTick((n) => n + 1), expiryIntervalMs);
      return () => clearInterval(handle);
    }, [expireHolds, expiryIntervalMs]);

    /** The state actually rendered — with lapsed holds reverted when asked. */
    const effectiveState = useMemo<KerusiState | undefined>(() => {
      if (!state || !expireHolds) {
        return state;
      }
      // `expireHolds` returns the same object when nothing lapsed, so the
      // memos downstream of this one stay stable across a quiet tick.
      void expiryTick;
      return expireHoldsIn(state);
    }, [state, expireHolds, expiryTick]);

    const visibleSectionIds = useMemo<readonly string[] | undefined>(() => {
      const hidden = Object.entries(sectionOverrides)
        .filter(([, o]) => o.hidden)
        .map(([id]) => id);

      if (sectionIds) {
        return sectionIds.filter((id) => !hidden.includes(id));
      }
      if (hidden.length === 0) {
        return undefined;
      }
      return (map.sections ?? []).map((s) => s.id).filter((id) => !hidden.includes(id));
    }, [map, sectionIds, sectionOverrides]);

    const renderMap = useMemo<RenderMap>(
      () =>
        buildRenderModel(map, effectiveState, {
          locale,
          sectionIds: visibleSectionIds,
          selectableStatuses,
          seatSelectable,
        }),
      [map, effectiveState, locale, visibleSectionIds, selectableStatuses, seatSelectable],
    );

    const resolvedLocale = useMemo(() => resolveMapLocale(map, locale), [map, locale]);
    const isRtl = rtl === 'auto' ? isRtlLocale(resolvedLocale) : rtl === true;
    const resolvedColors = useMemo(() => resolveColors(colors), [colors]);
    const selectionSet = useMemo(() => new Set(selection), [selection]);

    /** Placed geometry per section, keyed by section id. */
    const layouts = useMemo<ReadonlyMap<string, SectionLayout>>(
      () =>
        new Map(
          renderMap.sections.map((section) => {
            const override = sectionOverrides[section.id] ?? {};
            return [
              section.id,
              computeSectionLayout(section, {
                seatSize: override.seatSize ?? seatSize,
                seatGap,
                freeformBasis,
                aspectRatio: override.aspectRatio,
                rtl: isRtl,
              }),
            ];
          }),
        ),
      [renderMap, sectionOverrides, seatSize, seatGap, freeformBasis, isRtl],
    );

    /** Navigation graphs per section — arrows move within, Tab moves between. */
    const graphs = useMemo<ReadonlyMap<string, NavigationGraph>>(
      () =>
        new Map(
          renderMap.sections.map((section) => [
            section.id,
            buildNavigationGraph(section, { rtl: isRtl }),
          ]),
        ),
      [renderMap, isRtl],
    );

    const ariaLabels = useMemo<ReadonlyMap<string, string>>(
      () =>
        new Map(
          [...renderMap.seatsById.values()].map((seat) => [
            seat.id,
            seatAriaLabel(seat, resolvedLocale, ariaStrings),
          ]),
        ),
      [renderMap, resolvedLocale, ariaStrings],
    );

    // --- focus and announcements --------------------------------------------

    const { focusedSeatIds, setFocusedSeat, moveFocusTo, focusSeat, registerSeat } =
      useRovingFocus(renderMap);

    /**
     * The live-region text, plus a counter that makes a repeat of the same
     * message textually distinct.
     *
     * A live region that sees no text change stays silent, so announcing the
     * same thing twice — picking two seats and hearing "1 seat selected" both
     * times — needs the second one to differ somehow. The Angular binding
     * clears the region and refills it a microtask later; two commits, which
     * React would batch back into one unless deliberately escaped. Appending a
     * zero-width space on alternate announcements does the same job in a single
     * commit: the text differs, and no screen reader speaks the character.
     */
    const [announcement, setAnnouncement] = useState({ message: '', nonce: 0 });

    const announce = useCallback((message: string) => {
      setAnnouncement((current) => ({ message, nonce: current.nonce + 1 }));
    }, []);

    const liveMessage =
      announcement.nonce % 2 === 0 ? announcement.message : `${announcement.message}\u200b`;

    const announceSelection = useCallback(
      (next: readonly string[]) => {
        if (next.length === 0) {
          announce(ariaStrings.selectionEmpty);
          return;
        }
        const { total } = summarizeSelection(renderMap, next);
        announce(ariaStrings.selectionSummary(next.length, formatTotal(total, resolvedLocale)));
      },
      [announce, ariaStrings, renderMap, resolvedLocale],
    );

    // --- interaction --------------------------------------------------------

    const onSeatActivate = useCallback(
      (seatId: string) => {
        const seat = renderMap.seatsById.get(seatId);
        if (!seat) {
          return;
        }

        const outcome = toggleSeatSelection(selection, seatId, {
          seatsById: renderMap.seatsById,
          companionMode,
          maxSelection,
        });

        if (outcome.kind === 'disallowed') {
          announce(disallowedAnnouncement(seat, outcome.reason!, ariaStrings));
          onSeatDisallowed?.({ seat, reason: outcome.reason! });
          return;
        }

        commitSelection(outcome.selection);
        const event: SeatInteraction = {
          seat,
          selection: outcome.selection,
          changed: outcome.changed,
        };
        (outcome.kind === 'select' ? onSeatSelect : onSeatDeselect)?.(event);
        announceSelection(outcome.selection);
      },
      [
        renderMap,
        selection,
        companionMode,
        maxSelection,
        announce,
        ariaStrings,
        onSeatDisallowed,
        commitSelection,
        onSeatSelect,
        onSeatDeselect,
        announceSelection,
      ],
    );

    const onSeatFocused = useCallback(
      (seatId: string) => {
        const seat = renderMap.seatsById.get(seatId);
        if (!seat) {
          return;
        }
        setFocusedSeat(seat.sectionId, seatId);
        onSeatFocus?.(seat);
      },
      [renderMap, setFocusedSeat, onSeatFocus],
    );

    /**
     * Arrow keys walk the navigation graph, which orders seats by `col` in grid
     * and mixed sections — §4.3.1's logical adjacency — so the aisle that is a
     * skipped column is stepped across rather than into.
     */
    const onKeyDown = useCallback(
      (sectionId: string, event: ReactKeyboardEvent<SVGGElement>) => {
        const seatId = (event.target as HTMLElement | null)?.dataset?.['seatId'];
        if (!seatId) {
          return;
        }

        const graph = graphs.get(sectionId);
        if (!graph) {
          return;
        }
        const neighbours = graph.neighbours.get(seatId);

        let target: string | undefined;
        switch (event.key) {
          case 'ArrowLeft':
            target = neighbours?.left;
            break;
          case 'ArrowRight':
            target = neighbours?.right;
            break;
          case 'ArrowUp':
            target = neighbours?.up;
            break;
          case 'ArrowDown':
            target = neighbours?.down;
            break;
          case 'Home':
            target = event.ctrlKey ? graph.first : neighbours?.rowStart;
            break;
          case 'End':
            target = event.ctrlKey ? graph.last : neighbours?.rowEnd;
            break;
          case 'PageUp':
            target = graph.first;
            break;
          case 'PageDown':
            target = graph.last;
            break;
          case 'Enter':
          case ' ':
            event.preventDefault();
            onSeatActivate(seatId);
            return;
          case 'Escape':
            if (selection.length > 0) {
              event.preventDefault();
              commitSelection([]);
              announceSelection([]);
            }
            return;
          default:
            return;
        }

        if (target) {
          event.preventDefault();
          moveFocusTo(sectionId, target);
        }
      },
      [graphs, onSeatActivate, selection, commitSelection, announceSelection, moveFocusTo],
    );

    // --- public handle ------------------------------------------------------

    const summary = useMemo(() => summarizeSelection(renderMap, selection), [renderMap, selection]);

    useImperativeHandle(ref, () => ({ summary, focusSeat }), [summary, focusSeat]);

    // --- render -------------------------------------------------------------

    const labelFor = (section: RenderSection): string | undefined =>
      sectionOverrides[section.id]?.label ?? section.label;
    const labelId = (section: RenderSection): string =>
      `kerusi-section-${renderMap.id}-${section.id}`;

    return (
      <div
        className={className ? `kerusi-seatmap ${className}` : 'kerusi-seatmap'}
        role="group"
        aria-label={renderMap.name ?? `Seat map ${renderMap.id}`}
        dir={isRtl ? 'rtl' : undefined}
        lang={resolvedLocale}
        style={style}
      >
        {renderMap.sections.map((section) => {
          const label = labelFor(section);
          return (
            <section
              key={section.id}
              className={`kerusi-seatmap__section kerusi-seatmap__section--${section.layoutMode}`}
              role="group"
              aria-labelledby={label ? labelId(section) : undefined}
              aria-label={label ? undefined : section.id}
            >
              {showSectionLabels && label && (
                <h3 className="kerusi-section-label" id={labelId(section)}>
                  {label}
                </h3>
              )}

              <KerusiSection
                section={section}
                layout={layouts.get(section.id)!}
                selection={selectionSet}
                focusedSeatId={focusedSeatIds[section.id] ?? null}
                ariaLabels={ariaLabels}
                colors={resolvedColors}
                typeColors={typeColors}
                unitScale={unitScale}
                interactive={interactive}
                onSeatActivate={onSeatActivate}
                onSeatFocused={onSeatFocused}
                onSeatKeyDown={(event) => onKeyDown(section.id, event)}
                registerSeat={registerSeat}
              />
            </section>
          );
        })}

        {showLegend && (
          <KerusiLegend
            legend={renderMap.legend}
            locale={resolvedLocale}
            colors={resolvedColors}
            typeColors={typeColors}
            showPrices={showLegendPrices}
          />
        )}

        <p className="kerusi-sr-only" aria-live="polite" aria-atomic="true">
          {liveMessage}
        </p>

        {children}
      </div>
    );
  },
);

function formatTotal(total: Money | undefined, locale: string): string {
  return total ? formatMoney(total, locale) : '';
}
