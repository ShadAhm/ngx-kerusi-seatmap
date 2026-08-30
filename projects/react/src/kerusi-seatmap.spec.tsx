import type { KerusiMap, KerusiState, KerusiViolation } from '@kerusiweb/core';
import { act, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KerusiSeatmap } from './kerusi-seatmap.js';
import type { SeatDisallowed } from './types.js';

/** Two sections in different layout modes, plus a companion pair. */
const VENUE: KerusiMap = {
  kerusi: '1.0',
  id: 'venue',
  name: 'Panggung Bandaraya',
  locale: 'en',
  legend: [
    { id: 'standard', label: { en: 'Standard', ms: 'Biasa' }, color: '#3a8f63' },
    { id: 'sofa', label: { en: 'Sofa' }, defaultPriceTier: 'top' },
  ],
  priceTiers: [{ id: 'top', price: { amount: 9000, currency: 'MYR' } }],
  sections: [
    {
      id: 'stalls',
      index: 1,
      label: { en: 'Stalls', ms: 'Bawah' },
      layout: 'grid',
      rows: [{ id: 'A', label: 'A', index: 0 }],
      seats: [
        { id: 'A1', label: '1', row: 'A', col: 1, type: 'standard' },
        { id: 'A2', label: '2', row: 'A', col: 2, type: 'standard' },
        // Column 3 is the aisle.
        { id: 'A4', label: '4', row: 'A', col: 4, type: 'standard' },
      ],
      elements: [{ id: 'exit-a', kind: 'exit', label: 'Exit', row: 'A', col: 6 }],
    },
    {
      id: 'balcony',
      index: 2,
      label: { en: 'Balcony', ms: 'Balkoni' },
      layout: 'freeform',
      aspectRatio: '3:1',
      seats: [
        { id: 'L1', label: 'L1', x: 45, y: 50, type: 'sofa', companions: ['L2'] },
        { id: 'L2', label: 'L2', x: 55, y: 50, type: 'sofa', companions: ['L1'] },
      ],
    },
  ],
};

/** What the host holds, standing in for the Angular spec's signals. */
interface HostState {
  map: KerusiMap;
  state?: KerusiState;
  selection: readonly string[];
  locale?: string;
  showLegend: boolean;
  maxSelection?: number;
}

const INITIAL: HostState = { map: VENUE, selection: [], showLegend: false };

