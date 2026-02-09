# ADR-001: Functional Core, Imperative Shell

## Status

Accepted

## Context

A CLI application that fetches stock quotes from external APIs needs to deal with
I/O (HTTP requests, console output, environment variables) while also containing
decision logic (formatting, error classification, response interpretation).

Mixing I/O with decision logic makes code harder to test, harder to reason about,
and harder to change. When every function can do anything, nothing is safe to
refactor without integration tests.

## Decision

Separate the codebase into a **pure functional core** and an **imperative shell**:

- **Pure core** — domain types (`domain.ts`) and pure functions (`format.ts`)
  have no framework dependencies and perform no I/O. `domain.ts` is a plain
  TypeScript interface with zero imports. `format.ts` imports only domain types.
- **Imperative shell** — `main.ts` and the provider implementations handle all
  effects: HTTP calls, config reads, console output, retries, timeouts.
- **Boundary layer** — providers sit between the shell and the core. They perform
  I/O (HTTP) and then immediately convert untrusted external data into trusted
  domain types, keeping the effect surface thin.

The pure core does all the interesting decision-making (formatting quotes,
classifying errors, interpreting API responses) while the shell orchestrates
effects.

## Consequences

- Pure functions are trivially testable with plain unit tests — no mocks, no
  setup, no teardown.
- The domain model can evolve independently of the I/O layer.
- Adding a new provider means writing a new shell adapter; the core doesn't
  change.
- Developers can read `domain.ts` and `format.ts` to understand what the app
  *does* without wading through HTTP or framework code.
- The trade-off is an explicit boundary between pure and effectful code that
  must be respected by convention — the type system helps (Effect vs plain
  functions) but doesn't fully enforce it.

## References

- Gary Bernhardt, ["Boundaries"](https://www.destroyallsoftware.com/talks/boundaries) (2012)
- Mark Seemann, ["Impureim sandwich"](https://blog.ploeh.dk/2020/03/02/impureim-sandwich/)
