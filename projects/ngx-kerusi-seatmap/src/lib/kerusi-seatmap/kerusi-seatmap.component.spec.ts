import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { KerusiMap } from '../kerusi/kerusi-map.model';
import { KerusiState } from '../kerusi/kerusi-state.model';
import { KerusiViolation } from '../kerusi/kerusi-violation';
import { KerusiSeatmapComponent, SeatDisallowed } from './kerusi-seatmap.component';

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

@Component({
  imports: [KerusiSeatmapComponent],
  template: `
    <kerusi-seatmap
      [map]="map()"
      [state]="state()"
      [(selection)]="selection"
      [locale]="locale()"
      [showLegend]="showLegend()"
      [maxSelection]="maxSelection()"
      (seatDisallowed)="disallowed.set($event)"
      (validationIssues)="issues.set($event)"
    />
  `,
})
class Host {
  readonly map = signal<KerusiMap>(VENUE);
  readonly state = signal<KerusiState | undefined>(undefined);
  readonly selection = signal<readonly string[]>([]);
  readonly locale = signal<string | undefined>(undefined);
  readonly showLegend = signal(false);
  readonly maxSelection = signal<number | undefined>(undefined);
  readonly disallowed = signal<SeatDisallowed | undefined>(undefined);
  readonly issues = signal<readonly KerusiViolation[]>([]);
}

