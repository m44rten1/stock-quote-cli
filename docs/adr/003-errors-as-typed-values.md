# ADR-003: Errors as Typed Values

## Status

Accepted

## Context

Stock quote fetching can fail in multiple distinct ways: the network can be down,
the API can return HTTP errors, the response can be unparseable, a ticker symbol
might not exist, or the upstream service can report its own errors. Each failure
mode has different implications for the user (different messages) and for the
system (some are retryable, some are not).

Using thrown exceptions or a generic `Error` type makes it hard to distinguish
these cases at compile time. Callers must remember to catch, and the type system
can't tell them what to catch.

## Decision

Model all expected failure modes as **tagged error values** using Effect's
`Data.TaggedError`:

```typescript
export class NetworkError extends Data.TaggedError("NetworkError")<{ readonly message: string }> {}
export class HttpError extends Data.TaggedError("HttpError")<{ readonly status: number }> {}
export class ParseError extends Data.TaggedError("ParseError")<{ readonly message: string }> {}
export class SymbolNotFound extends Data.TaggedError("SymbolNotFound")<{ readonly symbol: string }> {}
export class ServiceError extends Data.TaggedError("ServiceError")<{ readonly message: string }> {}
```

These form a discriminated union (`StockApiError`) that appears in Effect's error
channel. Each error carries only the data relevant to its case.

Key behaviors enabled by this:

- **Exhaustive handling** — `Effect.catchTags` at the top level handles every
  error variant; adding a new variant is a compile error until handled.
- **Selective retry** — only `NetworkError` triggers retry; other errors fail
  immediately.
- **User-facing formatting** — `classifyError()` pattern-matches on `_tag` to
  produce specific messages and hints for each case.
- **Provider error mapping** — each provider maps its platform-specific errors
  (e.g., `RequestError`, `ResponseError`) to domain errors at the boundary.

## Consequences

- The type system tracks which errors are possible at each point in the program.
- New error types require updating all handlers — the compiler guides you.
- Error handling logic (retry, formatting) can be tested in isolation by
  constructing error values directly.
- Unexpected/unrecoverable errors (bugs) are not modeled here — they remain
  defects that crash, which is the correct behavior.
- There is a small overhead in defining error classes, but it pays for itself
  in safety and clarity.
