// Integration tests for the Effect shell.
//
// The pure state machine transitions are covered exhaustively in
// circuit-breaker-state_test.ts. These tests verify the wiring:
// Ref updates, Clock usage, isTrippable filtering, and error propagation.

import { assertEquals } from "@std/assert";
import { Effect, Either, TestClock, TestContext } from "effect";
import {
  type CircuitState,
  makeCircuitBreaker,
} from "./circuit-breaker.ts";

// --- Helpers ---

const trippable = (_: unknown) => true;

const defaultConfig = {
  maxFailures: 3,
  resetTimeout: "10 seconds",
  isTrippable: trippable,
} as const;

function run<A, E>(
  effect: Effect.Effect<A, E, never>,
): Promise<A> {
  return Effect.runPromise(
    effect.pipe(Effect.provide(TestContext.TestContext)),
  );
}

function assertClosed(state: CircuitState, failures: number) {
  assertEquals(state._tag, "Closed");
  if (state._tag === "Closed") assertEquals(state.failures, failures);
}

// --- Tests ---

Deno.test("wiring: success flows through and resets state", async () => {
  const result = await run(
    Effect.gen(function* () {
      const cb = yield* makeCircuitBreaker(defaultConfig);
      yield* cb.execute(Effect.fail("err")).pipe(Effect.ignore);
      const value = yield* cb.execute(Effect.succeed(42));
      return { value, state: yield* cb.state };
    }),
  );

  assertEquals(result.value, 42);
  assertClosed(result.state, 0);
});

Deno.test("wiring: trippable failures update state via Ref", async () => {
  const state = await run(
    Effect.gen(function* () {
      const cb = yield* makeCircuitBreaker(defaultConfig);
      for (let i = 0; i < 3; i++) {
        yield* cb.execute(Effect.fail("err")).pipe(Effect.ignore);
      }
      return yield* cb.state;
    }),
  );

  assertEquals(state._tag, "Open");
});

Deno.test("wiring: open circuit emits CircuitOpenError", async () => {
  const result = await run(
    Effect.gen(function* () {
      const cb = yield* makeCircuitBreaker(defaultConfig);
      for (let i = 0; i < 3; i++) {
        yield* cb.execute(Effect.fail("err")).pipe(Effect.ignore);
      }
      return yield* cb.execute(Effect.succeed("unreachable")).pipe(
        Effect.either,
      );
    }),
  );

  assertEquals(Either.isLeft(result), true);
  if (Either.isLeft(result)) {
    const err = result.left;
    assertEquals(
      typeof err === "object" && err !== null && "_tag" in err
        ? (err as { _tag: string })._tag
        : null,
      "CircuitOpenError",
    );
  }
});

Deno.test("wiring: non-trippable errors pass through without affecting state", async () => {
  const state = await run(
    Effect.gen(function* () {
      const cb = yield* makeCircuitBreaker({
        ...defaultConfig,
        isTrippable: (_: unknown) => false,
      });
      for (let i = 0; i < 5; i++) {
        yield* cb.execute(Effect.fail("err")).pipe(Effect.ignore);
      }
      return yield* cb.state;
    }),
  );

  assertClosed(state, 0);
});

Deno.test("wiring: clock integration — timeout elapses, probe resets to closed", async () => {
  const state = await run(
    Effect.gen(function* () {
      const cb = yield* makeCircuitBreaker(defaultConfig);
      for (let i = 0; i < 3; i++) {
        yield* cb.execute(Effect.fail("err")).pipe(Effect.ignore);
      }
      yield* TestClock.adjust("11 seconds");
      yield* cb.execute(Effect.succeed("probe"));
      return yield* cb.state;
    }),
  );

  assertClosed(state, 0);
});
