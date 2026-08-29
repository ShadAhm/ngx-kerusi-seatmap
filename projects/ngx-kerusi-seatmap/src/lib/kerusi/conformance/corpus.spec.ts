import { describe, expect, it } from 'vitest';
import {
  checkKerusiMap,
  checkKerusiSession,
  checkKerusiState,
  checkKerusiStateDelta,
  errorsOf,
} from '../kerusi-validator';
import { KerusiViolation } from '../kerusi-violation';

// --- valid ------------------------------------------------------------------
import busMinimal from './corpus/bus-minimal.map.kerusi.json';
import cinemaHallA from './corpus/cinema-hallA.map.kerusi.json';
import cinemaHallBGrid from './corpus/cinema-hallB-grid.map.kerusi.json';
import deltaHeartbeat from './corpus/delta-heartbeat.statedelta.kerusi.json';
import deltaRelease from './corpus/delta-release.statedelta.kerusi.json';
import flightB738 from './corpus/flight-b738.map.kerusi.json';
import mixedRowOnlyElement from './corpus/mixed-row-only-element.map.kerusi.json';
import sessionMh123 from './corpus/session-mh123.session.kerusi.json';
import stadiumMixed from './corpus/stadium-mixed.map.kerusi.json';
import stageOnlySection from './corpus/stage-only-section.map.kerusi.json';
import stateByMapId from './corpus/state-by-mapid.state.kerusi.json';
import stateBySessionId from './corpus/state-by-sessionid.state.kerusi.json';
import stateEmpty from './corpus/state-empty.state.kerusi.json';

// --- schema-invalid ---------------------------------------------------------
import badCurrency from './corpus/invalid/bad-currency.map.kerusi.json';
import degenerateAspectRatio from './corpus/invalid/degenerate-aspect-ratio.map.kerusi.json';
import deltaBothScopes from './corpus/invalid/delta-both-scopes.statedelta.kerusi.json';
import deltaMissingChanges from './corpus/invalid/delta-missing-changes.statedelta.kerusi.json';
import freeformSeatWithCol from './corpus/invalid/freeform-seat-with-col.map.kerusi.json';
import gridElementFractionalSpan from './corpus/invalid/grid-element-fractional-span.map.kerusi.json';
import gridElementWithXy from './corpus/invalid/grid-element-with-xy.map.kerusi.json';
import gridSeatWithXy from './corpus/invalid/grid-seat-with-xy.map.kerusi.json';
import mapBadVersion from './corpus/invalid/map-bad-version.map.kerusi.json';
import mapMissingLegend from './corpus/invalid/map-missing-legend.map.kerusi.json';
import mapUnknownToplevelField from './corpus/invalid/map-unknown-toplevel-field.map.kerusi.json';
import mixedElementFractionalSpan from './corpus/invalid/mixed-element-fractional-span.map.kerusi.json';
import mixedSeatMissingXy from './corpus/invalid/mixed-seat-missing-xy.map.kerusi.json';
import nonIntegerAmount from './corpus/invalid/non-integer-amount.map.kerusi.json';
import seatNoPosition from './corpus/invalid/seat-no-position.map.kerusi.json';
import sessionMissingMapId from './corpus/invalid/session-missing-mapid.session.kerusi.json';
import stateBadStatus from './corpus/invalid/state-bad-status.state.kerusi.json';
import stateBadTimestamp from './corpus/invalid/state-bad-timestamp.state.kerusi.json';
import stateBothScopes from './corpus/invalid/state-both-scopes.state.kerusi.json';
import stateIso8601NoSeconds from './corpus/invalid/state-iso8601-no-seconds.state.kerusi.json';
import stateNoScope from './corpus/invalid/state-no-scope.state.kerusi.json';

// --- semantically invalid ---------------------------------------------------
import asymmetricCompanions from './corpus/validator-only/asymmetric-companions.map.kerusi.json';
import danglingPriceTier from './corpus/validator-only/dangling-price-tier.map.kerusi.json';
import danglingRow from './corpus/validator-only/dangling-row.map.kerusi.json';
import danglingSeatType from './corpus/validator-only/dangling-seat-type.map.kerusi.json';
import duplicateSeatIds from './corpus/validator-only/duplicate-seat-ids.map.kerusi.json';
import elementRowspanOverruns from './corpus/validator-only/element-rowspan-overruns.map.kerusi.json';
import inferredLayoutInconsistent from './corpus/validator-only/inferred-layout-inconsistent.map.kerusi.json';
import mixedCurrencies from './corpus/validator-only/mixed-currencies.map.kerusi.json';

