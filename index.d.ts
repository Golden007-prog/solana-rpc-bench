// Type declarations for solana-rpc-bench.

export declare const PUBLIC_RPC: "https://api.mainnet-beta.solana.com";
export declare const DEFAULT_ADDRESS: string;
export declare const TIMED_METHODS: readonly ["getSlot", "getLatestBlockhash", "getBalance", "getAccountInfo", "getSignaturesForAddress", "getTransaction"];
export type TimedMethod = (typeof TIMED_METHODS)[number];

export interface Probe {
  name?: string;
  method: string;
  params: unknown[];
}
export declare const DEFAULT_PROBES: Probe[];

export type CallKind = "ok" | "rpc-error" | "http-error" | "timeout" | "network" | "bad-json" | "empty" | "skipped";

export interface CallRecord {
  method: string;
  ok: boolean;
  kind: CallKind;
  ms: number;
  status: number | null;
  code: number | null;
  message: string | null;
  retryAfterMs: number | null;
  result?: unknown;
}

export interface EndpointSpec {
  url: string;
  /** Default: the http URL with ws(s):// */
  wsUrl?: string;
  name?: string;
}

export interface BenchOptions {
  rounds?: number;
  delayMs?: number;
  timeoutMs?: number;
  address?: string;
  commitment?: "processed" | "confirmed" | "finalized";
  probes?: boolean | Probe[];
  ws?: boolean;
  backoffMs?: number;
  onProgress?: (event: { endpoint: string; method: string; ok: boolean; ms: number; kind: CallKind }) => void;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket | null;
}

export interface MethodStats {
  calls: number;
  ok: number;
  errors: number;
  skipped: number;
  p50: number | null;
  p90: number | null;
  max: number | null;
  lastError: string | null;
}

export interface ProbeResult {
  name: string;
  method: string;
  supported: boolean;
  kind: CallKind;
  ms: number;
  status: number | null;
  code: number | null;
  message: string | null;
}

export interface WsResult {
  url?: string;
  skipped?: boolean;
  ok: boolean;
  openMs: number | null;
  subscribedMs: number | null;
  firstSlotMs: number | null;
  slot: number | null;
  error: string | null;
}

export interface EndpointReport {
  index: number;
  name: string;
  /** Redacted. */
  url: string;
  requests: number;
  errors: number;
  rateLimited: number;
  timeouts: number;
  http: Record<string, number>;
  latency: { p50: number | null; p90: number | null; max: number | null };
  /** Lag uses time-adjusted readings. lastSlot contains the last raw slot. */
  slotLag: { samples: number; median: number | null; max: number | null; lastSlot: number | null };
  methods: Record<TimedMethod, MethodStats>;
  probes: ProbeResult[];
  ws: WsResult | null;
  /** Every timed call; `note` is set when getTransaction was retried with a newer maxSupportedTransactionVersion. */
  calls: (Omit<CallRecord, "result"> & { round: number; note?: string })[];
}

export interface BenchReport {
  startedAt: string;
  finishedAt: string;
  node: string;
  settings: { rounds: number; delayMs: number; timeoutMs: number; address: string; commitment: string; ws: boolean };
  endpoints: EndpointReport[];
  note: string;
}

export declare function bench(endpoints: string | (string | EndpointSpec)[], options?: BenchOptions): Promise<BenchReport>;
export declare function formatTable(report: BenchReport): string;
export declare function formatMarkdown(report: BenchReport): string;
export declare function formatCsv(report: BenchReport): string;
export declare function timedCall(url: string, method: string, params: unknown[], options?: { fetch?: typeof fetch; timeoutMs?: number; now?: () => number }): Promise<CallRecord>;
export declare function describeFailure(record: Pick<CallRecord, "kind" | "status" | "code" | "message">): string;
export declare function wsCheck(wsUrl: string, options?: { WebSocket?: typeof WebSocket | null; timeoutMs?: number; now?: () => number }): Promise<WsResult>;
export declare function toWsUrl(httpUrl: string): string;
export declare function redactUrl(url: string): string;
export declare function secretsOf(url: string): string[];
export declare function scrub(text: string, urls: string[]): string;
export declare function percentile(values: number[], p: number): number | null;

export declare class BenchInputError extends Error {}
