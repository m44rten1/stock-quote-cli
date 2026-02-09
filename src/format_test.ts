import { assertEquals } from "@std/assert";
import { formatQuote, formatError } from "./format.ts";
import { NetworkError, HttpError, ParseError, ApiError } from "./stock-api.ts";
import type { StockQuote } from "./domain.ts";

// --- Test data ---

const sampleQuote: StockQuote = {
  symbol: "GOOGL",
  price: 190.5,
  change: 2.5,
  changePercent: 1.33,
  currency: "USD",
  timestamp: Date.parse("2024-02-09T18:00:00Z"),
};

// --- formatQuote ---

Deno.test("formatQuote: contains symbol and price", () => {
  const output = formatQuote(sampleQuote);
  assertEquals(output.includes("GOOGL"), true);
  assertEquals(output.includes("190.50"), true);
  assertEquals(output.includes("USD"), true);
});

Deno.test("formatQuote: positive change shows upward indicator", () => {
  const output = formatQuote(sampleQuote);
  assertEquals(output.includes("▲"), true);
  assertEquals(output.includes("+2.50"), true);
});

Deno.test("formatQuote: negative change shows downward indicator", () => {
  const output = formatQuote({ ...sampleQuote, change: -3.2, changePercent: -1.68 });
  assertEquals(output.includes("▼"), true);
  assertEquals(output.includes("-3.20"), true);
});

Deno.test("formatQuote: zero change shows upward indicator with +0.00", () => {
  const output = formatQuote({ ...sampleQuote, change: 0, changePercent: 0 });
  assertEquals(output.includes("▲"), true);
  assertEquals(output.includes("+0.00"), true);
});

// --- formatError ---

Deno.test("formatError: NetworkError shows network error", () => {
  const output = formatError(new NetworkError({ message: "Fetch failed" }));
  assertEquals(output.includes("Network error"), true);
  assertEquals(output.includes("internet connection"), true);
});

Deno.test("formatError: HttpError 404 shows symbol not found", () => {
  const output = formatError(new HttpError({ status: 404 }));
  assertEquals(output.includes("Symbol not found"), true);
});

Deno.test("formatError: HttpError 429 shows rate limited", () => {
  const output = formatError(new HttpError({ status: 429 }));
  assertEquals(output.includes("Rate limited"), true);
});

Deno.test("formatError: HttpError 500 shows server error", () => {
  const output = formatError(new HttpError({ status: 500 }));
  assertEquals(output.includes("Server error"), true);
});

Deno.test("formatError: ApiError shows symbol not found", () => {
  const output = formatError(new ApiError({ message: "Yahoo API error" }));
  assertEquals(output.includes("Symbol not found"), true);
});

Deno.test("formatError: ParseError shows unexpected response", () => {
  const output = formatError(new ParseError({ message: "Invalid response" }));
  assertEquals(output.includes("Unexpected response"), true);
});
