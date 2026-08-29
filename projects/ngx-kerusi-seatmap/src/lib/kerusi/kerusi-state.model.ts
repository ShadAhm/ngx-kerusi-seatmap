/**
 * Kerusi availability document types, transcribed from the Kerusi Seat Map and
 * Availability Format v1.0.0-draft, §5. These describe the dynamic, per-seat
 * booking status that is merged onto a static {@link KerusiMap} by `Seat.id`.
 */

/** Per-seat availability status (§5.1). */
export interface SeatStatus {
  /** REQUIRED. */
  status: 'available' | 'held' | 'booked' | 'blocked';
  /** RFC 3339 date-time (§5.1.1). Meaningful only when `status === "held"`. */
  holdExpires?: string;
  metadata?: Record<string, unknown>;
}

/**
 * A complete availability snapshot (§5.1). A seat absent from `seats` MUST be
 * interpreted as `"available"` — this sparse convention keeps state documents
 * small for large venues.
 */
export interface KerusiState {
  /** REQUIRED. */
  kerusi: '1.0';
  /**
   * Matches `KerusiSession.id`. RECOMMENDED when the referenced map is reused
   * across many events (§5.3).
   */
  sessionId?: string;
  /**
   * Matches `KerusiMap.id` directly, for documents with no separate session
   * concept. Exactly one of `sessionId`/`mapId` MUST be present.
   */
  mapId?: string;
  /** REQUIRED. RFC 3339 date-time (§5.1.1). */
  updatedAt: string;
  /** REQUIRED. Keyed by `Seat.id`. Only non-default entries need be included. */
  seats: Record<string, SeatStatus>;
}

/**
 * An incremental update over a push transport (§5.2). Unlike {@link KerusiState},
 * EVERY entry in `changes` is an explicit change and omission means "unchanged"
 * — the opposite of KerusiState's sparse rule.
 */
export interface KerusiStateDelta {
  /** REQUIRED. */
  kerusi: '1.0';
  /** Same either/or rule as {@link KerusiState}. */
  sessionId?: string;
  mapId?: string;
  /**
   * REQUIRED. RFC 3339 date-time (§5.1.1), strictly increasing per session/map
   * so a consumer can detect and discard an out-of-order delta.
   */
  updatedAt: string;
  /**
   * REQUIRED. Keyed by `Seat.id`. Every entry IS a change; an explicit
   * `{ "status": "available" }` signals a seat reverting. A seat's absence
   * means "unchanged".
   */
  changes: Record<string, SeatStatus>;
}

/**
 * The optional join between a specific event/showtime/flight and a reusable
 * {@link KerusiMap} (§5.3). `KerusiState`/`KerusiStateDelta` reference the
 * session via `sessionId` when a session exists.
 */
export interface KerusiSession {
  /** REQUIRED. */
  kerusi: '1.0';
  /** REQUIRED. Unique session id, e.g. "MH123-2026-08-17". */
  id: string;
  /** REQUIRED. References the reusable `KerusiMap.id`. */
  mapId: string;
  /** e.g. "Dune: Part Three — 7:30pm", "MH123, 17 Aug 2026". */
  label?: string;
  /** RFC 3339 date-time (§5.1.1) — showtime / departure / event start. */
  startsAt?: string;
  endsAt?: string;
  metadata?: Record<string, unknown>;
}
