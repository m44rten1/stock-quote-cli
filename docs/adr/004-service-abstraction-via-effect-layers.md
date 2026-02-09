# ADR-004: Service Abstraction via Effect Layers

## Status

Accepted

## Context

The app needs to support multiple stock data providers (Yahoo Finance, Alpha
Vantage, a mock for development) that have different APIs, authentication
requirements, and response formats. The business logic — fetching a quote,
retrying on failure, formatting the result — should not care which provider is
active.

Traditional approaches (factory pattern, constructor injection) solve this but
require manual wiring and don't compose well with other concerns like HTTP client
configuration or environment config.

## Decision

Define `StockApi` as an **Effect service** using `Context.Tag`, with each
provider as a separate `Layer`:

- `StockApi` declares the interface: a single `getQuote` method returning
  `Effect<StockQuote, StockApiError>`.
- `YahooFinanceLive`, `AlphaVantageLive`, and `StockApiTestLive` are layers that
  implement this interface.
- Provider selection is a config-driven switch in `main.ts` that picks the
  appropriate layer based on `STOCK_PROVIDER`.
- Layers compose dependencies: e.g., `YahooFinanceLive` requires
  `HttpClient`, which is provided by `FetchHttpClient.layer`.

The command handler does `yield* StockApi` to get the service — it never knows
which implementation is behind it.

## Consequences

- Adding a new provider means adding a new layer and a case in the switch.
  No changes to business logic, formatting, or error handling.
- Each provider encapsulates its own HTTP details, schemas, and error mapping.
  One provider's quirks don't leak into another.
- The mock provider (`StockApiTestLive`) enables fast development and CLI testing
  with zero network dependencies.
- Layer composition makes dependencies explicit and eliminates hidden globals.
- The trade-off is Effect-specific API surface — developers need to understand
  `Context.Tag`, `Layer.effect`, and `Layer.provide` to add or modify providers.

## References

- [Effect: Managing Services](https://effect.website/docs/requirements-management/services/)
