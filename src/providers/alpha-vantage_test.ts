import { assertEquals } from "@std/assert";
import { Effect, Either } from "effect";
import { decodeAlphaVantageResponse } from "./alpha-vantage.ts";
import type { ParseError, ServiceError, SymbolNotFound } from "../stock-api.ts";
import type { StockQuote } from "../domain.ts";

// --- Test data ---

const validResponse = {
  "Global Quote": {
    "01. symbol": "MSFT",
    "02. open": "420.00",
    "03. high": "425.00",
    "04. low": "418.00",
    "05. price": "422.50",
    "06. volume": "10067390",
    "07. latest trading day": "2025-06-15",
    "08. previous close": "419.00",
    "09. change": "3.50",
    "10. change percent": "0.8354%",
  },
};

// --- Helpers ---

function decode(
  json: unknown,
): Promise<Either.Either<StockQuote, ParseError | SymbolNotFound | ServiceError>> {
  return Effect.runPromise(Effect.either(decodeAlphaVantageResponse(json, "TEST")));
}

async function decodeSuccess(json: unknown): Promise<StockQuote> {
  const result = await decode(json);
  if (Either.isLeft(result))
    throw new Error(`Expected success, got: ${result.left.message}`);
  return result.right;
}

async function decodeFailure(
  json: unknown,
): Promise<ParseError | SymbolNotFound | ServiceError> {
  const result = await decode(json);
  if (Either.isRight(result))
    throw new Error("Expected failure but got success");
  return result.left;
}

// --- decodeAlphaVantageResponse ---

Deno.test("decodeAlphaVantageResponse: valid response produces StockQuote", async () => {
  const quote = await decodeSuccess(validResponse);

  assertEquals(quote.symbol, "MSFT");
  assertEquals(quote.price, 422.5);
  assertEquals(quote.change, 3.5);
  assertEquals(quote.changePercent, 0.8354);
  assertEquals(quote.currency, "USD");
  assertEquals(quote.timestamp, Date.parse("2025-06-15"));
});

Deno.test("decodeAlphaVantageResponse: strips % from change percent", async () => {
  const quote = await decodeSuccess(validResponse);
  assertEquals(quote.changePercent, 0.8354);
});

Deno.test("decodeAlphaVantageResponse: null input returns ParseError", async () => {
  const error = await decodeFailure(null);
  assertEquals(error._tag, "ParseError");
});

Deno.test("decodeAlphaVantageResponse: non-object input returns ParseError", async () => {
  const error = await decodeFailure("not an object");
  assertEquals(error._tag, "ParseError");
});

Deno.test("decodeAlphaVantageResponse: Error Message field returns ServiceError", async () => {
  const error = await decodeFailure({
    "Error Message": "Invalid API call",
  });
  assertEquals(error._tag, "ServiceError");
});

Deno.test("decodeAlphaVantageResponse: Note field returns ServiceError (rate limit)", async () => {
  const error = await decodeFailure({
    "Note": "Thank you for using Alpha Vantage! Rate limit exceeded.",
  });
  assertEquals(error._tag, "ServiceError");
});

Deno.test("decodeAlphaVantageResponse: Information field returns ServiceError", async () => {
  const error = await decodeFailure({
    "Information": "Please provide a valid API key.",
  });
  assertEquals(error._tag, "ServiceError");
});

Deno.test("decodeAlphaVantageResponse: empty Global Quote returns SymbolNotFound", async () => {
  const error = await decodeFailure({ "Global Quote": {} });
  assertEquals(error._tag, "SymbolNotFound");
});

Deno.test("decodeAlphaVantageResponse: missing Global Quote returns SymbolNotFound", async () => {
  const error = await decodeFailure({});
  assertEquals(error._tag, "SymbolNotFound");
});

Deno.test("decodeAlphaVantageResponse: missing required field returns ParseError", async () => {
  const error = await decodeFailure({
    "Global Quote": {
      "01. symbol": "MSFT",
      // missing other fields
    },
  });
  assertEquals(error._tag, "ParseError");
});

Deno.test("decodeAlphaVantageResponse: non-numeric price returns ParseError", async () => {
  const error = await decodeFailure({
    "Global Quote": {
      ...validResponse["Global Quote"],
      "05. price": "not-a-number",
    },
  });
  assertEquals(error._tag, "ParseError");
  assertEquals(error.message.includes("Non-numeric"), true);
});
