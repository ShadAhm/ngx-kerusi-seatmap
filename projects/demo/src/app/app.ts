import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  buildRenderModel,
  formatMoney,
  KerusiViolation,
  summarizeSelection,
} from '@kerusiweb/core';
import { KerusiSeatmapComponent, SeatDisallowed } from 'ngx-kerusi-seatmap';
import { DEMO_LOCALES, Scenario, SCENARIOS } from '@kerusi/demo-scenarios';

const THEME_STORAGE_KEY = 'kerusi-demo-theme';

type Theme = 'light' | 'dark';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KerusiSeatmapComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: { '[attr.data-theme]': 'theme()' },
})
export class App {
  protected readonly scenarios = SCENARIOS;
  protected readonly locales = DEMO_LOCALES;

  protected readonly scenarioId = signal<string>(SCENARIOS[0].id);
  protected readonly locale = signal<string>('en');
  protected readonly showLegend = signal(true);
  protected readonly typeColors = signal(true);
  protected readonly showSource = signal(false);
  protected readonly theme = signal<Theme>(getInitialTheme());

  protected toggleTheme(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private browsing or storage disabled — theme just won't persist. */
    }
  }

  /** Selections are per scenario, so switching tabs does not lose a pick. */
  private readonly selections = signal<Record<string, readonly string[]>>({});
  protected readonly lastDisallowed = signal<string>('');
  protected readonly issues = signal<readonly KerusiViolation[]>([]);

  protected readonly scenario = computed<Scenario>(
    () => SCENARIOS.find((s) => s.id === this.scenarioId()) ?? SCENARIOS[0],
  );

  protected readonly selection = computed<readonly string[]>(
    () => this.selections()[this.scenarioId()] ?? [],
  );

  protected onSelectionChange(next: readonly string[]): void {
    this.selections.update((all) => ({ ...all, [this.scenarioId()]: next }));
    this.lastDisallowed.set('');
  }

  protected onScenarioChange(id: string): void {
    this.scenarioId.set(id);
    this.lastDisallowed.set('');
  }

  protected onDisallowed(event: SeatDisallowed): void {
    const where = event.seat.rowLabel
      ? `Row ${event.seat.rowLabel}, seat ${event.seat.label}`
      : `Seat ${event.seat.label}`;
    this.lastDisallowed.set(`${where} — ${DISALLOWED_TEXT[event.reason]}`);
  }

  /** Resolved selection: the seats picked, their prices, and the total. */
  protected readonly summary = computed(() => {
    const scenario = this.scenario();
    const model = buildRenderModel(scenario.map, scenario.state, { locale: this.locale() });
    const { seats, total, unpriced } = summarizeSelection(model, this.selection());
    return {
      seats: seats.map((seat) => ({
        id: seat.id,
        label: seat.rowLabel ? `${seat.rowLabel}${seat.label}` : seat.label,
        typeLabel: seat.typeLabel,
        price: seat.price ? formatMoney(seat.price, this.locale()) : '—',
        attributes: seat.attributes,
        accessible: !!seat.accessibility?.wheelchairAccessible,
      })),
      total: total ? formatMoney(total, this.locale()) : '',
      unpriced,
    };
  });

  /** The scenario's map as JSON, so the standard itself is visible on the page. */
  protected readonly sourceJson = computed(() => JSON.stringify(this.scenario().map, null, 2));

  protected readonly sectionSummary = computed(() =>
    buildRenderModel(this.scenario().map, this.scenario().state).sections.map((section) => ({
      id: section.id,
      label: section.label ?? section.id,
      mode: section.layoutMode,
      declared: section.source.layout ?? 'inferred',
      aspectRatio: section.aspectRatio,
      seats: section.seats.length,
      elements: section.elements.length,
    })),
  );
}

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    /* private browsing or storage disabled — fall through to system preference. */
  }
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

const DISALLOWED_TEXT: Record<SeatDisallowed['reason'], string> = {
  booked: 'already booked',
  held: 'held in another cart',
  blocked: 'blocked by the venue',
  'not-selectable': 'not selectable',
  'max-selection': 'would exceed the seat limit',
  'companion-unavailable': 'must be booked with a seat that is unavailable',
};