/**
 * The example corpus published with the standard, run through this library's
 * validator. See README.md in this folder for where it came from and why a few
 * of the schema-invalid documents are accepted here on purpose.
 *
 * Every file carries the document type it should be checked against in its
 * name, per §8: `*.map.kerusi.json`, `*.state.kerusi.json`,
 * `*.statedelta.kerusi.json`, `*.session.kerusi.json`.
 */

type Check = (doc: unknown) => readonly KerusiViolation[];

const CHECKS: Record<string, Check> = {
  map: checkKerusiMap,
  state: checkKerusiState,
  statedelta: checkKerusiStateDelta,
  session: checkKerusiSession,
};

const checkFor = (name: string): Check => {
  const type = name.split('.').at(-3);
  const check = type ? CHECKS[type] : undefined;
  if (!check) {
    throw new Error(`corpus file "${name}" does not name a document type (§8)`);
  }
  return check;
};

const rulesFor = (name: string, doc: unknown): string[] =>
  errorsOf(checkFor(name)(doc)).map((v) => v.rule);

describe('conformance corpus — valid examples', () => {
  const VALID: Record<string, unknown> = {
    'bus-minimal.map.kerusi.json': busMinimal,
    'cinema-hallA.map.kerusi.json': cinemaHallA,
    'cinema-hallB-grid.map.kerusi.json': cinemaHallBGrid,
    'delta-heartbeat.statedelta.kerusi.json': deltaHeartbeat,
    'delta-release.statedelta.kerusi.json': deltaRelease,
    'flight-b738.map.kerusi.json': flightB738,
    'mixed-row-only-element.map.kerusi.json': mixedRowOnlyElement,
    'session-mh123.session.kerusi.json': sessionMh123,
    'stadium-mixed.map.kerusi.json': stadiumMixed,
    'stage-only-section.map.kerusi.json': stageOnlySection,
    'state-by-mapid.state.kerusi.json': stateByMapId,
    'state-by-sessionid.state.kerusi.json': stateBySessionId,
    'state-empty.state.kerusi.json': stateEmpty,
  };

  for (const [name, doc] of Object.entries(VALID)) {
    it(`accepts ${name}`, () => {
      // Reported in full rather than as a count: a conformant document that
      // trips a rule should say which one.
      expect(checkFor(name)(doc)).toEqual([]);
    });
  }
});

describe('conformance corpus — §7 semantic rules', () => {
  // These satisfy the published JSON Schemas and violate a rule §7 requires a
  // validator to enforce. Asserted by rule id, so a fixture failing for the
  // wrong reason is a failure rather than a pass.
  const SEMANTIC: Record<string, { doc: unknown; rules: string[] }> = {
    'asymmetric-companions.map.kerusi.json': {
      doc: asymmetricCompanions,
      rules: ['companion-symmetry'],
    },
    'dangling-price-tier.map.kerusi.json': {
      doc: danglingPriceTier,
      rules: ['seat-pricetier-reference'],
    },
    'dangling-row.map.kerusi.json': { doc: danglingRow, rules: ['seat-row-reference'] },
    'dangling-seat-type.map.kerusi.json': {
      doc: danglingSeatType,
      rules: ['seat-type-reference'],
    },
    'duplicate-seat-ids.map.kerusi.json': { doc: duplicateSeatIds, rules: ['seat-id-duplicate'] },
    'element-rowspan-overruns.map.kerusi.json': {
      doc: elementRowspanOverruns,
      rules: ['element-row-span-overrun'],
    },
    'inferred-layout-inconsistent.map.kerusi.json': {
      doc: inferredLayoutInconsistent,
      rules: ['section-layout-inconsistent'],
    },
    'mixed-currencies.map.kerusi.json': { doc: mixedCurrencies, rules: ['single-currency'] },
  };

  for (const [name, { doc, rules }] of Object.entries(SEMANTIC)) {
    it(`rejects ${name}`, () => {
      expect(rulesFor(name, doc)).toEqual(rules);
    });
  }
});

