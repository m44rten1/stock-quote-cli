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

export class SymbolNotFound extends Data.TaggedError("SymbolNotFound")<{
  readonly symbol: string;
}> {}

export class ServiceError extends Data.TaggedError("ServiceError")<{
  readonly message: string;
}> {}

export type StockApiError =
  | NetworkError
  | HttpError
  | ParseError
  | SymbolNotFound
  | ServiceError;

// --- Service ---

export class StockApi extends Context.Tag("StockApi")<
  StockApi,
  {
    readonly getQuote: (
      symbol: string,
    ) => Effect.Effect<StockQuote, StockApiError>;
  }
>() {}
