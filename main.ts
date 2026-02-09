import { Command, Options, Prompt } from "@effect/cli";
import { FetchHttpClient } from "@effect/platform";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import process from "node:process";
import { Config, Console, Effect, Layer, Schedule } from "effect";
import {
  NetworkError,
  StockApi,
  type StockApiError,
} from "./src/stock-api.ts";
import { YahooFinanceLive } from "./src/providers/yahoo-finance.ts";
import { AlphaVantageLive } from "./src/providers/alpha-vantage.ts";
import { StockApiTestLive } from "./src/providers/stock-api-mock.ts";
import { formatError, formatQuote } from "./src/format.ts";

// --- CLI ---

const symbol = Options.text("symbol").pipe(
  Options.withDescription("Stock ticker symbol (e.g. AAPL, GOOGL, TSLA)"),
  Options.withFallbackPrompt(
    Prompt.text({
      message: "Enter a stock symbol:",
      validate: (value) =>
        value.trim().length === 0
          ? Effect.fail("Symbol cannot be empty")
          : Effect.succeed(value.trim()),
    }),
  ),
);

const command = Command.make("stock-quote", { symbol }).pipe(
  Command.withHandler(({ symbol }) =>
    Effect.gen(function* () {
      const api = yield* StockApi;
      const quote = yield* api.getQuote(symbol).pipe(
        Effect.timeoutFail({
          duration: "10 seconds",
          onTimeout: () =>
            new NetworkError({ message: "Request timed out" }),
        }),
        Effect.retry({
          while: (e) => e._tag === "NetworkError",
          schedule: Schedule.exponential("1 second").pipe(
            Schedule.compose(Schedule.recurs(2)),
          ),
        }),
      );
      yield* Console.log(formatQuote(quote));
    })
  ),
);

// --- Layers ---
// Set STOCK_PROVIDER to "yahoo" (default), "alphavantage", or "test".

const StockApiLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const provider = yield* Config.string("STOCK_PROVIDER").pipe(
      Config.withDefault("yahoo"),
    );
    switch (provider) {
      case "alphavantage":
        return AlphaVantageLive;
      case "test":
        return StockApiTestLive;
      default:
        return YahooFinanceLive;
    }
  }),
).pipe(Layer.provide(FetchHttpClient.layer));

// --- Run ---

const cli = Command.run(command, {
  name: "stock-quote",
  version: "0.1.0",
});

const logApiError = (e: StockApiError) => Console.error(formatError(e));

cli(process.argv).pipe(
  Effect.catchTags({
    NetworkError: logApiError,
    HttpError: logApiError,
    ParseError: logApiError,
    ApiError: logApiError,
  }),
  Effect.provide(StockApiLive),
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain,
);
