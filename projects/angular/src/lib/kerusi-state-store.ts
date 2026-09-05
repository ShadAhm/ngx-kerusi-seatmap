import { computed, signal, Signal } from '@angular/core';
import {
  applyStateDeltaOrdered,
  DEFAULT_SEQUENCE_READER,
  DeltaApplication,
  expireHolds,
  HeldSeat,
  heldSeats as heldSeatsOf,
  KerusiState,
  KerusiStateDelta,
  SequenceReader,
} from '@kerusiweb/core';

/**
 * A signal-backed live view of a {@link KerusiState}.
 *
 * Construct it directly — `new KerusiStateStore(initialState)` — and feed it
 * deltas from whatever transport you use. It is deliberately not an
 * `@Injectable`: this is a rendering library, and an application that already
 * owns its availability state should keep owning it.
 */
export class KerusiStateStore {
  private readonly _state;
  private readonly _needsRefetch = signal(false);
  private readonly _now;
  private readonly clock: () => Date;
  private readonly sequenceOf: SequenceReader;
  private lastSequence: number | undefined;

  constructor(initial: KerusiState, opts: { now?: () => Date; sequenceOf?: SequenceReader } = {}) {
    this._state = signal(initial);
    this.clock = opts.now ?? (() => new Date());
    this.sequenceOf = opts.sequenceOf ?? DEFAULT_SEQUENCE_READER;
    this._now = signal(this.clock());
  }

  /** The current availability snapshot. */
  get state(): Signal<KerusiState> {
    return this._state.asReadonly();
  }

  /** The timestamp of the most recently applied document. */
  readonly updatedAt = computed(() => this._state().updatedAt);

  /**
   * True once a gap was detected in the delta stream. The consumer SHOULD
   * re-fetch a full `KerusiState` and hand it to {@link reset} (§5.2).
   */
  get needsRefetch(): Signal<boolean> {
    return this._needsRefetch.asReadonly();
  }

  /** Every currently-held seat, with the time left on its hold. */
  readonly heldSeats = computed<readonly HeldSeat[]>(() => heldSeatsOf(this._state(), this._now()));

  /** Offers a delta to the store. Returns what happened to it. */
  apply(delta: KerusiStateDelta): DeltaApplication {
    const result = applyStateDeltaOrdered(this._state(), delta, {
      sequenceOf: this.sequenceOf,
      lastSequence: this.lastSequence,
    });

    if (result.outcome === 'applied' || result.outcome === 'gap') {
      this._state.set(result.state);
      const seq = this.sequenceOf(delta);
      if (seq !== undefined) {
        this.lastSequence = seq;
      }
    }
    if (result.outcome === 'gap') {
      this._needsRefetch.set(true);
    }

    return result;
  }

  /**
   * Replaces the state wholesale — the post-refetch path. Clears the
   * refetch flag and forgets the delta sequence.
   */
  reset(state: KerusiState): void {
    this._state.set(state);
    this._needsRefetch.set(false);
    this.lastSequence = undefined;
    this._now.set(this.clock());
  }

  /** Reverts lapsed holds and refreshes `heldSeats` countdowns. */
  tick(): void {
    const now = this.clock();
    this._now.set(now);
    const next = expireHolds(this._state(), now);
    if (next !== this._state()) {
      this._state.set(next);
    }
  }

  /**
   * Runs {@link tick} on an interval. Returns a function that stops it — call
   * that from `DestroyRef.onDestroy` or `ngOnDestroy`.
   */
  startExpiryTicker(intervalMs = 1000): () => void {
    const handle = setInterval(() => this.tick(), intervalMs);
    return () => clearInterval(handle);
  }
}
