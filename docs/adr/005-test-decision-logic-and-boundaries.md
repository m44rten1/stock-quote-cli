# ADR-005: Test Decision Logic and Boundaries

## Status

Accepted

## Context

The app is small but has a clear split between pure logic, boundary parsing, and
I/O orchestration. Testing everything equally would waste effort on low-value
tests (e.g., verifying that `main.ts` calls the right functions in the right
order) while potentially under-testing the parts that actually break.

## Decision

Focus tests on two areas where bugs are most likely and most consequential:

### 1. Pure decision logic (`format_test.ts`)

`formatQuote` and `formatError` contain all the display logic: sign selection,
directional indicators, error classification with user-friendly messages. These
are pure functions — given a `StockQuote` or `StockApiError`, they return a
string. Tests call them directly with constructed values and assert on the
output.

### 2. Boundary parsing (`yahoo-finance_test.ts`, `alpha-vantage_test.ts`)

The decode functions (`decodeYahooResponse`, `decodeAlphaVantageResponse`) are
where untrusted external JSON becomes trusted domain types. This is a high-risk
boundary: API responses are undocumented, can contain nulls, missing fields,
embedded error objects, or unexpected formats. Tests feed in realistic and
adversarial JSON payloads and verify the resulting `StockQuote` or error.

### What is not tested

- **I/O orchestration** (`main.ts`) — wiring, retry config, and layer selection
  are straightforward Effect composition. Testing them would mean testing the
  framework, not the app.
- **HTTP mechanics** — no mock HTTP clients. The decode functions are extracted
  and tested independently of the HTTP layer, which avoids brittle mocks.
- **Trivial glue** — no tests for code that simply passes values through.

## Consequences

- Tests run fast (no network, no setup) and are stable (no flaky mocks).
- Test failures point to real bugs in real logic, not test infrastructure issues.
- The decode functions are exported specifically to enable direct testing —
  testability influenced the API design.
- When a new provider is added, the expectation is: write a decode function,
  test it thoroughly with edge cases, and trust the layer wiring.
- The trade-off is no end-to-end test covering the full CLI flow. For this app
  size, manual smoke testing with the mock provider fills that gap.
