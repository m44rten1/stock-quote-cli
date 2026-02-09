// Tests for the fallback orchestration logic:
// - isTrippable: which errors trigger fallback vs. propagate immediately
// - tryProviders: fallback ordering and error propagation

import { assertEquals } from "@std/assert";
import { Effect, Either } from "effect";
import {
  isTrippable,
  tryProviders,
  type NamedProvider,
} from "./stock-api-fallback.ts";
import {
  HttpError,
  NetworkError,
  ParseError,
  ServiceError,
  SymbolNotFound,
  type StockApiError,
} from "./stock-api.ts";
import { CircuitOpenError } from "./circuit-breaker.ts";
import type { StockQuote } from "./domain.ts";

// --- Helpers ---

const quote: StockQuote = {
  symbol: "AAPL",
  price: 150,
  change: 1.5,
  changePercent: 1.0,
  currency: "USD",
  timestamp: 1700000000000,
};

function succeedingProvider(name: string): NamedProvider {
  return { name, getQuote: () => Effect.succeed(quote) };
}

function failingProvider(name: string, error: StockApiError): NamedProvider {
  return { name, getQuote: () => Effect.fail(error) };
}

function run<A, E>(effect: Effect.Effect<A, E>): Promise<Either.Either<A, E>> {
  return Effect.runPromise(Effect.either(effect));
}

// --- isTrippable ---

Deno.test("isTrippable: infrastructure errors are trippable", () => {
  assertEquals(isTrippable(new NetworkError({ message: "" })), true);
  assertEquals(isTrippable(new ParseError({ message: "" })), true);
  assertEquals(isTrippable(new ServiceError({ message: "" })), true);
  assertEquals(isTrippable(new CircuitOpenError({ message: "open" })), true);
});

Deno.test("isTrippable: server HttpErrors (>= 500) are trippable", () => {
  assertEquals(isTrippable(new HttpError({ status: 500 })), true);
  assertEquals(isTrippable(new HttpError({ status: 503 })), true);
});

Deno.test("isTrippable: client HttpErrors (< 500) are not trippable", () => {
  assertEquals(isTrippable(new HttpError({ status: 400 })), false);
  assertEquals(isTrippable(new HttpError({ status: 404 })), false);
  assertEquals(isTrippable(new HttpError({ status: 429 })), false);
});

Deno.test("isTrippable: SymbolNotFound is never trippable", () => {
  assertEquals(isTrippable(new SymbolNotFound({ symbol: "XYZ" })), false);
});

// --- tryProviders ---

Deno.test("tryProviders: returns first successful result", async () => {
  const result = await run(
    tryProviders(
      [succeedingProvider("a"), succeedingProvider("b")],
      "AAPL",
    ),
  );

  assertEquals(Either.isRight(result), true);
  if (Either.isRight(result)) {
    assertEquals(result.right.symbol, "AAPL");
  }
});

Deno.test("tryProviders: falls back on trippable error", async () => {
  const customQuote = { ...quote, symbol: "FROM_B" };
  const providers: NamedProvider[] = [
    failingProvider("a", new NetworkError({ message: "down" })),
    { name: "b", getQuote: () => Effect.succeed(customQuote) },
  ];

  const result = await run(tryProviders(providers, "AAPL"));

  assertEquals(Either.isRight(result), true);
  if (Either.isRight(result)) {
    assertEquals(result.right.symbol, "FROM_B");
  }
});

Deno.test("tryProviders: SymbolNotFound propagates immediately, no fallback", async () => {
  const providers: NamedProvider[] = [
    failingProvider("a", new SymbolNotFound({ symbol: "XYZ" })),
    succeedingProvider("b"),
  ];

  const result = await run(tryProviders(providers, "XYZ"));

  assertEquals(Either.isLeft(result), true);
  if (Either.isLeft(result)) {
    assertEquals(result.left._tag, "SymbolNotFound");
  }
});

Deno.test("tryProviders: client HttpError propagates immediately, no fallback", async () => {
  const providers: NamedProvider[] = [
    failingProvider("a", new HttpError({ status: 404 })),
    succeedingProvider("b"),
  ];

  const result = await run(tryProviders(providers, "AAPL"));

  assertEquals(Either.isLeft(result), true);
  if (Either.isLeft(result)) {
    assertEquals(result.left._tag, "HttpError");
  }
});

Deno.test("tryProviders: all providers fail returns last error", async () => {
  const providers: NamedProvider[] = [
    failingProvider("a", new NetworkError({ message: "a down" })),
    failingProvider("b", new ServiceError({ message: "b down" })),
  ];

  const result = await run(tryProviders(providers, "AAPL"));

  assertEquals(Either.isLeft(result), true);
  if (Either.isLeft(result)) {
    assertEquals(result.left._tag, "ServiceError");
    assertEquals((result.left as ServiceError).message, "b down");
  }
});

Deno.test("tryProviders: empty provider list returns ServiceError", async () => {
  const result = await run(tryProviders([], "AAPL"));

  assertEquals(Either.isLeft(result), true);
  if (Either.isLeft(result)) {
    assertEquals(result.left._tag, "ServiceError");
    assertEquals(
      (result.left as ServiceError).message,
      "No providers configured",
    );
  }
});
