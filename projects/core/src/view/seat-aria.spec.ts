import { describe, expect, it } from 'vitest';
import { KerusiMap, Seat } from '../kerusi/kerusi-map.model.js';
import { KerusiState } from '../kerusi/kerusi-state.model.js';
import { buildRenderModel } from '../render/build-render-model.js';
import { disallowedAnnouncement, seatAriaLabel } from './seat-aria.js';

const mapWith = (seat: Seat): KerusiMap => ({
  kerusi: '1.0',
  id: 'm',
  legend: [{ id: 'business', label: { en: 'Business class' }, defaultPriceTier: 'biz' }],
  priceTiers: [{ id: 'biz', price: { amount: 45000, currency: 'MYR' } }],
  sections: [
    {
      id: 'cabin',
      layout: 'grid',
      rows: [{ id: '12', label: '12' }],
      seats: [seat],
    },
  ],
});

const labelFor = (seat: Seat, state?: KerusiState) =>
  seatAriaLabel(buildRenderModel(mapWith(seat), state).seatsById.get(seat.id)!, 'en');

const BASE: Seat = { id: '12A', label: 'A', row: '12', col: 1, type: 'business' };

describe('seatAriaLabel', () => {
  it('leads with the position, then type, price and status', () => {
    // Intl separates the currency code from the amount with U+00A0, so match
    // on the parts rather than a literal that depends on which space it used.
    expect(labelFor(BASE)).toMatch(/^Row 12, seat A, Business class, MYR.450\.00, available\.$/);
  });

  it('omits the row when the seat has none', () => {
    const rowless: Seat = { id: 'S1', label: '1', col: 1, type: 'business' };
    expect(labelFor(rowless)).toContain('Seat 1,');
  });

  it('says so when a seat carries no price — a valid state (§4.9)', () => {
    const unpriced = buildRenderModel({
      ...mapWith(BASE),
      priceTiers: undefined,
      legend: [{ id: 'business', label: 'Business class' }],
    }).seatsById.get('12A')!;
    expect(seatAriaLabel(unpriced, 'en')).toContain('no price');
  });

  it('announces each unavailable status distinctly', () => {
    const state = (status: 'booked' | 'blocked' | 'held', holdExpires?: string): KerusiState => ({
      kerusi: '1.0',
      mapId: 'm',
      updatedAt: 't',
      seats: { '12A': { status, holdExpires } },
    });
    expect(labelFor(BASE, state('booked'))).toContain('booked, unavailable');
    expect(labelFor(BASE, state('blocked'))).toContain('blocked by the venue, unavailable');
    expect(labelFor(BASE, state('held'))).toContain('on hold, unavailable');
  });

  it('includes the hold expiry time when the document supplies one', () => {
    const held: KerusiState = {
      kerusi: '1.0',
      mapId: 'm',
      updatedAt: 't',
      seats: { '12A': { status: 'held', holdExpires: '2026-08-19T09:24:00Z' } },
    };
    expect(labelFor(BASE, held)).toMatch(/on hold until .+, unavailable/);
  });

  it('announces every §4.3.4 accessibility property', () => {
    const label = labelFor({
      ...BASE,
      accessibility: {
        wheelchairAccessible: true,
        transferArmrest: 'left',
        aisleChairCompatible: true,
        companionRequired: true,
      },
    });
    expect(label).toContain('wheelchair accessible');
    expect(label).toContain('transfer armrest left');
    expect(label).toContain('aisle chair compatible');
    expect(label).toContain('companion seat required');
  });

  it('says nothing about accessibility when the seat declares none', () => {
    expect(labelFor(BASE)).not.toMatch(/wheelchair|armrest|companion/);
  });

  it('appends descriptive attributes last', () => {
    const label = labelFor({ ...BASE, attributes: ['window', 'exit-row'] });
    expect(label.endsWith('window, exit-row.')).toBe(true);
  });

  it('leaves selection state to aria-pressed, so it is not announced twice', () => {
    expect(labelFor(BASE)).not.toContain('selected');
  });

  it('localizes the price to the given locale', () => {
    const seat = buildRenderModel(mapWith(BASE)).seatsById.get('12A')!;
    // ms-MY renders MYR as "RM"; en does not.
    expect(seatAriaLabel(seat, 'ms-MY')).toContain('RM');
  });
});

describe('disallowedAnnouncement', () => {
  const seat = () => buildRenderModel(mapWith(BASE)).seatsById.get('12A')!;

  it('names the seat and the reason', () => {
    expect(disallowedAnnouncement(seat(), 'held')).toBe(
      'Row 12, seat A is held by another customer.',
    );
    expect(disallowedAnnouncement(seat(), 'max-selection')).toContain(
      'would exceed the seat limit',
    );
    expect(disallowedAnnouncement(seat(), 'companion-unavailable')).toContain(
      'must be booked with a seat that is unavailable',
    );
  });
});
