// Yahoo Finance — implementation of StockApi.

import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Config, Effect, Layer, Schema } from "effect";
import type { StockQuote } from "../domain.ts";
import {
  HttpError,
  NetworkError,
  ParseError,
  SymbolNotFound,
  StockApi,
} from "../stock-api.ts";

// --- Yahoo response schema ---

const YahooMeta = Schema.Struct({
  symbol: Schema.String,
  regularMarketPrice: Schema.Number,
  chartPreviousClose: Schema.optional(Schema.Number),
  previousClose: Schema.optional(Schema.Number),
  currency: Schema.String,
  regularMarketTime: Schema.Number,
});

const YahooChartResponse = Schema.Struct({
  chart: Schema.Struct({
    result: Schema.NullOr(Schema.Array(Schema.Struct({ meta: YahooMeta }))),
    error: Schema.NullOr(
      Schema.Struct({
        description: Schema.optional(Schema.String),
      }),
    ),
  }),
});

type YahooChartResponseType = typeof YahooChartResponse.Type;

// --- Decode Yahoo response into StockQuote ---

export function decodeYahooResponse(
  json: unknown,
  symbol: string,
): Effect.Effect<StockQuote, ParseError | SymbolNotFound> {
  return Schema.decodeUnknown(YahooChartResponse)(json).pipe(
    Effect.mapError(
      (schemaError) =>
        new ParseError({
          message: `Invalid response: ${schemaError.message}`,
        }),
    ),
    Effect.flatMap((response) => interpretYahooResponse(response, symbol)),
  );
}

function interpretYahooResponse(
  response: YahooChartResponseType,
  symbol: string,
): Effect.Effect<StockQuote, ParseError | SymbolNotFound> {
  const { chart } = response;

  if (chart.error !== null) {
    return Effect.fail(new SymbolNotFound({ symbol }));
  }

  if (chart.result === null || chart.result.length === 0) {
    return Effect.fail(new SymbolNotFound({ symbol }));
  }

  const meta = chart.result[0].meta;
  const previousClose = meta.chartPreviousClose ?? meta.previousClose;

  if (previousClose === undefined) {
    return Effect.fail(
      new ParseError({
        message: "Missing or invalid 'previousClose'",
      }),
    );
  }

  const change = meta.regularMarketPrice - previousClose;
  const changePercent = (change / previousClose) * 100;

  return Effect.succeed({
    symbol: meta.symbol,
    price: meta.regularMarketPrice,
    change,
    changePercent,
    currency: meta.currency,
    timestamp: meta.regularMarketTime * 1000,
  });
}

// --- Yahoo Finance layer ---

export const YahooFinanceLive = Layer.effect(
  StockApi,
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.filterStatusOk,
      HttpClient.mapRequest(
        HttpClientRequest.setHeader("User-Agent", "Mozilla/5.0"),
      ),
    );
    const baseUrl = yield* Config.string("YAHOO_BASE_URL").pipe(
      Config.withDefault("https://query1.finance.yahoo.com/v8/finance/chart"),
    );

    return StockApi.of({
      getQuote: (symbol: string) =>
        Effect.gen(function* () {
          const response = yield* client.get(
            `${baseUrl}/${encodeURIComponent(symbol)}`,
          );
          const json = yield* response.json;
          return yield* decodeYahooResponse(json, symbol);
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