describe('KerusiSeatmap', () => {
  let el: HTMLElement;
  let host: HostState;
  let disallowed: SeatDisallowed | undefined;
  let issues: readonly KerusiViolation[];
  let apply: (patch: Partial<HostState>) => void;

  function Host() {
    const [s, setS] = useState<HostState>(INITIAL);
    host = s;
    apply = (patch) => setS((current) => ({ ...current, ...patch }));

    return (
      <KerusiSeatmap
        map={s.map}
        state={s.state}
        selection={s.selection}
        onSelectionChange={(selection) => setS((current) => ({ ...current, selection }))}
        locale={s.locale}
        showLegend={s.showLegend}
        maxSelection={s.maxSelection}
        onSeatDisallowed={(event) => {
          disallowed = event;
        }}
        onValidationIssues={(next) => {
          issues = next;
        }}
      />
    );
  }

  /** Pushes host state in, the way the Angular spec's `signal.set` did. */
  const set = (patch: Partial<HostState>) => act(() => apply(patch));

  beforeEach(() => {
    disallowed = undefined;
    issues = [];
    el = render(<Host />).container;
  });

  const seats = () => [...el.querySelectorAll<SVGGElement>('g.kerusi-seat')];
  const seat = (id: string) => el.querySelector<SVGGElement>(`[data-seat-id="${id}"]`)!;
  const svgs = () => [...el.querySelectorAll<SVGSVGElement>('svg.kerusi-section-svg')];
  const box = (id: string) => seat(id).querySelector<SVGPathElement>('.kerusi-seat__box')!;
  const core = (id: string) => seat(id).querySelector<SVGPathElement>('.kerusi-seat__core')!;
  const tabStops = () =>
    seats()
      .filter((g) => g.getAttribute('tabindex') === '0')
      .map((g) => g.getAttribute('data-seat-id'));

  /**
   * Every on-curve point in a `d` string, as a flat `[x0, y0, x1, y1, ...]`
   * list — mirrors the helper in `seat-shapes.spec.ts`. Skips an `A` command's
   * `rx ry x-axis-rotation large-arc-flag sweep-flag` numbers, which are not
   * coordinates and are frequently 0 — indistinguishable from a real minimum
   * if left in.
   */
  const pathPoints = (d: string): number[] => {
    const out: number[] = [];
    const tokens = d.trim().split(/\s+/);
    let i = 0;
    while (i < tokens.length) {
      const cmd = tokens[i];
      if (cmd === 'M' || cmd === 'L') {
        out.push(Number(tokens[i + 1]), Number(tokens[i + 2]));
        i += 3;
      } else if (cmd === 'A') {
        out.push(Number(tokens[i + 6]), Number(tokens[i + 7]));
        i += 8;
      } else {
        i += 1;
      }
    }
    return out;
  };

  describe('sections as render units', () => {
    it('renders one svg per section, in Section.index order', () => {
      expect(svgs()).toHaveLength(2);
      const headings = [...el.querySelectorAll('h3')].map((h) => h.textContent?.trim());
      expect(headings).toEqual(['Stalls', 'Balcony']);
    });

    it('gives each section its own viewBox from its own layout mode', () => {
      const [stalls, balcony] = svgs().map((s) =>
        s.getAttribute('viewBox')!.split(' ').map(Number),
      );
      // The freeform balcony is 3:1; the grid stalls are sized from their cells.
      expect(balcony![2]! / balcony![3]!).toBeCloseTo(3, 5);
      expect(stalls![2]! / stalls![3]!).not.toBeCloseTo(3, 5);
    });

    it('links each section to its heading for assistive technology', () => {
      const section = el.querySelector('.kerusi-seatmap__section')!;
      const id = section.getAttribute('aria-labelledby')!;
      expect(el.querySelector(`[id="${id}"]`)!.textContent).toContain('Stalls');
    });

    it('renders a grid section element, which the pre-1.0 renderer ignored', () => {
      expect(el.querySelectorAll('.kerusi-element--exit')).toHaveLength(1);
    });

    it('emits no filler node for the skipped aisle column (§4.3.2)', () => {
      expect(seats()).toHaveLength(5);
    });
  });

  describe('localization', () => {
    it('renders localized section labels for the map locale', () => {
      set({ locale: 'ms' });
      expect([...el.querySelectorAll('h3')].map((h) => h.textContent?.trim())).toEqual([
        'Bawah',
        'Balkoni',
      ]);
    });
  });

  describe('selection', () => {
    it('round-trips through onSelectionChange', () => {
      fireEvent.click(seat('A1'));
      expect(host.selection).toEqual(['A1']);
      expect(seat('A1').getAttribute('aria-pressed')).toBe('true');

      fireEvent.click(seat('A1'));
      expect(host.selection).toEqual([]);
    });

    it('honors a selection pushed in from the parent', () => {
      set({ selection: ['A2'] });
      expect(seat('A2').getAttribute('aria-pressed')).toBe('true');
    });

    it('selects a companion pair together (§4.6)', () => {
      fireEvent.click(seat('L1'));
      expect([...host.selection].sort()).toEqual(['L1', 'L2']);
    });

    it('never mutates the seats — no in-place selected flag', () => {
      const before = host.map;
      fireEvent.click(seat('A1'));
      expect(host.map).toBe(before);
      expect(JSON.stringify(before.sections[0]!.seats)).not.toContain('selected');
    });

    it('owns the selection when uncontrolled, and reports every change', () => {
      const onSelectionChange = vi.fn();
      const view = render(
        <KerusiSeatmap
          map={VENUE}
          defaultSelection={['A2']}
          onSelectionChange={onSelectionChange}
        />,
      );
      const pick = (id: string) =>
        view.container.querySelector<SVGGElement>(`[data-seat-id="${id}"]`)!;

      expect(pick('A2').getAttribute('aria-pressed')).toBe('true');

      fireEvent.click(pick('A1'));
      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      expect(onSelectionChange).toHaveBeenLastCalledWith(['A2', 'A1']);
      // No `selection` prop, so the component committed it itself.
      expect(pick('A1').getAttribute('aria-pressed')).toBe('true');
    });

    it('does not move a controlled selection the parent refuses to commit', () => {
      const view = render(<KerusiSeatmap map={VENUE} selection={[]} onSelectionChange={vi.fn()} />);
      const pick = view.container.querySelector<SVGGElement>('[data-seat-id="A1"]')!;
      fireEvent.click(pick);
      expect(pick.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('disallowed reasons', () => {
    const withStatus = (id: string, status: 'booked' | 'held' | 'blocked') =>
      set({
        state: {
          kerusi: '1.0',
          mapId: 'venue',
          updatedAt: '2026-08-19T10:00:00Z',
          seats: { [id]: { status } },
        },
      });

    it('reports the seat status as the reason', () => {
      for (const status of ['booked', 'held', 'blocked'] as const) {
        withStatus('A1', status);
        fireEvent.click(seat('A1'));
        expect(disallowed!.reason).toBe(status);
        expect(host.selection).toEqual([]);
      }
    });

    it('marks an unavailable seat aria-disabled', () => {
      withStatus('A1', 'booked');
      expect(seat('A1').getAttribute('aria-disabled')).toBe('true');
      expect(seat('A2').getAttribute('aria-disabled')).toBe('false');
    });

    it('reports max-selection, counting the companion closure', () => {
      set({ maxSelection: 1 });
      fireEvent.click(seat('L1'));
      expect(disallowed!.reason).toBe('max-selection');
    });

    it('reports companion-unavailable when the pair cannot be completed', () => {
      withStatus('L2', 'booked');
      fireEvent.click(seat('L1'));
      expect(disallowed!.reason).toBe('companion-unavailable');
    });
  });

  describe('accessible names', () => {
    it('includes position, type, price, status and accessibility', () => {
      const withA11y: KerusiMap = JSON.parse(JSON.stringify(VENUE));
      withA11y.sections[0]!.seats[0]!.accessibility = {
        wheelchairAccessible: true,
        transferArmrest: 'left',
      };
      set({ map: withA11y });

      const label = seat('A1').getAttribute('aria-label')!;
      expect(label).toContain('Row A, seat 1');
      expect(label).toContain('Standard');
      expect(label).toContain('available');
      expect(label).toContain('wheelchair accessible');
      expect(label).toContain('transfer armrest left');
    });

    it('announces the price for a priced seat', () => {
      expect(seat('L1').getAttribute('aria-label')).toContain('90.00');
    });

    it('marks the seat groups as buttons', () => {
      expect(seats().every((g) => g.getAttribute('role') === 'button')).toBe(true);
    });

    it('carries a polite live region for announcements', () => {
      expect(el.querySelector('[aria-live="polite"]')).not.toBeNull();
    });

    it('announces the running selection', () => {
      fireEvent.click(seat('A1'));
      expect(el.querySelector('[aria-live="polite"]')!.textContent).toContain('1 seat');
    });

    it('re-announces a repeated message, which an unchanged live region would swallow', () => {
      const live = () => el.querySelector('[aria-live="polite"]')!.textContent!;
      set({
        state: {
          kerusi: '1.0',
          mapId: 'venue',
          updatedAt: 't',
          seats: { A1: { status: 'booked' } },
        },
      });

      // The same refusal, twice running.
      fireEvent.click(seat('A1'));
      const first = live();
      expect(first).toContain('booked');

      fireEvent.click(seat('A1'));
      // Same words — but not the same string, or a live region that saw no
      // text change would stay silent the second time. The difference is a
      // zero-width space, which no screen reader speaks.
      const strip = (text: string) => text.replace(/\u200b/g, '');
      expect(strip(live())).toBe(strip(first));
      expect(live()).not.toBe(first);
    });
  });

  describe('keyboard navigation', () => {
    const key = (id: string, init: KeyboardEventInit) => fireEvent.keyDown(seat(id), init);

    it('gives EACH section its own tab stop, so every section is reachable', () => {
      // A single map-wide tab stop would strand the balcony: arrow keys never
      // cross a section boundary, so Tab is the only way in.
      expect(tabStops()).toEqual(['A1', 'L1']);
    });

    it('moves only the tab stop of the section being navigated', () => {
      key('A1', { key: 'ArrowRight' });
      expect(tabStops()).toEqual(['A2', 'L1']);
    });

    it('moves the tab stop with the arrow keys, skipping the aisle column', () => {
      key('A1', { key: 'ArrowRight' });
      expect(seat('A2').getAttribute('tabindex')).toBe('0');

      // A2 is column 2 and A4 is column 4 — the aisle is stepped across.
      key('A2', { key: 'ArrowRight' });
      expect(seat('A4').getAttribute('tabindex')).toBe('0');
    });

    it('stops at the end of a row', () => {
      key('A1', { key: 'End' });
      expect(seat('A4').getAttribute('tabindex')).toBe('0');

      key('A4', { key: 'ArrowRight' });
      expect(seat('A4').getAttribute('tabindex')).toBe('0');
    });

    it('jumps to the row ends with Home and End', () => {
      key('A2', { key: 'End' });
      expect(seat('A4').getAttribute('tabindex')).toBe('0');

      key('A4', { key: 'Home' });
      expect(seat('A1').getAttribute('tabindex')).toBe('0');
    });

    it('jumps to the section ends with Ctrl+Home, Ctrl+End and the page keys', () => {
      key('A2', { key: 'End', ctrlKey: true });
      expect(seat('A4').getAttribute('tabindex')).toBe('0');

      key('A4', { key: 'Home', ctrlKey: true });
      expect(seat('A1').getAttribute('tabindex')).toBe('0');

      key('A1', { key: 'PageDown' });
      expect(seat('A4').getAttribute('tabindex')).toBe('0');

      key('A4', { key: 'PageUp' });
      expect(seat('A1').getAttribute('tabindex')).toBe('0');
    });

    it('toggles with Enter and Space', () => {
      key('A1', { key: 'Enter' });
      expect(host.selection).toEqual(['A1']);

      key('A1', { key: ' ' });
      expect(host.selection).toEqual([]);
    });

    it('clears the selection with Escape', () => {
      set({ selection: ['A1', 'A2'] });
      key('A1', { key: 'Escape' });
      expect(host.selection).toEqual([]);
    });
  });

  describe('validation', () => {
    it('emits no issues for a conformant document', () => {
      expect(issues).toEqual([]);
    });

    it('reports violations and still renders, in collect mode', () => {
      const broken: KerusiMap = JSON.parse(JSON.stringify(VENUE));
      // A grid section whose seat carries coordinates — invalid under §4.5.
      broken.sections[0]!.seats[0] = { id: 'A1', x: 10, y: 10, type: 'standard' };
      set({ map: broken });

      expect(issues.map((v) => v.rule)).toContain('section-layout-grid');
      expect(seats().length).toBeGreaterThan(0);
    });

    it('throws during render in throw mode, where an error boundary can catch it', () => {
      const broken: KerusiMap = JSON.parse(JSON.stringify(VENUE));
      broken.sections[0]!.seats[0] = { id: 'A1', x: 10, y: 10, type: 'standard' };
      // React logs the boundary-less error itself; the throw is the assertion.
      const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => render(<KerusiSeatmap map={broken} validate="throw" />)).toThrow(
        /section-layout-grid|grid/i,
      );
      quiet.mockRestore();
    });
  });

  describe('legend', () => {
    it('is off by default and renders on request', () => {
      expect(el.querySelector('.kerusi-legend')).toBeNull();
      set({ showLegend: true });

      const labels = [...el.querySelectorAll('.kerusi-legend__label')].map((n) =>
        n.textContent?.trim(),
      );
      expect(labels).toContain('Standard');
      expect(labels).toContain('Sofa');
      expect(labels).toContain('Available');
    });

    it('takes its swatch from SeatType.color, matching the seat fill', () => {
      set({ showLegend: true });
      const swatch = el.querySelector<HTMLElement>('.kerusi-legend__swatch')!;
      expect(box('A1').style.fill).toBe('rgb(58, 143, 99)');
      expect(swatch.style.background).toBe('rgb(58, 143, 99)');
    });

    it('draws every availability swatch as the seat glyph, not a flat colour', () => {
      // Shape carries status now, so a flat swatch would teach a cue the map
      // itself no longer uses — every status row draws the glyph instead.
      set({ showLegend: true });
      const glyphFor = (label: string) =>
        [...el.querySelectorAll('.kerusi-legend__item')]
          .find((li) => li.querySelector('.kerusi-legend__label')?.textContent?.trim() === label)!
          .querySelector('.kerusi-legend__swatch--glyph')!;

      expect(glyphFor('Available').tagName.toLowerCase()).toBe('svg');

      // Body only: nothing occupies an available or a blocked seat.
      expect(glyphFor('Available').querySelectorAll('path')).toHaveLength(1);
      expect(glyphFor('Blocked').querySelectorAll('path')).toHaveLength(1);

      // Frame + core + occupant: the one status drawn from two tones.
      expect(glyphFor('Selected').querySelectorAll('path')).toHaveLength(3);

      // Body + wash + occupant.
      expect(glyphFor('On hold').querySelectorAll('path')).toHaveLength(3);
      expect(glyphFor('On hold').querySelector('.kerusi-legend__occupant--held')).not.toBeNull();
      expect(glyphFor('Booked').querySelectorAll('path')).toHaveLength(3);
      expect(glyphFor('Booked').querySelector('.kerusi-legend__occupant--booked')).not.toBeNull();
    });
  });

  describe('seat fills', () => {
    it('colors an available seat from its SeatType.color (§4.7)', () => {
      expect(box('A1').style.fill).toBe('rgb(58, 143, 99)');
    });

    it('routes theme colors through a CSS custom property, keeping the input as fallback', () => {
      // The sofa type declares no color, so L1's fill comes from the theme.
      expect(box('L1').style.fill).toBe('var(--kerusi-available-bg, #76d75d)');
    });

    it('publishes focusRing, so the focus ring is themable', () => {
      // Under `--kerusi-focus-ring`, which a stylesheet may set to win outright.
      expect(svgs()[0]!.style.getPropertyValue('--kerusi-focus-ring-input')).toBe('#1b1f27');
    });
  });

  describe('status marks', () => {
    // Colour means seat type; shape means status (see the doc comment on
    // seatFill). A held or booked seat used to lose its type colour to a status
    // hue, exactly where a busy map needed the type colour most, so these
    // assert the opposite: the colour stays, and status is read from a wash
    // plus an occupant figure instead.

    const statusOf = (status: 'held' | 'booked' | 'blocked') =>
      set({ state: { kerusi: '1.0', mapId: 'venue', updatedAt: 't', seats: { A1: { status } } } });

    it('keeps its type color when held, marking the hold with a wash and a hollow occupant', () => {
      statusOf('held');
      expect(box('A1').style.fill).toBe('rgb(58, 143, 99)');
      expect(seat('A1').querySelector('.kerusi-seat__wash')).not.toBeNull();
      const occupant = seat('A1').querySelector<SVGPathElement>('.kerusi-seat__occupant--held')!;
      expect(occupant).not.toBeNull();
      expect(occupant.style.fill).toBe('none');
      expect(occupant.style.stroke).not.toBe('none');
    });

    it('keeps its type color when booked, marking the sale with a wash and a solid occupant', () => {
      statusOf('booked');
      expect(box('A1').style.fill).toBe('rgb(58, 143, 99)');
      expect(seat('A1').querySelector('.kerusi-seat__wash')).not.toBeNull();
      const occupant = seat('A1').querySelector<SVGPathElement>('.kerusi-seat__occupant--booked')!;
      expect(occupant).not.toBeNull();
      expect(occupant.style.stroke).toBe('none');
      expect(occupant.style.fill).not.toBe('none');
    });

    it('draws no wash and no occupant for a blocked seat, since nobody is there', () => {
      statusOf('blocked');
      expect(seat('A1').querySelector('.kerusi-seat__wash')).toBeNull();
      expect(seat('A1').querySelector('.kerusi-seat__occupant')).toBeNull();
    });

    it('lets selection win the seat colour outright, the one deliberate exception', () => {
      set({ selection: ['A1'] });
      expect(box('A1').style.fill).toBe('var(--kerusi-selected-bg, #7854af)');
      expect(core('A1').style.fill).toBe('var(--kerusi-selected-fg, #f3ecff)');
    });
  });

  describe('the seat glyph', () => {
    it('gives every seat a tapered body, so facing is visible on the shape', () => {
      const boxes = seats().map((g) => g.querySelector<SVGPathElement>('.kerusi-seat__box')!);
      expect(boxes).toHaveLength(seats().length);
      for (const b of boxes) {
        expect(b.tagName.toLowerCase()).toBe('path');
        // Four rounded corners: an L onto each incoming edge, an A arc onto each outgoing one.
        expect(b.getAttribute('d')?.match(/A /g)).toHaveLength(4);
      }
    });

    it('marks a selected seat by shape as well as color', () => {
      expect(seat('A1').querySelector('.kerusi-seat__occupant')).toBeNull();
      expect(seat('A1').querySelector('.kerusi-seat__core')).toBeNull();

      set({ selection: ['A1'] });

      expect(seat('A1').querySelector('.kerusi-seat__occupant--selected')).not.toBeNull();
      expect(seat('A1').querySelector('.kerusi-seat__core')).not.toBeNull();
      expect(seat('A2').querySelector('.kerusi-seat__occupant')).toBeNull();
    });

    it('draws a selected seat from two tones, so one always separates from the page', () => {
      set({ selection: ['A1'] });

      // The whole point of the treatment: a selected seat carries a light tone
      // and a dark one at once, so it never depends on which way the consumer
      // themed the page around it.
      const frame = box('A1').style.fill;
      const plate = core('A1').style.fill;
      expect(frame).toContain('--kerusi-selected-bg');
      expect(plate).toContain('--kerusi-selected-fg');
      expect(frame).not.toBe(plate);

      // Everything over the core takes the frame's colour, not the core's.
      const label = seat('A1').querySelector<SVGTextElement>('.kerusi-seat__label')!;
      expect(label.style.fill).toBe('var(--kerusi-selected-bg, #7854af)');
      expect(label.style.stroke).toBe('var(--kerusi-selected-fg, #f3ecff)');
    });

    it('leaves an unselected seat’s label unhaloed', () => {
      const label = seat('A1').querySelector<SVGTextElement>('.kerusi-seat__label')!;
      expect(label.style.stroke).toBe('none');
      expect(label.getAttribute('stroke-width')).toBe('0');
    });

    it('leans the occupant with the seat while the number stays upright', () => {
      set({ selection: ['A1'] });
      const g = seat('A1');
      // The label cancels the group's rotation; the occupant inherits it.
      expect(g.querySelector('.kerusi-seat__occupant')!.getAttribute('transform')).toBeNull();
      expect(g.querySelector('.kerusi-seat__label')).not.toBeNull();
    });

    it('keeps the selected core strictly inside the frame', () => {
      set({ selection: ['A1'] });
      const bodyPoints = pathPoints(box('A1').getAttribute('d')!);
      const corePoints = pathPoints(core('A1').getAttribute('d')!);
      expect(Math.min(...corePoints)).toBeGreaterThan(Math.min(...bodyPoints));
      expect(Math.max(...corePoints)).toBeLessThan(Math.max(...bodyPoints));
    });

    it('keeps a selected seat’s occupant on the core, not across the frame', () => {
      set({ selection: ['A1'] });
      const corePoints = pathPoints(core('A1').getAttribute('d')!);
      const occupant = seat('A1').querySelector<SVGPathElement>('.kerusi-seat__occupant')!;
      const occupantPoints = pathPoints(occupant.getAttribute('d')!);
      // A figure tinted `selectedBg` that crossed onto a frame filled
      // `selectedBg` would read as a hard nub at the hips.
      expect(Math.min(...occupantPoints)).toBeGreaterThan(Math.min(...corePoints));
      expect(Math.max(...occupantPoints)).toBeLessThan(Math.max(...corePoints));
    });

    it('leaves a booked occupant on the seat’s own box, not inset like a selected one', () => {
      // Only a selected seat has a core to move its marks into. Collapsing that
      // conditional into an unconditional inset would silently shrink every
      // other status' figure.
      statusMark('booked');
      const booked = pathPoints(
        seat('A1').querySelector<SVGPathElement>('.kerusi-seat__occupant')!.getAttribute('d')!,
      );

      set({
        state: { kerusi: '1.0', mapId: 'venue', updatedAt: 't', seats: {} },
        selection: ['A1'],
      });
      const picked = pathPoints(
        seat('A1').querySelector<SVGPathElement>('.kerusi-seat__occupant')!.getAttribute('d')!,
      );

      const spread = (points: number[]) => Math.max(...points) - Math.min(...points);
      expect(spread(picked)).toBeLessThan(spread(booked));
    });

    function statusMark(status: 'held' | 'booked' | 'blocked') {
      set({ state: { kerusi: '1.0', mapId: 'venue', updatedAt: 't', seats: { A1: { status } } } });
    }
  });
});
