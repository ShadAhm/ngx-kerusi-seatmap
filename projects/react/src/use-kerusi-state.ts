import {
  applyStateDeltaOrdered,
  DEFAULT_SEQUENCE_READER,
  expireHolds,
  heldSeats as heldSeatsIn,
} from '@kerusiweb/core';
import type {
  DeltaApplication,
  HeldSeat,
  KerusiState,
  KerusiStateDelta,
  SequenceReader,
} from '@kerusiweb/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface UseKerusiStateOptions {
  now?: () => Date;
  sequenceOf?: SequenceReader;
  /**
   * Run {@link UseKerusiState.tick} on this interval, reverting lapsed holds
   * and refreshing the `heldSeats` countdowns. Omit to tick manually.
   */
  expiryIntervalMs?: number;
}

export interface UseKerusiState {
  /** The current availability snapshot. */
  state: KerusiState;
  /** The timestamp of the most recently applied document. */
  updatedAt: string;
  /**
   * True once a gap was detected in the delta stream. The consumer SHOULD
   * re-fetch a full `KerusiState` and hand it to {@link reset} (§5.2).
   */
  needsRefetch: boolean;
  /** Every currently-held seat, with the time left on its hold. */
  heldSeats: readonly HeldSeat[];
  /** Offers a delta to the store. Returns what happened to it. */
  apply(delta: KerusiStateDelta): DeltaApplication;
  /**
   * Replaces the state wholesale — the post-refetch path. Clears the refetch
   * flag and forgets the delta sequence.
   */
  reset(state: KerusiState): void;
  /** Reverts lapsed holds and refreshes the `heldSeats` countdowns. */
  tick(): void;
}

/**
 * A live view of a {@link KerusiState}, fed by deltas from whatever transport
 * the application uses.
 *
 * The ordering, gap detection and hold expiry all come from `@kerusiweb/core`;
 * this hook only holds them in React state. It is deliberately not a context or
 * a provider: this is a rendering library, and an application that already owns
 * its availability state should keep owning it.
 *
 * ```tsx
 * const availability = useKerusiState(initialState, { expiryIntervalMs: 1000 });
 * useEffect(() => socket.on('delta', availability.apply), [availability.apply]);
 * <KerusiSeatmap map={map} state={availability.state} />
 * ```
 */
export function useKerusiState(
  initial: KerusiState,
  opts: UseKerusiStateOptions = {},
): UseKerusiState {
  const { now, sequenceOf, expiryIntervalMs } = opts;

  const clock = useRef(now ?? (() => new Date()));
  clock.current = now ?? clock.current;
  const readSequence = sequenceOf ?? DEFAULT_SEQUENCE_READER;

  const [state, setState] = useState<KerusiState>(initial);
  const [needsRefetch, setNeedsRefetch] = useState(false);
  const [nowValue, setNowValue] = useState<Date>(() => clock.current());
  const lastSequence = useRef<number | undefined>(undefined);
  /** Mirrors `state` so `apply` can stay referentially stable. */
  const latest = useRef(state);
  latest.current = state;

  const apply = useCallback(
    (delta: KerusiStateDelta): DeltaApplication => {
      const result = applyStateDeltaOrdered(latest.current, delta, {
        sequenceOf: readSequence,
        lastSequence: lastSequence.current,
      });

      if (result.outcome === 'applied' || result.outcome === 'gap') {
        latest.current = result.state;
        setState(result.state);
        const seq = readSequence(delta);
        if (seq !== undefined) {
          lastSequence.current = seq;
        }
      }
      if (result.outcome === 'gap') {
        setNeedsRefetch(true);
      }

      return result;
    },
    [readSequence],
  );

  const reset = useCallback((next: KerusiState) => {
    latest.current = next;
    setState(next);
    setNeedsRefetch(false);
    lastSequence.current = undefined;
    setNowValue(clock.current());
  }, []);

  const tick = useCallback(() => {
    const at = clock.current();
    setNowValue(at);
    const next = expireHolds(latest.current, at);
    if (next !== latest.current) {
      latest.current = next;
      setState(next);
    }
  }, []);

  useEffect(() => {
    if (expiryIntervalMs === undefined) {
      return;
    }
    const handle = setInterval(tick, expiryIntervalMs);
    return () => clearInterval(handle);
  }, [expiryIntervalMs, tick]);

  const held = useMemo(() => heldSeatsIn(state, nowValue), [state, nowValue]);

  return {
    state,
    updatedAt: state.updatedAt,
    needsRefetch,
    heldSeats: held,
    apply,
    reset,
    tick,
  };
}
