import { assertEquals } from "@std/assert";
import {
  Closed,
  gate,
  HalfOpen,
  initialState,
  onSuccess,
  onTrippableFailure,
  Open,
} from "./circuit-breaker-state.ts";

const NOW = 1000;
const RESET_MS = 10_000;
const MAX_FAILURES = 3;

// --- gate ---

Deno.test("gate: allows when closed", () => {
  const [decision, next] = gate(Closed(1), NOW, RESET_MS);
  assertEquals(decision, "allow");
  assertEquals(next, Closed(1));
});

Deno.test("gate: rejects when open and timeout not elapsed", () => {
  const open = Open(NOW - 5_000);
  const [decision, next] = gate(open, NOW, RESET_MS);
  assertEquals(decision, "reject");
  assertEquals(next, open);
});

Deno.test("gate: allows and transitions to half-open when timeout elapsed", () => {
  const [decision, next] = gate(Open(NOW - 15_000), NOW, RESET_MS);
  assertEquals(decision, "allow");
  assertEquals(next, HalfOpen);
});

Deno.test("gate: allows when half-open (probe already in flight)", () => {
  const [decision, next] = gate(HalfOpen, NOW, RESET_MS);
  assertEquals(decision, "allow");
  assertEquals(next, HalfOpen);
});

// --- onSuccess ---

Deno.test("onSuccess: resets to closed with zero failures", () => {
  assertEquals(onSuccess(), Closed(0));
});

// --- onTrippableFailure ---

Deno.test("onTrippableFailure: increments failure count when closed", () => {
  assertEquals(onTrippableFailure(Closed(1), NOW, MAX_FAILURES), Closed(2));
});

Deno.test("onTrippableFailure: opens when reaching maxFailures", () => {
  assertEquals(onTrippableFailure(Closed(2), NOW, MAX_FAILURES), Open(NOW));
});

Deno.test("onTrippableFailure: opens from first failure when maxFailures is 1", () => {
  assertEquals(onTrippableFailure(Closed(0), NOW, 1), Open(NOW));
});

Deno.test("onTrippableFailure: re-opens when half-open probe fails", () => {
  assertEquals(onTrippableFailure(HalfOpen, NOW, MAX_FAILURES), Open(NOW));
});

// --- initialState ---

Deno.test("initialState: starts closed with zero failures", () => {
  assertEquals(initialState, Closed(0));
});
