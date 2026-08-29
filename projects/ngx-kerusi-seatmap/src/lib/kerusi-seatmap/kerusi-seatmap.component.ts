import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { KerusiMap, Money } from '../kerusi/kerusi-map.model';
import { KerusiSession, KerusiState } from '../kerusi/kerusi-state.model';
import { formatMoney, resolveMapLocale } from '../kerusi/kerusi-locale';
import { expireHolds } from '../kerusi/kerusi-state-store';
import { KerusiViolation } from '../kerusi/kerusi-violation';
import { errorsOf, KerusiValidationError, validateDocumentSet } from '../kerusi/kerusi-validator';
import { buildRenderModel } from '../render/build-render-model';
import { RenderMap, RenderSeat, RenderSection, SeatRenderStatus } from '../render/render-model';
import { buildNavigationGraph, NavigationGraph } from '../render/navigation-order';
import { computeSectionLayout, SectionLayout } from '../render/section-layout';
import { KerusiSectionComponent } from './kerusi-section.component';
import { KerusiLegendComponent } from './kerusi-legend.component';
import { DEFAULT_KERUSI_COLORS, KerusiSeatmapColors } from './kerusi-seatmap-colors';
import {
  DEFAULT_SEAT_ARIA_STRINGS,
  disallowedAnnouncement,
  SeatAriaStrings,
  seatAriaLabel,
} from './seat-aria';
import { DisallowedReason, summarizeSelection, toggleSeatSelection } from './selection';

/** How a document with validation errors is handled. */
export type ValidationMode =
  /** Report through `validationIssues` and render anyway. The default. */
  | 'collect'
  /** Throw a `KerusiValidationError`, as `validateKerusiMap` does. */
  | 'throw'
  /** Skip validation entirely, for a document validated upstream. */
  | 'off';

/** Per-section rendering overrides, keyed by `Section.id`. */
export interface SectionRenderOptions {
  hidden?: boolean;
  /** Overrides `Section.aspectRatio`. */
  aspectRatio?: string;
  /** Overrides the seat size for this section only. */
  seatSize?: number;
  /** Overrides the localized `Section.label`. */
  label?: string;
}

/** What a seat event carries. Everything the document knows, already resolved. */
export interface SeatInteraction {
  seat: RenderSeat;
  /** The selection after this event. */
  selection: readonly string[];
  /** Seats whose membership changed, including companions (§4.6). */
  changed: readonly string[];
}

export interface SeatDisallowed {
  seat: RenderSeat;
  reason: DisallowedReason;
}

/**
 * Renders a Kerusi seat map.
 *
 * Takes a `KerusiMap` and its `KerusiState` directly — no adapter, no
 * intermediate row model. Each `Section` becomes its own `<svg>` with its own
 * layout mode and proportions, seats take their color from the map's legend,
 * every seat is keyboard-reachable and announced with its type, price, status
 * and §4.3.4 accessibility properties, and selection is an immutable set of
 * seat ids the caller can two-way bind.
 *
 * ```html
 * <kerusi-seatmap [map]="map" [state]="state" [(selection)]="picked" />
 * ```
 */
