// Pure formatting functions — no I/O.

import type { StockQuote } from "./domain.ts";
import type { HttpError, StockApiError } from "./stock-api.ts";

// --- ANSI escape codes ---

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

// --- Quote formatting ---

export function formatQuote(quote: StockQuote): string {
  const direction = quote.change >= 0 ? "▲" : "▼";
  const color = quote.change >= 0 ? GREEN : RED;
  const sign = quote.change >= 0 ? "+" : "";

  const lines = [
    "",
    `${BOLD}  ${quote.symbol}${RESET}`,
    `  ${BOLD}${quote.price.toFixed(2)} ${quote.currency}${RESET}`,
    `  ${color}${direction} ${sign}${quote.change.toFixed(2)} (${sign}${quote.changePercent.toFixed(2)}%)${RESET}`,
    `  ${DIM}${new Date(quote.timestamp).toLocaleString()}${RESET}`,
    "",
  ];

  return lines.join("\n");
}

// --- Error formatting ---

export function formatError(error: StockApiError): string {
  const friendly = classifyError(error);
  return [
    "",
    `${RED}${BOLD}  ✗ ${friendly.title}${RESET}`,
    `  ${DIM}${friendly.hint}${RESET}`,
    "",
  ].join("\n");
}

interface ClassifiedError {
  readonly title: string;
  readonly hint: string;
}

function classifyError(error: StockApiError): ClassifiedError {
  switch (error._tag) {
    case "NetworkError":
      return {
        title: "Network error",
        hint: "Could not reach the API. Check your internet connection.",
      };
    case "HttpError":
      return classifyHttpError(error);
    case "SymbolNotFound":
      return {
        title: "Symbol not found",
        hint: "Double-check the ticker symbol and try again (e.g. AAPL, GOOGL, TSLA).",
      };
    case "ServiceError":
      return {
        title: "Service unavailable",
        hint: error.message,
      };
    case "ParseError":
      return {
        title: "Unexpected response",
        hint: "The API returned data in an unexpected format.",
      };
  }
}

function classifyHttpError(error: HttpError): ClassifiedError {
  if (error.status === 404) {
    return {
      title: "Symbol not found",
      hint: "Double-check the ticker symbol and try again (e.g. AAPL, GOOGL, TSLA).",
    };
  }
  if (error.status === 429) {
    return {
      title: "Rate limited",
      hint: "Too many requests — wait a moment and try again.",
    };
  }
  if (error.status >= 500 && error.status < 600) {
    return {
      title: "Server error",
      hint: "Yahoo Finance is having issues. Try again in a few minutes.",
    };
  }
  return {
    title: "HTTP error",
    hint: `HTTP ${error.status}`,
  };
}
