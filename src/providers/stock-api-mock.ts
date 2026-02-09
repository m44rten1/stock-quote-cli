// StockApiTest — mock implementation of StockApi for testing and development.

import { Effect, Layer } from "effect";
import type { StockQuote } from "../domain.ts";
import { SymbolNotFound, StockApi } from "../stock-api.ts";

// --- Sample data ---

const quotes: Record<string, StockQuote> = {
  AAPL: {
    symbol: "AAPL",
    price: 225.3,
    change: 3.45,
    changePercent: 1.55,
    currency: "USD",
    timestamp: Date.parse("2025-06-15T16:00:00Z"),
  },
  GOOGL: {
    symbol: "GOOGL",
    price: 190.5,
    change: -2.1,
    changePercent: -1.09,
    currency: "USD",
    timestamp: Date.parse("2025-06-15T16:00:00Z"),
  },
  TSLA: {
    symbol: "TSLA",
    price: 385.2,
    change: 12.6,
    changePercent: 3.38,
    currency: "USD",
    timestamp: Date.parse("2025-06-15T16:00:00Z"),
  },
};

// --- Mock layer ---

export const StockApiTestLive = Layer.succeed(
  StockApi,
  StockApi.of({
    getQuote: (symbol: string) => {
      const quote = quotes[symbol.toUpperCase()];
      return quote !== undefined
        ? Effect.succeed(quote)
        : Effect.fail(new SymbolNotFound({ symbol }));
    },
  }),
);