describe('KerusiSeatmapComponent', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  const seats = () => [...el.querySelectorAll<SVGGElement>('g.kerusi-seat')];
  const seat = (id: string) => el.querySelector<SVGGElement>(`[data-seat-id="${id}"]`)!;
  const svgs = () => [...el.querySelectorAll<SVGSVGElement>('svg.kerusi-section-svg')];
  const box = (id: string) => seat(id).querySelector<SVGPathElement>('.kerusi-seat__box')!;

  /**
   * Every on-curve point in a `d` string, as a flat `[x0, y0, x1, y1, ...]`
   * list — mirrors the helper in `seat-shapes.spec.ts`. Skips an `A`
   * command's `rx ry x-axis-rotation large-arc-flag sweep-flag` numbers,
   * which are not coordinates and are frequently 0 — indistinguishable from a
   * real minimum if left in.
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
      expect(balcony[2] / balcony[3]).toBeCloseTo(3, 5);
      expect(stalls[2] / stalls[3]).not.toBeCloseTo(3, 5);
    });

    it('links each section to its heading for assistive technology', () => {
      const section = el.querySelector('.kerusi-seatmap__section')!;
      const id = section.getAttribute('aria-labelledby')!;
      expect(el.querySelector(`[id="${id}"]`)!.textContent).toContain('Stalls');
    });

    it('renders a grid section element, which the pre-1.0 renderer ignored', () => {
      const exits = el.querySelectorAll('.kerusi-element--exit');
      expect(exits).toHaveLength(1);
    });

    it('emits no filler node for the skipped aisle column (§4.3.2)', () => {
      expect(seats()).toHaveLength(5);
    });
  });

  describe('localization', () => {
    it('renders localized section labels for the map locale', () => {
      host.locale.set('ms');
      fixture.detectChanges();
      expect([...el.querySelectorAll('h3')].map((h) => h.textContent?.trim())).toEqual([
        'Bawah',
        'Balkoni',
      ]);
    });
  });

  describe('selection', () => {
    it('round-trips through the two-way binding', () => {
      seat('A1').dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
      expect(host.selection()).toEqual(['A1']);
      expect(seat('A1').getAttribute('aria-pressed')).toBe('true');

      seat('A1').dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
      expect(host.selection()).toEqual([]);
    });

    it('honors a selection pushed in from the parent', () => {
      host.selection.set(['A2']);
      fixture.detectChanges();
      expect(seat('A2').getAttribute('aria-pressed')).toBe('true');
    });

    it('selects a companion pair together (§4.6)', () => {
      seat('L1').dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
      expect([...host.selection()].sort()).toEqual(['L1', 'L2']);
    });

    it('never mutates the seats — no in-place selected flag', () => {
      const before = host.map();
      seat('A1').dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
      expect(host.map()).toBe(before);
      expect(JSON.stringify(before.sections[0].seats)).not.toContain('selected');
    });
  });

  describe('disallowed reasons', () => {
    const withStatus = (id: string, status: 'booked' | 'held' | 'blocked') => {
      host.state.set({
        kerusi: '1.0',
        mapId: 'venue',
        updatedAt: '2026-08-19T10:00:00Z',
        seats: { [id]: { status } },
      });
      fixture.detectChanges();
    };

    it('reports the seat status as the reason', () => {
      for (const status of ['booked', 'held', 'blocked'] as const) {
        withStatus('A1', status);
        seat('A1').dispatchEvent(new MouseEvent('click'));
        fixture.detectChanges();
        expect(host.disallowed()!.reason).toBe(status);
        expect(host.selection()).toEqual([]);
      }
    });

    it('marks an unavailable seat aria-disabled', () => {
      withStatus('A1', 'booked');
      expect(seat('A1').getAttribute('aria-disabled')).toBe('true');
      expect(seat('A2').getAttribute('aria-disabled')).toBe('false');
    });

    it('reports max-selection, counting the companion closure', () => {
      host.maxSelection.set(1);
      fixture.detectChanges();
      seat('L1').dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
      expect(host.disallowed()!.reason).toBe('max-selection');
    });

    it('reports companion-unavailable when the pair cannot be completed', () => {
      withStatus('L2', 'booked');
      seat('L1').dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
      expect(host.disallowed()!.reason).toBe('companion-unavailable');
    });
  });

  describe('accessible names', () => {
    it('includes position, type, price, status and accessibility', () => {
      const withA11y: KerusiMap = JSON.parse(JSON.stringify(VENUE));
      withA11y.sections[0].seats[0].accessibility = {
        wheelchairAccessible: true,
        transferArmrest: 'left',
      };
      host.map.set(withA11y);
      fixture.detectChanges();

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
  });

  describe('keyboard navigation', () => {
    const key = (id: string, init: KeyboardEventInit) =>
      seat(id).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));

    it('gives EACH section its own tab stop, so every section is reachable', () => {
      // A single map-wide tab stop would strand the balcony: arrow keys never
      // cross a section boundary, so Tab is the only way in.
      const stops = seats()
        .filter((g) => g.getAttribute('tabindex') === '0')
        .map((g) => g.getAttribute('data-seat-id'));
      expect(stops).toEqual(['A1', 'L1']);
    });

    it('moves only the tab stop of the section being navigated', () => {
      key('A1', { key: 'ArrowRight' });
      fixture.detectChanges();
      const stops = seats()
        .filter((g) => g.getAttribute('tabindex') === '0')
        .map((g) => g.getAttribute('data-seat-id'));
      expect(stops).toEqual(['A2', 'L1']);
    });

    it('moves the tab stop with the arrow keys, skipping the aisle column', () => {
      key('A1', { key: 'ArrowRight' });
      fixture.detectChanges();
      expect(seat('A2').getAttribute('tabindex')).toBe('0');

      // A2 is column 2 and A4 is column 4 — the aisle is stepped across.
      key('A2', { key: 'ArrowRight' });
      fixture.detectChanges();
      expect(seat('A4').getAttribute('tabindex')).toBe('0');
    });

    it('stops at the end of a row', () => {
      key('A1', { key: 'End' });
      fixture.detectChanges();
      expect(seat('A4').getAttribute('tabindex')).toBe('0');

      key('A4', { key: 'ArrowRight' });
      fixture.detectChanges();
      expect(seat('A4').getAttribute('tabindex')).toBe('0');
    });

    it('jumps to the row ends with Home and End', () => {
      key('A2', { key: 'End' });
      fixture.detectChanges();
      expect(seat('A4').getAttribute('tabindex')).toBe('0');

      key('A4', { key: 'Home' });
      fixture.detectChanges();
      expect(seat('A1').getAttribute('tabindex')).toBe('0');
    });

    it('toggles with Enter and Space', () => {
      key('A1', { key: 'Enter' });
      fixture.detectChanges();
      expect(host.selection()).toEqual(['A1']);

      key('A1', { key: ' ' });
      fixture.detectChanges();
      expect(host.selection()).toEqual([]);
    });

    it('clears the selection with Escape', () => {
      host.selection.set(['A1', 'A2']);
      fixture.detectChanges();
      key('A1', { key: 'Escape' });
      fixture.detectChanges();
      expect(host.selection()).toEqual([]);
    });
  });

  describe('validation', () => {
    it('emits no issues for a conformant document', () => {
      expect(host.issues()).toEqual([]);
    });

    it('reports violations and still renders, in collect mode', () => {
      const broken: KerusiMap = JSON.parse(JSON.stringify(VENUE));
      // A grid section whose seat carries coordinates — invalid under §4.5.
      broken.sections[0].seats[0] = { id: 'A1', x: 10, y: 10, type: 'standard' };
      host.map.set(broken);
      fixture.detectChanges();

      expect(host.issues().map((v) => v.rule)).toContain('section-layout-grid');
      expect(seats().length).toBeGreaterThan(0);
    });
  });

  describe('legend', () => {
    it('is off by default and renders on request', () => {
      expect(el.querySelector('kerusi-legend')).toBeNull();
      host.showLegend.set(true);
      fixture.detectChanges();

      const labels = [...el.querySelectorAll('.kerusi-legend__label')].map((n) =>
        n.textContent?.trim(),
      );
      expect(labels).toContain('Standard');
      expect(labels).toContain('Sofa');
      expect(labels).toContain('Available');
    });

    it('takes its swatch from SeatType.color, matching the seat fill', () => {
      host.showLegend.set(true);
      fixture.detectChanges();
      const swatch = el.querySelector<HTMLElement>('.kerusi-legend__swatch')!;
      expect(box('A1').style.fill).toBe('rgb(58, 143, 99)');
      expect(swatch.style.background).toBe('rgb(58, 143, 99)');
    });

    it('draws every availability swatch as the seat glyph, not a flat colour', () => {
      // Shape carries status now, so a flat swatch would teach a cue the map
      // itself no longer uses — every status row draws the glyph instead.
      host.showLegend.set(true);
      fixture.detectChanges();
      const glyphFor = (label: string) =>
        [...el.querySelectorAll('.kerusi-legend__item')]
          .find((li) => li.querySelector('.kerusi-legend__label')?.textContent?.trim() === label)!
          .querySelector('.kerusi-legend__swatch--glyph')!;

      expect(glyphFor('Available').tagName.toLowerCase()).toBe('svg');

      // Body only: nothing occupies an available or a blocked seat.
      expect(glyphFor('Available').querySelectorAll('path')).toHaveLength(1);
      expect(glyphFor('Blocked').querySelectorAll('path')).toHaveLength(1);

      // Body + ring + occupant: the one status with a ring.
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
      expect(svgs()[0].style.getPropertyValue('--kerusi-focus-ring-input')).toBe('#1b1f27');
    });
  });

  describe('status marks', () => {
    // Colour means seat type; shape means status (see the doc comment on
    // seatFill). A held or booked seat used to lose its type colour to a
    // status hue, exactly where a busy map needed the type colour most, so
    // these assert the opposite: the colour stays, and status is read from a
    // wash plus an occupant figure instead.

    it('keeps its type color when held, marking the hold with a wash and a hollow occupant', () => {
      host.state.set({
        kerusi: '1.0',
        mapId: 'venue',
        updatedAt: 't',
        seats: { A1: { status: 'held' } },
      });
      fixture.detectChanges();
      expect(box('A1').style.fill).toBe('rgb(58, 143, 99)');
      expect(seat('A1').querySelector('.kerusi-seat__wash')).not.toBeNull();
      const occupant = seat('A1').querySelector<SVGPathElement>('.kerusi-seat__occupant--held')!;
      expect(occupant).not.toBeNull();
      expect(occupant.style.fill).toBe('none');
      expect(occupant.style.stroke).not.toBe('none');
    });

    it('keeps its type color when booked, marking the sale with a wash and a solid occupant', () => {
      host.state.set({
        kerusi: '1.0',
        mapId: 'venue',
        updatedAt: 't',
        seats: { A1: { status: 'booked' } },
      });
      fixture.detectChanges();
      expect(box('A1').style.fill).toBe('rgb(58, 143, 99)');
      expect(seat('A1').querySelector('.kerusi-seat__wash')).not.toBeNull();
      const occupant = seat('A1').querySelector<SVGPathElement>('.kerusi-seat__occupant--booked')!;
      expect(occupant).not.toBeNull();
      expect(occupant.style.stroke).toBe('none');
      expect(occupant.style.fill).not.toBe('none');
    });

    it('draws no wash and no occupant for a blocked seat, since nobody is there', () => {
      host.state.set({
        kerusi: '1.0',
        mapId: 'venue',
        updatedAt: 't',
        seats: { A1: { status: 'blocked' } },
      });
      fixture.detectChanges();
      expect(seat('A1').querySelector('.kerusi-seat__wash')).toBeNull();
      expect(seat('A1').querySelector('.kerusi-seat__occupant')).toBeNull();
    });

    it('lets selection win the fill outright, the one deliberate exception', () => {
      host.selection.set(['A1']);
      fixture.detectChanges();
      expect(box('A1').style.fill).toBe('var(--kerusi-selected-bg, #7854af)');
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
      expect(seat('A1').querySelector('.kerusi-seat__ring')).toBeNull();

      host.selection.set(['A1']);
      fixture.detectChanges();

      expect(seat('A1').querySelector('.kerusi-seat__occupant--selected')).not.toBeNull();
      expect(seat('A1').querySelector('.kerusi-seat__ring')).not.toBeNull();
      expect(seat('A2').querySelector('.kerusi-seat__occupant')).toBeNull();
    });

    it('leans the occupant with the seat while the number stays upright', () => {
      host.selection.set(['A1']);
      fixture.detectChanges();
      const g = seat('A1');
      // The label cancels the group's rotation; the occupant inherits it.
      expect(g.querySelector('.kerusi-seat__occupant')!.getAttribute('transform')).toBeNull();
      expect(g.querySelector('.kerusi-seat__label')).not.toBeNull();
    });

    it('keeps the selected ring inside the seat body', () => {
      host.selection.set(['A1']);
      fixture.detectChanges();
      const ring = seat('A1').querySelector<SVGPathElement>('.kerusi-seat__ring')!;
      const bodyPoints = pathPoints(box('A1').getAttribute('d')!);
      const ringPoints = pathPoints(ring.getAttribute('d')!);
      expect(Math.min(...ringPoints)).toBeGreaterThan(Math.min(...bodyPoints));
      expect(Math.max(...ringPoints)).toBeLessThan(Math.max(...bodyPoints));
    });
  });
});