@Component({
  selector: 'kerusi-seatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KerusiSectionComponent, KerusiLegendComponent],
  templateUrl: './kerusi-seatmap.component.html',
  styleUrl: './kerusi-seatmap.component.css',
})
export class KerusiSeatmapComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  // --- documents ------------------------------------------------------------

  readonly map = input.required<KerusiMap>();
  readonly state = input<KerusiState | undefined>(undefined);
  /** The optional map↔event join (§5.3). Validated against the map and state. */
  readonly session = input<KerusiSession | undefined>(undefined);

  // --- selection ------------------------------------------------------------

  /** Selected seat ids. Two-way: `[(selection)]`, or read-only with `[selection]`. */
  readonly selection = model<readonly string[]>([]);

  // --- localization ---------------------------------------------------------

  /** Overrides `KerusiMap.locale` (BCP-47). */
  readonly locale = input<string | undefined>(undefined);
  /** Right-to-left rendering. `auto` derives it from the resolved locale. */
  readonly rtl = input<boolean | 'auto'>('auto');
  /** Overrides the built-in English announcement strings. */
  readonly ariaStrings = input<SeatAriaStrings>(DEFAULT_SEAT_ARIA_STRINGS);

  // --- appearance -----------------------------------------------------------

  readonly colors = input<KerusiSeatmapColors>({});
  /** Let an available seat take its `SeatType.color` (§4.7). */
  readonly typeColors = input<boolean>(true);
  /** Grid cell edge, in viewBox units. */
  readonly seatSize = input<number>(28);
  /** Gap between grid cells, in viewBox units. */
  readonly seatGap = input<number>(6);
  /** Freeform viewBox width; height follows the section's aspect ratio. */
  readonly freeformBasis = input<number>(1000);
  /**
   * CSS pixels per viewBox unit. Caps each section at its natural size so a
   * narrow section and a wide one in the same map draw seats the same size.
   */
  readonly unitScale = input<number>(1);
  readonly showSectionLabels = input<boolean>(true);
  readonly showLegend = input<boolean>(false);
  readonly showLegendPrices = input<boolean>(true);

  // --- section control ------------------------------------------------------

  /** Render only these sections, in this order. Default: all, by `Section.index`. */
  readonly sectionIds = input<readonly string[] | undefined>(undefined);
  readonly sectionOverrides = input<Readonly<Record<string, SectionRenderOptions>>>({});

  // --- interaction ----------------------------------------------------------

  /** Statuses in which a seat may be picked. Default: `['available']`. */
  readonly selectableStatuses = input<readonly SeatRenderStatus[]>(['available']);
  /** `auto` selects a seat's companion closure together (§4.6). */
  readonly companionMode = input<'auto' | 'independent'>('auto');
  readonly maxSelection = input<number | undefined>(undefined);
  /** A final say on selectability, applied after the status test. */
  readonly seatSelectable = input<((seat: RenderSeat) => boolean) | undefined>(undefined);
  /** When false the map renders read-only: no pointer or keyboard interaction. */
  readonly interactive = input<boolean>(true);
  /**
   * Revert a lapsed `holdExpires` to available on a ticker (§5.1). Off by
   * default — a renderer should stay passive unless asked.
   */
  readonly expireHolds = input<boolean>(false);
  readonly expiryIntervalMs = input<number>(1000);

  // --- validation -----------------------------------------------------------

  readonly validate = input<ValidationMode>('collect');

  // --- outputs --------------------------------------------------------------

  readonly seatSelect = output<SeatInteraction>();
  readonly seatDeselect = output<SeatInteraction>();
  readonly seatDisallowed = output<SeatDisallowed>();
  readonly seatFocus = output<RenderSeat>();
  /** Emitted whenever the documents change, in `collect` mode. */
  readonly validationIssues = output<readonly KerusiViolation[]>();

  // --- internal state -------------------------------------------------------

  /**
   * The seat holding each section's tab stop, keyed by section id.
   *
   * Per section, not per map: arrow keys never cross a section boundary, so a
   * single map-wide tab stop would leave every section after the first
   * unreachable by keyboard. Tab moves between sections, arrows move within.
   */
  private readonly focusedSeatIds = signal<Readonly<Record<string, string>>>({});
  private readonly announcement = signal('');
  /** Bumped by the hold ticker to force the state to be re-derived. */
  private readonly expiryTick = signal(0);

  constructor() {
    effect(() => {
      const issues = this.issues();
      if (this.validate() !== 'off') {
        this.validationIssues.emit(issues);
      }
      if (this.validate() === 'throw') {
        const [first] = errorsOf(issues);
        if (first) {
          throw new KerusiValidationError(first.message, first.rule, first.id, issues);
        }
      }
    });

    // Keep every section's tab stop pointing at a seat that still exists.
    effect(() => {
      const model = this.renderMap();
      const current = this.focusedSeatIds();
      const next: Record<string, string> = {};
      let changed = Object.keys(current).length !== model.sections.length;

      for (const section of model.sections) {
        const held = current[section.id];
        const valid = held && section.seats.some((seat) => seat.id === held);
        const resolved = valid ? held : section.seats[0]?.id;
        if (resolved) {
          next[section.id] = resolved;
          changed ||= resolved !== held;
        }
      }

      if (changed) {
        this.focusedSeatIds.set(next);
      }
    });

    effect((onCleanup) => {
      if (!this.expireHolds()) {
        return;
      }
      const handle = setInterval(
        () => this.expiryTick.update((n) => n + 1),
        this.expiryIntervalMs(),
      );
      onCleanup(() => clearInterval(handle));
    });
  }

  // --- derived model --------------------------------------------------------

  protected readonly issues = computed<readonly KerusiViolation[]>(() =>
    this.validate() === 'off'
      ? []
      : validateDocumentSet({
          map: this.map(),
          state: this.state(),
          session: this.session(),
        }),
  );

  /** The state actually rendered — with lapsed holds reverted when asked. */
  private readonly effectiveState = computed<KerusiState | undefined>(() => {
    const state = this.state();
    if (!state || !this.expireHolds()) {
      return state;
    }
    this.expiryTick();
    return expireHolds(state);
  });

  protected readonly renderMap = computed<RenderMap>(() =>
    buildRenderModel(this.map(), this.effectiveState(), {
      locale: this.locale(),
      sectionIds: this.visibleSectionIds(),
      selectableStatuses: this.selectableStatuses(),
      seatSelectable: this.seatSelectable(),
    }),
  );

  protected readonly resolvedLocale = computed(() => resolveMapLocale(this.map(), this.locale()));

  protected readonly isRtl = computed(() =>
    this.rtl() === 'auto' ? isRtlLocale(this.resolvedLocale()) : this.rtl() === true,
  );

  protected readonly resolvedColors = computed<Required<KerusiSeatmapColors>>(() => ({
    ...DEFAULT_KERUSI_COLORS,
    ...this.colors(),
  }));

  protected readonly selectionSet = computed(() => new Set(this.selection()));

  /** Placed geometry per section, keyed by section id. */
  protected readonly layouts = computed<ReadonlyMap<string, SectionLayout>>(() => {
    const overrides = this.sectionOverrides();
    return new Map(
      this.renderMap().sections.map((section) => {
        const override = overrides[section.id] ?? {};
        return [
          section.id,
          computeSectionLayout(section, {
            seatSize: override.seatSize ?? this.seatSize(),
            seatGap: this.seatGap(),
            freeformBasis: this.freeformBasis(),
            aspectRatio: override.aspectRatio,
            rtl: this.isRtl(),
          }),
        ];
      }),
    );
  });

  /** Navigation graphs per section — arrows move within, Tab moves between. */
  private readonly graphs = computed<ReadonlyMap<string, NavigationGraph>>(
    () =>
      new Map(
        this.renderMap().sections.map((section) => [
          section.id,
          buildNavigationGraph(section, { rtl: this.isRtl() }),
        ]),
      ),
  );

  protected readonly ariaLabels = computed<ReadonlyMap<string, string>>(() => {
    const locale = this.resolvedLocale();
    const strings = this.ariaStrings();
    return new Map(
      [...this.renderMap().seatsById.values()].map((seat) => [
        seat.id,
        seatAriaLabel(seat, locale, strings),
      ]),
    );
  });

  protected readonly mapLabel = computed(
    () => this.renderMap().name ?? `Seat map ${this.renderMap().id}`,
  );

  /** Live-region text: the running selection, or the last disallowed reason. */
  protected readonly liveMessage = computed(() => this.announcement());

  /** The selection's seats and total, for callers that want it off the template. */
  readonly summary = computed(() => summarizeSelection(this.renderMap(), this.selection()));

  // --- template helpers -----------------------------------------------------

  protected layoutFor(section: RenderSection): SectionLayout {
    return this.layouts().get(section.id)!;
  }

  protected labelFor(section: RenderSection): string | undefined {
    return this.sectionOverrides()[section.id]?.label ?? section.label;
  }

  protected labelId(section: RenderSection): string {
    return `kerusi-section-${this.renderMap().id}-${section.id}`;
  }

  /** The seat holding this section's tab stop. */
  protected focusedSeatIn(section: RenderSection): string | null {
    return this.focusedSeatIds()[section.id] ?? null;
  }

  // --- interaction ----------------------------------------------------------

  protected onSeatActivate(seatId: string): void {
    const model = this.renderMap();
    const seat = model.seatsById.get(seatId);
    if (!seat) {
      return;
    }

    const outcome = toggleSeatSelection(this.selection(), seatId, {
      seatsById: model.seatsById,
      companionMode: this.companionMode(),
      maxSelection: this.maxSelection(),
    });

    if (outcome.kind === 'disallowed') {
      this.announce(disallowedAnnouncement(seat, outcome.reason!, this.ariaStrings()));
      this.seatDisallowed.emit({ seat, reason: outcome.reason! });
      return;
    }

    this.selection.set(outcome.selection);
    const event: SeatInteraction = {
      seat,
      selection: outcome.selection,
      changed: outcome.changed,
    };
    (outcome.kind === 'select' ? this.seatSelect : this.seatDeselect).emit(event);
    this.announceSelection(outcome.selection);
  }

  protected onSeatFocused(seatId: string): void {
    const seat = this.renderMap().seatsById.get(seatId);
    if (!seat) {
      return;
    }
    this.setFocusedSeat(seat.sectionId, seatId);
    this.seatFocus.emit(seat);
  }

  /**
   * Arrow keys walk the navigation graph, which orders seats by `col` in grid
   * and mixed sections — §4.3.1's logical adjacency — so the aisle that is a
   * skipped column is stepped across rather than into.
   */
  protected onKeydown(section: RenderSection, event: KeyboardEvent): void {
    const seatId = (event.target as HTMLElement)?.dataset?.['seatId'];
    if (!seatId) {
      return;
    }

    const graph = this.graphs().get(section.id);
    const neighbours = graph?.neighbours.get(seatId);
    if (!graph) {
      return;
    }

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
        this.onSeatActivate(seatId);
        return;
      case 'Escape':
        if (this.selection().length > 0) {
          event.preventDefault();
          this.selection.set([]);
          this.announceSelection([]);
        }
        return;
      default:
        return;
    }

    if (target) {
      event.preventDefault();
      this.moveFocusTo(section.id, target);
    }
  }

  private setFocusedSeat(sectionId: string, seatId: string): void {
    if (this.focusedSeatIds()[sectionId] === seatId) {
      return;
    }
    this.focusedSeatIds.update((all) => ({ ...all, [sectionId]: seatId }));
  }

  /**
   * Moves the roving tab stop, then the DOM focus that follows it.
   *
   * Seat ids come from the document, so they cannot be interpolated into a
   * selector unescaped — and `CSS.escape` is absent in jsdom and under SSR.
   * Scanning the rendered nodes avoids both problems.
   */
  private moveFocusTo(sectionId: string, seatId: string): void {
    this.setFocusedSeat(sectionId, seatId);
    const nodes = (this.host.nativeElement as HTMLElement).querySelectorAll<SVGGElement>(
      '[data-seat-id]',
    );
    for (const node of Array.from(nodes)) {
      if (node.dataset['seatId'] === seatId) {
        node.focus?.();
        return;
      }
    }
  }

  private announceSelection(selection: readonly string[]): void {
    const strings = this.ariaStrings();
    if (selection.length === 0) {
      this.announce(strings.selectionEmpty);
      return;
    }
    const { total } = summarizeSelection(this.renderMap(), selection);
    this.announce(
      strings.selectionSummary(selection.length, formatTotal(total, this.resolvedLocale())),
    );
  }

  private announce(message: string): void {
    // Re-announce an identical message by clearing first; a live region that
    // sees no text change stays silent.
    this.announcement.set('');
    queueMicrotask(() => this.announcement.set(message));
  }

  private visibleSectionIds(): readonly string[] | undefined {
    const explicit = this.sectionIds();
    const overrides = this.sectionOverrides();
    const hidden = Object.entries(overrides)
      .filter(([, o]) => o.hidden)
      .map(([id]) => id);

    if (explicit) {
      return explicit.filter((id) => !hidden.includes(id));
    }
    if (hidden.length === 0) {
      return undefined;
    }
    return (this.map().sections ?? []).map((s) => s.id).filter((id) => !hidden.includes(id));
  }
}

function formatTotal(total: Money | undefined, locale: string): string {
  return total ? formatMoney(total, locale) : '';
}

/** BCP-47 language subtags written right-to-left. */
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'dv', 'yi', 'ku', 'sd']);

function isRtlLocale(locale: string): boolean {
  return RTL_LANGUAGES.has(locale.toLowerCase().split('-')[0]);
}
