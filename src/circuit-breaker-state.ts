// Circuit breaker — pure state machine.
//
// States:
//   Closed   → requests flow through, failures are counted
//   Open     → requests rejected immediately, waits for reset timeout
//   HalfOpen → one probe request allowed; success → Closed, failure → Open
//
// This module contains only types and pure transition functions.
// Zero external dependencies — just data in, data out.

// --- State ---

export type Closed = { readonly _tag: "Closed"; readonly failures: number };
export type Open = { readonly _tag: "Open"; readonly openedAt: number };
export type HalfOpen = { readonly _tag: "HalfOpen" };

export type CircuitState = Closed | Open | HalfOpen;

export const Closed = (failures: number): Closed => ({
  _tag: "Closed",
  failures,
});

export const Open = (openedAt: number): Open => ({
  _tag: "Open",
  openedAt,
});

export const HalfOpen: HalfOpen = { _tag: "HalfOpen" };

export const initialState: CircuitState = Closed(0);

// --- Transitions ---

export type GateDecision = "allow" | "reject";

/** Decide whether to allow a request through, and the resulting state. */
export function gate(
  state: CircuitState,
  now: number,
  resetMs: number,
): [GateDecision, CircuitState] {
  switch (state._tag) {
    case "Closed":
    case "HalfOpen":
      return ["allow", state];
    case "Open":
      return now - state.openedAt >= resetMs
        ? ["allow", HalfOpen]
        : ["reject", state];
  }
}

/** State after a successful execution. */
export function onSuccess(): CircuitState {
  return Closed(0);
}

/** State after a trippable failure. */
export function onTrippableFailure(
  state: CircuitState,
  now: number,
  maxFailures: number,
): CircuitState {
  switch (state._tag) {
    case "HalfOpen":
      // Probe failed → re-open.
      return Open(now);
    case "Closed": {
      // Increment failures, open if threshold reached.
      const next = state.failures + 1;
      return next >= maxFailures ? Open(now) : Closed(next);
    }
    case "Open":
      // Shouldn't normally be called in Open state, but handle defensively.
      return state;
  }
}
