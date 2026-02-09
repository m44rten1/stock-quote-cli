# ADR-002: Parse at the Boundary

## Status

Accepted

## Context

The app consumes JSON from external APIs (Yahoo Finance, Alpha Vantage) whose
response shapes are undocumented, may change without notice, and can contain
surprising values (nulls, missing fields, empty arrays, error objects embedded
in success responses).

Passing raw or loosely typed API data through the system creates a class of bugs
where code deep in the call stack encounters unexpected shapes and fails with
cryptic errors — or worse, silently produces wrong results.

## Decision

Validate and parse external data **at the boundary**, immediately upon receipt,
using Effect `Schema` declarations:

- Each provider defines a schema for its API response (e.g., `YahooChartResponse`,
  `AlphaVantageResponse`).
- The raw JSON is decoded through `Schema.decodeUnknown()` before any business
  logic touches it.
- Schema failures are mapped to domain errors (`ParseError`) with meaningful
  messages.
- After parsing, internal code works exclusively with `StockQuote` — a trusted
  domain type with no optionals, no unknowns, no raw strings that might be
  numbers.

The decode functions (`decodeYahooResponse`, `decodeAlphaVantageResponse`) are
the single point where untrusted data becomes trusted. Everything downstream can
assume correctness.

## Consequences

- Parsing bugs surface immediately at the boundary, with clear error messages,
  rather than propagating as subtle type mismatches.
- Decode functions are pure and independently testable — tests feed in raw JSON
  and assert on the resulting `StockQuote` or error.
- Adding a new provider means writing a new schema and decode function; the rest
  of the system doesn't change.
- The domain type (`StockQuote`) stays clean: all fields are required, all
  numbers are numbers, no `string | undefined` fields.
- The cost is up-front schema work for each provider, but this replaces scattered
  defensive checks that would otherwise be needed throughout the codebase.

## References

- Alexis King, ["Parse, don't validate"](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) (2019)
