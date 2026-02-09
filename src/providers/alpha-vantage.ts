// Alpha Vantage — implementation of StockApi.

import { HttpClient } from "@effect/platform";
import { Config, Effect, Layer, Schema } from "effect";
import type { StockQuote } from "../domain.ts";
import {
  HttpError,
  NetworkError,
  ParseError,
  ServiceError,
  SymbolNotFound,
  StockApi,
} from "../stock-api.ts";

// --- Alpha Vantage response schema ---

const AlphaVantageGlobalQuote = Schema.Struct({
  "01. symbol": Schema.String,
  "05. price": Schema.String,
  "07. latest trading day": Schema.String,
  "08. previous close": Schema.String,
  "09. change": Schema.String,
  "10. change percent": Schema.String,
});

type AlphaVantageGlobalQuoteType = typeof AlphaVantageGlobalQuote.Type;

// --- Decode Alpha Vantage response into StockQuote ---

export function decodeAlphaVantageResponse(
  json: unknown,
  symbol: string,
): Effect.Effect<StockQuote, ParseError | SymbolNotFound | ServiceError> {
  if (typeof json !== "object" || json === null) {
    return Effect.fail(new ParseError({ message: "Response is not an object" }));
  }

  const obj = json as Record<string, unknown>;

  // Alpha Vantage signals service-level errors via top-level string fields.
  if (typeof obj["Error Message"] === "string") {
    return Effect.fail(new ServiceError({ message: obj["Error Message"] }));
  }
  if (typeof obj["Note"] === "string") {
    return Effect.fail(new ServiceError({ message: obj["Note"] }));
  }
  if (typeof obj["Information"] === "string") {
    return Effect.fail(new ServiceError({ message: obj["Information"] }));
  }

  const globalQuote = obj["Global Quote"];

  if (
    globalQuote === undefined ||
    typeof globalQuote !== "object" ||
    globalQuote === null ||
    Object.keys(globalQuote).length === 0
  ) {
    return Effect.fail(new SymbolNotFound({ symbol }));
  }

  return Schema.decodeUnknown(AlphaVantageGlobalQuote)(globalQuote).pipe(
    Effect.mapError(
      (e) => new ParseError({ message: `Invalid response: ${e.message}` }),
    ),
    Effect.flatMap(toStockQuote),
  );
}

function toStockQuote(
  q: AlphaVantageGlobalQuoteType,
): Effect.Effect<StockQuote, ParseError> {
  const price = Number(q["05. price"]);
  const previousClose = Number(q["08. previous close"]);
  const change = Number(q["09. change"]);
  const changePercent = Number(q["10. change percent"].replace("%", ""));

  if ([price, previousClose, change, changePercent].some(Number.isNaN)) {
    return Effect.fail(
      new ParseError({ message: "Non-numeric value in quote data" }),
    );
  }

  return Effect.succeed({
    symbol: q["01. symbol"],
    price,
    change,
    changePercent,
    currency: "USD", // Alpha Vantage GLOBAL_QUOTE does not return currency
    timestamp: new Date(q["07. latest trading day"]).getTime(),
  });
}

// --- Alpha Vantage layer ---

export const AlphaVantageLive = Layer.effect(
  StockApi,
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.filterStatusOk,
    );
    const apiKey = yield* Config.string("ALPHA_VANTAGE_API_KEY");
    const baseUrl = yield* Config.string("ALPHA_VANTAGE_BASE_URL").pipe(
      Config.withDefault("https://www.alphavantage.co/query"),
    );

    return StockApi.of({
      getQuote: (symbol: string) =>
        Effect.gen(function* () {
          const url =
            `${baseUrl}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
          const response = yield* client.get(url);
          const json = yield* response.json;
          return yield* decodeAlphaVantageResponse(json, symbol);
        }).pipe(
          Effect.catchTags({
            RequestError: (e) =>
              Effect.fail(new NetworkError({ message: e.message })),
            ResponseError: (e) =>
              e.reason === "StatusCode"
                ? Effect.fail(new HttpError({ status: e.response.status }))
                : Effect.fail(
                    new ParseError({
                      message: `JSON parse failed: ${e.message}`,
                    }),
                  ),
          }),
        ),
    });
  }),
);
