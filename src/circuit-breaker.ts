// Circuit breaker — Effect shell.
//
// Thin wrapper that wires the pure state machine (circuit-breaker-state.ts)
// to Effect's Ref, Clock, and error handling.

import { Clock, Console, Data, Duration, Effect, Ref } from "effect";
import {
  type CircuitState,
  initialState,
  gate,
  onSuccess,
  onTrippableFailure,
} from "./circuit-breaker-state.ts";

// Re-export the state types and constructors so consumers only need one import.
export type { CircuitState } from "./circuit-breaker-state.ts";
export { Closed, Open, HalfOpen, initialState } from "./circuit-breaker-state.ts";

// --- Config ---

export interface CircuitBreakerConfig<E> {
  readonly name?: string;
  readonly maxFailures: number;
  readonly resetTimeout: Duration.DurationInput;
  readonly isTrippable: (e: E) => boolean;
}

// --- Error ---

export class CircuitOpenError extends Data.TaggedError("CircuitOpenError")<{
  readonly message: string;
}> {}

// --- Circuit breaker ---

export interface CircuitBreaker<E> {
  /** Run `effect` through the circuit breaker. Errors matching the
   *  `isTrippable` predicate (provided at construction) count toward the
   *  failure threshold. Non-trippable errors pass through unchanged. */
  readonly execute: <A, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | CircuitOpenError, R>;

  /** Observe the current state (useful for testing / diagnostics). */
  readonly state: Effect.Effect<CircuitState>;
}

export function makeCircuitBreaker<E>(
  config: CircuitBreakerConfig<E>,
): Effect.Effect<CircuitBreaker<E>> {
  return Effect.gen(function* () {
    const resetMs = Duration.toMillis(Duration.decode(config.resetTimeout));
    const { isTrippable, maxFailures } = config;
    const label = config.name ?? "cb";
    const ref = yield* Ref.make<CircuitState>(initialState);

    const execute = <A, R>(
      effect: Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | CircuitOpenError, R> =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        // --- Gate: atomically decide whether to allow the request ---

        const [decision, prevTag] = yield* Ref.modify(ref, (s) => {
          const [d, next] = gate(s, now, resetMs);
          return [[d, s._tag] as const, next];
        });

        if (decision === "reject") {
          yield* Console.debug(`[${label}] circuit open — rejecting`);
          return yield* Effect.fail(
            new CircuitOpenError({ message: "Circuit is open" }),
          );
        }

        if (prevTag === "Open") {
          yield* Console.debug(`[${label}] half-open — allowing probe request`);
        }

        // --- Execute the underlying effect ---

        return yield* effect.pipe(
          Effect.tap(() =>
            Ref.set(ref, onSuccess()).pipe(
              Effect.tap(() =>
                Console.debug(`[${label}] success — circuit closed`),
              ),
            ),
          ),
          Effect.tapError((e) => {
            if (!isTrippable(e)) return Effect.void;
            return Ref.modify(ref, (s) => {
              const next = onTrippableFailure(s, now, maxFailures);
              return [next, next] as const;
            }).pipe(
              Effect.tap((next) =>
                next._tag === "Open"
                  ? Console.debug(`[${label}] circuit opened (${maxFailures}/${maxFailures} failures)`)
                  : next._tag === "Closed"
                    ? Console.debug(`[${label}] failure ${next.failures}/${maxFailures}`)
                    : Effect.void,
              ),
            );
          }),
        );
      });

    return {
      execute,
      state: Ref.get(ref),
    } satisfies CircuitBreaker<E>;
  });
}
