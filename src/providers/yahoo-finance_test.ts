import { assertEquals } from "@std/assert";
import { Effect, Either } from "effect";
import { decodeYahooResponse } from "./yahoo-finance.ts";
import type { ParseError, SymbolNotFound } from "../stock-api.ts";
import type { StockQuote } from "../domain.ts";

// --- Test data ---

const validYahooResponse = {
  chart: {
    result: [
      {
        meta: {
          symbol: "GOOGL",
          regularMarketPrice: 190.5,
          chartPreviousClose: 188.0,
          currency: "USD",
          regularMarketTime: 1707505200,
        },
      },
    ],
    error: null,
  },
};

// --- Helpers ---

function decode(json: unknown): Promise<Either.Either<StockQuote, ParseError | SymbolNotFound>> {
  return Effect.runPromise(Effect.either(decodeYahooResponse(json, "TEST")));
}

async function decodeSuccess(json: unknown): Promise<StockQuote> {
  const result = await decode(json);
  if (Either.isLeft(result)) throw new Error(`Expected success, got: ${result.left.message}`);
  return result.right;
}

async function decodeFailure(json: unknown): Promise<ParseError | SymbolNotFound> {
  const result = await decode(json);
  if (Either.isRight(result)) throw new Error("Expected failure but got success");
  return result.left;
}

// --- decodeYahooResponse ---

Deno.test("decodeYahooResponse: valid response produces StockQuote", async () => {
  const quote = await decodeSuccess(validYahooResponse);

  assertEquals(quote.symbol, "GOOGL");
  assertEquals(quote.price, 190.5);
  assertEquals(quote.currency, "USD");
  assertEquals(quote.change, 190.5 - 188.0);
  assertEquals(quote.timestamp, 1707505200 * 1000);
});

Deno.test("decodeYahooResponse: changePercent is calculated correctly", async () => {
  const quote = await decodeSuccess(validYahooResponse);

  const expected = ((190.5 - 188.0) / 188.0) * 100;
  assertEquals(quote.changePercent, expected);
});

Deno.test("decodeYahooResponse: null input returns ParseError", async () => {
  const error = await decodeFailure(null);
  assertEquals(error._tag, "ParseError");
});

Deno.test("decodeYahooResponse: missing chart field returns ParseError", async () => {
  const error = await decodeFailure({ foo: "bar" });
  assertEquals(error._tag, "ParseError");
});

Deno.test("decodeYahooResponse: empty results array returns SymbolNotFound", async () => {
  const error = await decodeFailure({ chart: { result: [], error: null } });
  assertEquals(error._tag, "SymbolNotFound");
});

Deno.test("decodeYahooResponse: null result without error returns SymbolNotFound (invalid symbol)", async () => {
  const error = await decodeFailure({ chart: { result: null, error: null } });
  assertEquals(error._tag, "SymbolNotFound");
});

Deno.test("decodeYahooResponse: missing price returns ParseError", async () => {
  const input = {
    chart: {
      result: [
        {
          meta: {
            symbol: "GOOGL",
            chartPreviousClose: 188.0,
            currency: "USD",
            regularMarketTime: 1707505200,
          },
        },
      ],
      error: null,
    },
  };
  const error = await decodeFailure(input);
  assertEquals(error._tag, "ParseError");
});

Deno.test("decodeYahooResponse: API error is surfaced as SymbolNotFound", async () => {
  const input = {
    chart: {
      result: null,
      error: { description: "No data found" },
    },
  };
  const error = await decodeFailure(input);
  assertEquals(error._tag, "SymbolNotFound");
});

Deno.test("decodeYahooResponse: falls back to previousClose when chartPreviousClose is missing", async () => {
  const input = {
    chart: {
      result: [
        {
          meta: {
            symbol: "AAPL",
            regularMarketPrice: 200.0,
            previousClose: 195.0,
            currency: "USD",
            regularMarketTime: 1707505200,
          },
        },
      ],
      error: null,
    },
  };
  const quote = await decodeSuccess(input);
  assertEquals(quote.change, 200.0 - 195.0);
});

Deno.test("decodeYahooResponse: missing symbol returns ParseError", async () => {
  const input = {
    chart: {
      result: [
        {
          meta: {
            regularMarketPrice: 190.5,
            chartPreviousClose: 188.0,
            currency: "USD",
            regularMarketTime: 1707505200,
          },
        },
      ],
      error: null,
    },
  };
  const error = await decodeFailure(input);
  assertEquals(error._tag, "ParseError");
});

Deno.test("decodeYahooResponse: missing currency returns ParseError", async () => {
  const input = {
    chart: {
      result: [
        {
          meta: {
            symbol: "GOOGL",
            regularMarketPrice: 190.5,
            chartPreviousClose: 188.0,
            regularMarketTime: 1707505200,
          },
        },
      ],
      error: null,
    },
  };
  const error = await decodeFailure(input);
  assertEquals(error._tag, "ParseError");
});

Deno.test("decodeYahooResponse: missing regularMarketTime returns ParseError", async () => {
  const input = {
    chart: {
      result: [
        {
          meta: {
            symbol: "GOOGL",
            regularMarketPrice: 190.5,
            chartPreviousClose: 188.0,
            currency: "USD",
          },
        },
      ],
      error: null,
    },
  };
  const error = await decodeFailure(input);
  assertEquals(error._tag, "ParseError");
});

Deno.test("decodeYahooResponse: non-object chart field returns ParseError", async () => {
  const error = await decodeFailure({ chart: "not-an-object" });
  assertEquals(error._tag, "ParseError");
});

Deno.test("decodeYahooResponse: API error without description returns SymbolNotFound", async () => {
  const input = {
    chart: {
      result: null,
      error: { code: "NOT_FOUND" },
    },
  };
  const error = await decodeFailure(input);
  assertEquals(error._tag, "SymbolNotFound");
});

Deno.test("decodeYahooResponse: missing both previousClose fields returns ParseError", async () => {
  const input = {
    chart: {
      result: [
        {
          meta: {
            symbol: "GOOGL",
            regularMarketPrice: 190.5,
            currency: "USD",
            regularMarketTime: 1707505200,
          },
        },
      ],
      error: null,
    },
  };
  const error = await decodeFailure(input);
  assertEquals(error._tag, "ParseError");
});
