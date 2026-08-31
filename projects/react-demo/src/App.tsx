import { buildRenderModel, formatMoney, summarizeSelection } from '@kerusiweb/core';
import type { KerusiViolation } from '@kerusiweb/core';
import { KerusiSeatmap } from '@kerusiweb/react';
import type { SeatDisallowed } from '@kerusiweb/react';
import { DEMO_LOCALES, SCENARIOS } from '@kerusi/demo-scenarios';
import type { Scenario } from '@kerusi/demo-scenarios';
import { useCallback, useMemo, useState } from 'react';

const THEME_STORAGE_KEY = 'kerusi-demo-theme';

type Theme = 'light' | 'dark';

export function App() {
  const [scenarioId, setScenarioId] = useState<string>(SCENARIOS[0]!.id);
  const [locale, setLocale] = useState('en');
  const [showLegend, setShowLegend] = useState(true);
  const [typeColors, setTypeColors] = useState(true);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  /** Selections are per scenario, so switching tabs does not lose a pick. */
  const [selections, setSelections] = useState<Record<string, readonly string[]>>({});
  const [lastDisallowed, setLastDisallowed] = useState('');
  const [issues, setIssues] = useState<readonly KerusiViolation[]>([]);

  const scenario: Scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]!;
  const selection = selections[scenarioId] ?? EMPTY;

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private browsing or storage disabled — theme just won't persist. */
    }
  };

  const onSelectionChange = useCallback(
    (next: readonly string[]) => {
      setSelections((all) => ({ ...all, [scenarioId]: next }));
      setLastDisallowed('');
    },
    [scenarioId],
  );

  const onScenarioChange = (id: string) => {
    setScenarioId(id);
    setLastDisallowed('');
  };

  const onDisallowed = useCallback((event: SeatDisallowed) => {
    const where = event.seat.rowLabel
      ? `Row ${event.seat.rowLabel}, seat ${event.seat.label}`
      : `Seat ${event.seat.label}`;
    setLastDisallowed(`${where} — ${DISALLOWED_TEXT[event.reason]}`);
  }, []);

  /** Resolved selection: the seats picked, their prices, and the total. */
  const summary = useMemo(() => {
    const model = buildRenderModel(scenario.map, scenario.state, { locale });
    const { seats, total, unpriced } = summarizeSelection(model, selection);
    return {
      seats: seats.map((seat) => ({
        id: seat.id,
        label: seat.rowLabel ? `${seat.rowLabel}${seat.label}` : seat.label,
        typeLabel: seat.typeLabel,
        price: seat.price ? formatMoney(seat.price, locale) : '—',
        accessible: !!seat.accessibility?.wheelchairAccessible,
      })),
      total: total ? formatMoney(total, locale) : '',
      unpriced,
    };
  }, [scenario, locale, selection]);

  const sectionSummary = useMemo(
    () =>
      buildRenderModel(scenario.map, scenario.state).sections.map((section) => ({
        id: section.id,
        label: section.label ?? section.id,
        mode: section.layoutMode,
        declared: section.source.layout ?? 'inferred',
        aspectRatio: section.aspectRatio,
        seats: section.seats.length,
      })),
    [scenario],
  );

  /** The scenario's map as JSON, so the standard itself is visible on the page. */
  const sourceJson = useMemo(() => JSON.stringify(scenario.map, null, 2), [scenario]);

  return (
    <div className="app" data-theme={theme}>
      <header className="site-header">
        <div>
          <h1>@kerusiweb/react</h1>
          <p>
            A React seat map that renders <a href="https://github.com/ShadAhm/kerusi">Kerusi</a>{' '}
            documents directly — every positioning mode, sections as real render units, and a
            keyboard-navigable, screen-reader-friendly SVG.
          </p>
        </div>

        <button
          type="button"
          className="theme-toggle"
          aria-pressed={theme === 'dark'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}
        </button>
      </header>

      <main>
        <nav className="scenarios" aria-label="Venue scenarios">
          {SCENARIOS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                item.id === scenarioId ? 'scenario-tab scenario-tab--active' : 'scenario-tab'
              }
              aria-pressed={item.id === scenarioId}
              onClick={() => onScenarioChange(item.id)}
            >
              {item.name}
            </button>
          ))}
        </nav>

        <section className="scenario" aria-label={scenario.name}>
          <div className="scenario-intro">
            <div>
              <h2>{scenario.map.name as string}</h2>
              <p className="hint">{scenario.blurb}</p>
            </div>

            <div className="controls">
              <label>
                Locale
                <select value={locale} onChange={(e) => setLocale(e.target.value)}>
                  {DEMO_LOCALES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={typeColors}
                  onChange={(e) => setTypeColors(e.target.checked)}
                />
                Seat-type colours
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={showLegend}
                  onChange={(e) => setShowLegend(e.target.checked)}
                />
                Legend
              </label>
            </div>
          </div>

          <div className="scenario-body">
            <div className="stage">
              <KerusiSeatmap
                map={scenario.map}
                state={scenario.state}
                session={scenario.session}
                selection={selection}
                onSelectionChange={onSelectionChange}
                locale={locale}
                seatSize={scenario.seatSize ?? 28}
                typeColors={typeColors}
                showLegend={showLegend}
                onSeatDisallowed={onDisallowed}
                onValidationIssues={setIssues}
              />

              <p className="keyboard-hint">
                Tab into the map, then use the arrow keys — they follow <code>col</code> order, so
                an aisle is stepped across rather than into. Enter or Space picks a seat; Escape
                clears.
              </p>
            </div>

            <aside className="panel">
              <div className="card">
                <h3>Your selection</h3>
                {summary.seats.length > 0 ? (
                  <>
                    <ul className="seat-list">
                      {summary.seats.map((seat) => (
                        <li key={seat.id}>
                          <span className="seat-list__id">{seat.label}</span>
                          <span className="seat-list__type">{seat.typeLabel}</span>
                          <span className="seat-list__price">{seat.price}</span>
                          {seat.accessible && (
                            <span className="badge" title="Wheelchair accessible">
                              &#9855;
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {summary.total && <p className="total">Total {summary.total}</p>}
                    {summary.unpriced > 0 && (
                      <p className="muted">{summary.unpriced} seat(s) carry no price.</p>
                    )}
                  </>
                ) : (
                  <p className="muted">
                    No seats picked. Prices resolve through the standard&apos;s order: the
                    seat&apos;s own price, then its tier, then its type&apos;s default.
                  </p>
                )}
                {lastDisallowed && <p className="warn">{lastDisallowed}</p>}
              </div>

              <div className="card">
                <h3>What this document shows</h3>
                <ul className="highlights">
                  {scenario.highlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="card">
                <h3>Sections</h3>
                <table className="sections-table">
                  <thead>
                    <tr>
                      <th scope="col">Section</th>
                      <th scope="col">Mode</th>
                      <th scope="col">Ratio</th>
                      <th scope="col">Seats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionSummary.map((section) => (
                      <tr key={section.id}>
                        <td>{section.label}</td>
                        <td>
                          <code>{section.mode}</code>
                          {section.declared === 'inferred' && (
                            <span className="muted"> (inferred)</span>
                          )}
                        </td>
                        <td>{section.aspectRatio}</td>
                        <td>{section.seats}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <h3>Conformance</h3>
                {issues.length === 0 ? (
                  <p className="ok">This document validates clean — no errors, no warnings.</p>
                ) : (
                  <ul className="issues">
                    {issues.map((issue, index) => (
                      <li key={index} className={`issue issue--${issue.severity}`}>
                        <code>{issue.rule}</code> {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </div>

          <details className="source">
            <summary>The KerusiMap behind this view</summary>
            <pre>
              <code>{sourceJson}</code>
            </pre>
          </details>
        </section>
      </main>

      <footer className="site-footer">
        <a href="https://github.com/ShadAhm/ngx-kerusi-seatmap">GitHub</a>
        <span>&middot;</span>
        <a href="https://www.npmjs.com/package/@kerusiweb/react">npm</a>
        <span>&middot;</span>
        <a href="https://github.com/ShadAhm/kerusi">The Kerusi standard</a>
      </footer>
    </div>
  );
}

const EMPTY: readonly string[] = [];

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
