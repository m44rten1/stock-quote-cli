// Fallback StockApi — tries providers in order, with circuit breakers.

import { Console, Effect, Layer } from "effect";
import type { StockQuote } from "./domain.ts";
import {
  makeCircuitBreaker,
  type CircuitBreaker,
  type CircuitOpenError,
} from "./circuit-breaker.ts";
import {
  NetworkError,
  ServiceError,
  StockApi,
  type StockApiError,
} from "./stock-api.ts";
import { makeYahooFinanceApi } from "./providers/yahoo-finance.ts";
import { makeAlphaVantageApi } from "./providers/alpha-vantage.ts";

// --- Types ---

export interface NamedProvider {
  readonly name: string;
  readonly getQuote: (symbol: string) => Effect.Effect<StockQuote, StockApiError>;
}

// --- Trippable error predicate ---

/** Errors that indicate the provider is unhealthy. SymbolNotFound is NOT
 *  trippable — it's a valid domain answer that should propagate immediately. */
export function isTrippable(e: StockApiError | CircuitOpenError): boolean {
  switch (e._tag) {
    case "NetworkError":
    case "ParseError":
    case "ServiceError":
    case "CircuitOpenError":
      return true;
    case "HttpError":
      return e.status >= 500;
    case "SymbolNotFound":
      return false;
  }
}

// --- Circuit breaker boundary ---

/** Per-provider timeout so a hanging request fails fast and the fallback
 *  can try the next provider within the overall request timeout. */
const PROVIDER_TIMEOUT = "5 seconds";

/** Wrap a provider with a per-request timeout and its circuit breaker,
 *  mapping CircuitOpenError to ServiceError at this boundary so the
 *  fallback loop only sees StockApiError. */
function withBreaker(
  name: string,
  getQuote: (symbol: string) => Effect.Effect<StockQuote, StockApiError>,
  breaker: CircuitBreaker<StockApiError>,
): (symbol: string) => Effect.Effect<StockQuote, StockApiError> {
  return (symbol) =>
    breaker.execute(
      getQuote(symbol).pipe(
        Effect.timeoutFail({
          duration: PROVIDER_TIMEOUT,
          onTimeout: () =>
            new NetworkError({ message: `${name}: request timed out` }),
        }),
      ),
    ).pipe(
      Effect.mapError((e) =>
        e._tag === "CircuitOpenError"
          ? new ServiceError({ message: `${name}: circuit open` })
          : e,
      ),
    );
}

// --- Fallback logic ---

export function tryProviders(
  providers: readonly NamedProvider[],
  symbol: string,
): Effect.Effect<StockQuote, StockApiError> {
  const loop = (
    index: number,
    lastError: StockApiError,
  ): Effect.Effect<StockQuote, StockApiError> => {
    if (index >= providers.length) return Effect.fail(lastError);

    const { name, getQuote } = providers[index];

    return Console.debug(`[fallback] trying ${name}...`).pipe(
      Effect.flatMap(() => getQuote(symbol)),
      Effect.tapError((e) =>
        Console.debug(`[fallback] ${name} failed: ${e._tag}`),
      ),
      Effect.catchIf(isTrippable, (e) => loop(index + 1, e)),
    );
  };

  return loop(0, new ServiceError({ message: "No providers configured" }));
}

// --- Layer ---

export const FallbackStockApiLive = Layer.effect(
  StockApi,
  Effect.gen(function* () {
    // Build both providers.
    const yahoo = yield* makeYahooFinanceApi;
    const alphavantage = yield* makeAlphaVantageApi.pipe(
      Effect.catchTag("ConfigError", () =>
        // Alpha Vantage requires an API key — skip if not configured.
        Effect.succeed(undefined),
      ),
    );

    // Create a circuit breaker per provider.
    const yahooCb = yield* makeCircuitBreaker<StockApiError>({
      name: "cb:yahoo",
      maxFailures: 3,
      resetTimeout: "30 seconds",
      isTrippable,
    });

    const providers: NamedProvider[] = [
      { name: "yahoo", getQuote: withBreaker("yahoo", yahoo.getQuote, yahooCb) },
    ];

    if (alphavantage !== undefined) {
      const avCb = yield* makeCircuitBreaker<StockApiError>({
        name: "cb:alphavantage",
        maxFailures: 3,
        resetTimeout: "30 seconds",
        isTrippable,
      });
      providers.push({
        name: "alphavantage",
        getQuote: withBreaker("alphavantage", alphavantage.getQuote, avCb),
      });
    }

    yield* Console.debug(
      `[fallback] Initialized with providers: ${providers.map((p) => p.name).join(", ")}`,
    );

    return StockApi.of({
      getQuote: (symbol: string) => tryProviders(providers, symbol),
    });
  }),
);