describe('conformance corpus — schema-invalid documents', () => {
  const REJECTED: Record<string, { doc: unknown; rules: string[] }> = {
    'delta-both-scopes.statedelta.kerusi.json': {
      doc: deltaBothScopes,
      rules: ['state-scope'],
    },
    'delta-missing-changes.statedelta.kerusi.json': {
      doc: deltaMissingChanges,
      rules: ['delta-changes'],
    },
    'freeform-seat-with-col.map.kerusi.json': {
      doc: freeformSeatWithCol,
      rules: ['section-layout-freeform'],
    },
    'grid-element-fractional-span.map.kerusi.json': {
      doc: gridElementFractionalSpan,
      rules: ['element-span-invalid'],
    },
    'grid-element-with-xy.map.kerusi.json': {
      doc: gridElementWithXy,
      rules: ['element-layout-mismatch'],
    },
    'grid-seat-with-xy.map.kerusi.json': { doc: gridSeatWithXy, rules: ['section-layout-grid'] },
    'map-bad-version.map.kerusi.json': { doc: mapBadVersion, rules: ['map-version-unsupported'] },
    'map-missing-legend.map.kerusi.json': { doc: mapMissingLegend, rules: ['map-legend'] },
    'mixed-element-fractional-span.map.kerusi.json': {
      doc: mixedElementFractionalSpan,
      // Grid-addressed because it carries no x/y, so its height is a cell span
      // even though the section is mixed (§4.4.1).
      rules: ['element-span-invalid'],
    },
    'mixed-seat-missing-xy.map.kerusi.json': {
      doc: mixedSeatMissingXy,
      rules: ['section-layout-mixed'],
    },
    'seat-no-position.map.kerusi.json': {
      doc: seatNoPosition,
      // A seat positioned no way at all also leaves the section's mode
      // uninferable, so §4.3.1 and §4.5 both fire.
      rules: ['seat-position', 'section-layout-inconsistent'],
    },
    'session-missing-mapid.session.kerusi.json': {
      doc: sessionMissingMapId,
      rules: ['session-mapid'],
    },
    'state-bad-timestamp.state.kerusi.json': {
      doc: stateBadTimestamp,
      rules: ['state-updatedat-format'],
    },
    'state-both-scopes.state.kerusi.json': { doc: stateBothScopes, rules: ['state-scope'] },
    'state-iso8601-no-seconds.state.kerusi.json': {
      doc: stateIso8601NoSeconds,
      // The rev 13 case: ISO 8601, and not the RFC 3339 profile §5.1.1 narrows
      // it to. A consumer cannot reliably parse it, so it is rejected.
      rules: ['state-updatedat-format'],
    },
    'state-no-scope.state.kerusi.json': { doc: stateNoScope, rules: ['state-scope'] },
  };

  for (const [name, { doc, rules }] of Object.entries(REJECTED)) {
    it(`rejects ${name}`, () => {
      expect(rulesFor(name, doc)).toEqual(rules);
    });
  }

  /**
   * The fixtures this library accepts, each for a stated reason. See README.md:
   * one is consumer tolerance the spec requires, the rest are producer-side
   * shape constraints the published schemas own and this library does not
   * reimplement.
   */
  const ACCEPTED: Record<string, { doc: unknown; why: string }> = {
    'map-unknown-toplevel-field.map.kerusi.json': {
      doc: mapUnknownToplevelField,
      why: '§2 and §7 require a consumer to ignore members it does not recognize; rejecting this would be the non-conformance',
    },
    'bad-currency.map.kerusi.json': {
      doc: badCurrency,
      why: 'the ISO 4217 letter case is a schema pattern; §4.9 asks this library for one currency across the map, which holds here',
    },
    'degenerate-aspect-ratio.map.kerusi.json': {
      doc: degenerateAspectRatio,
      why: 'the "w:h" pattern is a schema constraint; the renderer falls back to square rather than dividing by zero',
    },
    'non-integer-amount.map.kerusi.json': {
      doc: nonIntegerAmount,
      why: 'minor units being integral is a schema constraint (§4.8); nothing here re-derives the amount',
    },
    'state-bad-status.state.kerusi.json': {
      doc: stateBadStatus,
      why: 'the status enum is a schema constraint; an unknown status renders as its own class rather than corrupting the merge',
    },
  };

  for (const [name, { doc, why }] of Object.entries(ACCEPTED)) {
    it(`accepts ${name} — ${why}`, () => {
      expect(rulesFor(name, doc)).toEqual([]);
    });
  }
});
