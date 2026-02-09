// Stock API — service definition and domain errors.

import { Context, Data, Effect } from "effect";
import type { StockQuote } from "./domain.ts";

// --- Errors ---

export class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly message: string;
}> {}

export class HttpError extends Data.TaggedError("HttpError")<{
  readonly status: number;
}> {}

export class ParseError extends Data.TaggedError("ParseError")<{
  readonly message: string;
}> {}

export class ApiError extends Data.TaggedError("ApiError")<{
  readonly message: string;
}> {}

export type StockApiError = NetworkError | HttpError | ParseError | ApiError;

// --- Service ---

export class StockApi extends Context.Tag("StockApi")<
  StockApi,
  {
    readonly getQuote: (
      symbol: string,
    ) => Effect.Effect<StockQuote, StockApiError>;
  }
>() {}
