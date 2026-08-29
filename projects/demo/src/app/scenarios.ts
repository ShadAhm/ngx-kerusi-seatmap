import { KerusiMap, KerusiSession, KerusiState } from 'ngx-kerusi-seatmap';
import { AIRCRAFT_MAP, AIRCRAFT_SESSION, AIRCRAFT_STATE } from './fixtures/aircraft.kerusi.fixture';
import { CINEMA_MAP, CINEMA_SESSION, CINEMA_STATE } from './fixtures/cinema.kerusi.fixture';
import {
  LECTURE_THEATRE_MAP,
  LECTURE_THEATRE_STATE,
} from './fixtures/lecture-theatre.kerusi.fixture';
import { STADIUM_MAP, STADIUM_STATE } from './fixtures/stadium.kerusi.fixture';
import { TRAIN_MAP, TRAIN_SESSION, TRAIN_STATE } from './fixtures/train.kerusi.fixture';

/** One showcased venue: its documents, and what about the standard it shows. */
export interface Scenario {
  id: string;
  /** Tab label. */
  name: string;
  /** `KerusiMap.domain` — informational only; never used to branch rendering. */
  domain: string;
  /** One line on why this venue is here. */
  blurb: string;
  /** The specific spec features this document exercises. */
  highlights: readonly string[];
  map: KerusiMap;
  state: KerusiState;
  session?: KerusiSession;
  /** Seat size in viewBox units — dense venues want smaller cells. */
  seatSize?: number;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'cinema',
    name: 'Cinema',
    domain: 'cinema',
    blurb:
      'A straight grid split by two aisles into a left wing, a center block, and a ' +
      'right wing — the classic printed seating chart.',
    highlights: [
      'layout: "grid" — every seat has col, no seat has x or y',
      'Two aisles as skipped columns split each row into three blocks',
      'Two empty rows (\u00a74.2.2) hold the screen and the throw in front of it',
      'Screen and exits are non-bookable Elements',
      'Love seats are symmetric companions — they book as a pair',
      'A wheelchair bay declares accessibility, not an attribute tag',
    ],
    map: CINEMA_MAP,
    state: CINEMA_STATE,
    session: CINEMA_SESSION,
    seatSize: 32,
  },
  {
    id: 'aircraft',
    name: 'Aircraft',
    domain: 'flight',
    blurb:
      'A narrow-body cabin. Two classes are two Sections; the aisle is a column no ' +
      'seat occupies, not a filler object.',
    highlights: [
      'layout: "grid" — every seat has col, no seat has x or y',
      'The aisle is a skipped column (§4.3.2, no filler objects)',
      'Lavatories, galley and exit doors are grid-addressed Elements',
      'attributes: window, aisle, exit-row, extra-legroom',
      'Row 15 carries the full §4.3.4 accessibility object',
      'Two sections, ordered by Section.index',
    ],
    map: AIRCRAFT_MAP,
    state: AIRCRAFT_STATE,
    session: AIRCRAFT_SESSION,
  },
  {
    id: 'train',
    name: 'Train',
    domain: 'train',
    blurb:
      'Two carriages, two Sections. Carriage B is table bays, where four seats face ' +
      'each other around a fixture that cannot be booked.',
    highlights: [
      'One Section per carriage',
      'Tables are Elements spanning grid cells',
      'forward-facing / rear-facing as attributes',
      'An accessible bay with its required companion seat',
      'Its KerusiState is scoped by sessionId, not mapId',
    ],
    map: TRAIN_MAP,
    state: TRAIN_STATE,
    session: TRAIN_SESSION,
  },
  {
    id: 'stadium',
    name: 'Stadium',
    domain: 'stadium',
    blurb:
      'Stands wrap the pitch. Coordinates place each seat on its arc; col still says ' +
      'which seat is next along.',
    highlights: [
      'layout: "mixed" — every seat has col AND x and y',
      'x/y is authoritative for placement (§4.3.1)',
      'col remains the adjacency ordinal for keyboard order',
      'Each stand rotated to face the pitch',
      'The pitch itself is an Element',
    ],
    map: STADIUM_MAP,
    state: STADIUM_STATE,
    seatSize: 22,
  },
  {
    id: 'lecture-theatre',
    name: 'Lecture Theatre',
    domain: 'theatre',
    blurb:
      'Rows are concentric arcs around a point above the screen, each seat rotated to ' +
      'face it — the fan widens toward the back the way a real raked hall does.',
    highlights: [
      'layout: "freeform" — every seat has x and y, no seat has col',
      'Per-seat rotation comes from real polar geometry, not a hand-tuned curve',
      'A constant seat pitch, not seat count, is what a row holds constant',
      'aspectRatio "16:9" fixes the section proportions',
      'An accessible pair sits at each end of the back row',
    ],
    map: LECTURE_THEATRE_MAP,
    state: LECTURE_THEATRE_STATE,
    seatSize: 26,
  },
];

/** Locales the demo can switch between, to show label resolution. */
export const DEMO_LOCALES = [
  { id: 'en', label: 'English' },
  { id: 'ms', label: 'Bahasa Melayu' },
] as const;
