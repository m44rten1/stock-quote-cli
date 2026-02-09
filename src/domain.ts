// Pure domain types — no framework dependency, no I/O.

export interface StockQuote {
  readonly symbol: string;
  readonly price: number;
  readonly change: number;
  readonly changePercent: number;
  readonly currency: string;
  readonly timestamp: number; // epoch ms
}
