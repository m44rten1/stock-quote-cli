# stock-quote-cli

A small but complete stock-quote CLI built with [Effect](https://effect.website), designed as a reference for developers learning the library. Every design choice is intentional — the goal is to show how Effect's concepts fit together in a real (if small) application, not just in isolated snippets.

## Quick start

```bash
cp .example.env .env          # configure your provider
deno task start --symbol AAPL  # fetch a quote
deno task dev --symbol TSLA    # same, with --watch
deno test                      # run all tests
```

## Project structure

```
main.ts                          # CLI entry point, wires layers together
src/
  domain.ts                      # Pure types — no framework, no I/O
  stock-api.ts                   # Service interface + typed errors
  format.ts                      # Pure formatting functions
  format_test.ts                 # Tests for formatting logic
  providers/
    yahoo-finance.ts             # StockApi implementation (Yahoo Finance)
    yahoo-finance_test.ts        # Tests for Yahoo response decoding
    alpha-vantage.ts             # StockApi implementation (Alpha Vantage)
    alpha-vantage_test.ts        # Tests for Alpha Vantage response decoding
    stock-api-mock.ts            # StockApi mock — canned data, no network
```

## Effect concepts demonstrated

The sections below map each Effect concept to the file and pattern where it appears. Read the code alongside these notes.

### Services and Tags

`stock-api.ts` defines a **service interface** using `Context.Tag`. The `StockApi` tag describes *what* the application needs (a way to get a stock quote) without saying *how*.

```ts
export class StockApi extends Context.Tag("StockApi")<
  StockApi,
  { readonly getQuote: (symbol: string) => Effect.Effect<StockQuote, StockApiError> }
>() {}
```

The command handler in `main.ts` consumes the service with `yield* StockApi` — it never knows which provider is behind it.

### Layers — swappable implementations

Each provider file exports a **Layer** that satisfies the `StockApi` tag:

| Layer | File | Dependencies |
|---|---|---|
| `YahooFinanceLive` | `providers/yahoo-finance.ts` | `HttpClient` |
| `AlphaVantageLive` | `providers/alpha-vantage.ts` | `HttpClient`, `Config("ALPHA_VANTAGE_API_KEY")` |
| `StockApiTestLive` | `providers/stock-api-mock.ts` | *none* |

`main.ts` uses `Layer.unwrapEffect` to pick the right layer at startup based on config:

```ts
const StockApiLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const provider = yield* Config.string("STOCK_PROVIDER").pipe(
      Config.withDefault("yahoo"),
    );
    switch (provider) {
      case "alphavantage": return AlphaVantageLive;
      case "test":         return StockApiTestLive;
      default:             return YahooFinanceLive;
    }
  }),
).pipe(Layer.provide(FetchHttpClient.layer));
```

This is the core architectural idea: business logic depends on the interface, the entry point decides the implementation.

### Typed errors with `Data.TaggedError`

`stock-api.ts` defines a closed set of error types using discriminated unions:

```ts
export class NetworkError extends Data.TaggedError("NetworkError")<{ readonly message: string }> {}
export class HttpError    extends Data.TaggedError("HttpError")<{ readonly status: number }> {}
export class ParseError   extends Data.TaggedError("ParseError")<{ readonly message: string }> {}
export class ApiError      extends Data.TaggedError("ApiError")<{ readonly message: string }> {}
```

The `_tag` field enables exhaustive handling via `Effect.catchTags` — the compiler ensures every error case is covered. See `main.ts` for the top-level handler, and `format.ts` for user-friendly error classification.

### Schema — parsing at the boundary

Both provider files use `Schema` to validate external API responses and convert `unknown` JSON into typed data. The decode functions (`decodeYahooResponse`, `decodeAlphaVantageResponse`) are exported and tested independently — they're the boundary between untrusted external data and the trusted internal `StockQuote` type.

Key pattern: parse once at the edge, then work with known-good types everywhere else.

### Effect.gen — sequential composition

`Effect.gen` with generator functions is the primary way to compose effects sequentially. It reads like imperative code but preserves typed errors and dependency tracking:

```ts
Effect.gen(function* () {
  const api = yield* StockApi;               // access a service
  const quote = yield* api.getQuote(symbol); // run an effectful operation
  yield* Console.log(formatQuote(quote));     // perform a side effect
})
```

### Config — environment-driven setup

`Config.string("KEY")` reads from environment variables. `Config.withDefault(...)` provides fallbacks. Both providers use this for base URLs; Alpha Vantage additionally requires an API key. The `--env` flag in `deno.json` tasks loads `.env` automatically.

### Retry and timeout

`main.ts` composes `Effect.timeoutFail` and `Effect.retry` to handle transient network failures:

```ts
api.getQuote(symbol).pipe(
  Effect.timeoutFail({
    duration: "10 seconds",
    onTimeout: () => new NetworkError({ message: "Request timed out" }),
  }),
  Effect.retry({
    while: (e) => e._tag === "NetworkError",
    schedule: Schedule.exponential("1 second").pipe(
      Schedule.compose(Schedule.recurs(2)),
    ),
  }),
)
```

Only `NetworkError` triggers a retry (up to 2 retries with exponential backoff). An `ApiError` or `ParseError` fails immediately — retrying won't help.

### HttpClient

`@effect/platform` provides an `HttpClient` service. Provider layers compose it with `HttpClient.filterStatusOk` (which turns non-2xx responses into `ResponseError`) and `Effect.catchTags` to map platform errors into domain errors. The Yahoo provider also adds a custom `User-Agent` header via `HttpClient.mapRequest`.

### @effect/cli

`main.ts` uses `Command`, `Options`, and `Prompt` from `@effect/cli` to define the CLI interface. The `--symbol` option falls back to an interactive prompt if not provided.

## Design principles

These aren't Effect-specific, but the codebase demonstrates them:

- **Pure domain types** — `domain.ts` has zero imports. `StockQuote` is a plain interface.
- **Pure functions at the core** — `format.ts` takes data in, returns strings out. No Effects, easy to test.
- **Parse at the boundary** — Each provider validates and normalizes external data into `StockQuote`. Internal code never handles raw API shapes.
- **Effects at the edges** — HTTP calls, config reads, and console output live in `main.ts` and the provider layers. Everything else is pure.
- **Errors as data** — Errors are values with tags, not thrown exceptions. They flow through the type system.

## Providers

| Provider | Auth | Rate limits | Notes |
|---|---|---|---|
| Yahoo Finance | None | Unofficial, undocumented | Default. Uses the undocumented `/v8/finance/chart` endpoint. |
| Alpha Vantage | Free API key | 25 calls/day, 5/min | [Get a key](https://www.alphavantage.co/support/#api-key). Does not return currency (defaults to USD). |
| Mock | None | None | Returns canned data for AAPL, GOOGL, TSLA. Useful for development and testing. |

## Running tests

```bash
deno test
```

Tests focus on the pure decision logic: response decoding and error classification. They don't hit the network.
