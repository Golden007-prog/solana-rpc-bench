// solana-rpc-bench: compare Solana RPC endpoints from where you are, right now. Latency per method, errors and
// rate limits, slot lag against the other endpoints, which heavier methods each one serves, and a WebSocket check.
// Sequential and gentle by default. No dependencies. Node 20+ (Node 22+ for the WebSocket check).
//
// A small, open piece of the tooling behind Blix (https://blixvip.com), the Solana memecoin terminal.
import { timedCall, BenchInputError, describeFailure } from "./call.js";
import { redactUrl, scrub, secretsOf } from "./redact.js";
import { wsCheck, toWsUrl } from "./ws.js";

export { timedCall, BenchInputError, describeFailure, redactUrl, scrub, secretsOf, wsCheck, toWsUrl };
export { formatTable, formatMarkdown } from "./format.js";

export const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";
/** Wrapped SOL mint: exists on every cluster's mainnet RPC and has a steady stream of transactions. */
export const DEFAULT_ADDRESS = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const CONFIG_PROGRAM = "Config1111111111111111111111111111111111111";
const ESTIMATED_SLOT_MS = 400;

/** The methods timed every round, in order. getTransaction uses a signature from getSignaturesForAddress. */
export const TIMED_METHODS = ["getSlot", "getLatestBlockhash", "getBalance", "getAccountInfo", "getSignaturesForAddress", "getTransaction"];

/**
 * Asked once per endpoint to see whether it serves them. Each is kept small: getProgramAccounts targets the Config
 * program with a dataSize filter that matches nothing and a zero-length data slice.
 */
export const DEFAULT_PROBES = [
  { name: "getTokenLargestAccounts", method: "getTokenLargestAccounts", params: [USDC_MINT, { commitment: "confirmed" }] },
  { name: "getProgramAccounts (filters)", method: "getProgramAccounts", params: [CONFIG_PROGRAM, { encoding: "base64", dataSlice: { offset: 0, length: 0 }, filters: [{ dataSize: 1 }] }] },
  { name: "getRecentPrioritizationFees", method: "getRecentPrioritizationFees", params: [] },
];

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Nearest-rank percentile of a list of numbers (null when empty). */
export function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length, Math.max(1, Math.ceil((p / 100) * s.length))) - 1];
}

function paramsFor(method, { address, commitment, signature, txVersion = 0 }) {
  switch (method) {
    case "getSlot": return [{ commitment }];
    case "getLatestBlockhash": return [{ commitment }];
    case "getBalance": return [address, { commitment }];
    case "getAccountInfo": return [address, { encoding: "base64", commitment, dataSlice: { offset: 0, length: 0 } }];
    case "getSignaturesForAddress": return [address, { limit: 1, commitment }];
    case "getTransaction": return [signature, { encoding: "json", maxSupportedTransactionVersion: txVersion, commitment }];
    default: throw new BenchInputError(`unknown method ${method}`);
  }
}

function parseEndpoints(endpoints) {
  const list = (Array.isArray(endpoints) ? endpoints : [endpoints]).filter(Boolean).map((e) => (typeof e === "string" ? { url: e.trim() } : { ...e }));
  if (!list.length) throw new BenchInputError("give at least one RPC URL");
  for (const e of list) if (!/^https?:\/\//i.test(e.url || "")) throw new BenchInputError(`not an http(s) URL: ${redactUrl(e.url)}`);
  return list;
}

/**
 * Benchmark endpoints.
 * @param {(string|{url:string, wsUrl?:string, name?:string})[]} endpoints
 * @param {object} [options]
 * @param {number} [options.rounds=3]          Times each method is timed per endpoint.
 * @param {number} [options.delayMs=250]       Pause between any two requests (all endpoints share one queue).
 * @param {number} [options.timeoutMs=10000]   Per request.
 * @param {string} [options.address]           Account for getBalance / getAccountInfo / getSignaturesForAddress.
 * @param {string} [options.commitment="confirmed"]
 * @param {boolean|object[]} [options.probes=true]  Support probes: true for DEFAULT_PROBES, false for none, or your own list.
 * @param {boolean} [options.ws=false]         Also run the WebSocket check.
 * @param {number} [options.backoffMs=2000]    Extra wait after a 429 (or Retry-After, capped at 10 s).
 * @param {(event: object) => void} [options.onProgress]
 * @param {typeof fetch} [options.fetch]
 * @param {typeof WebSocket} [options.WebSocket]
 */
export async function bench(endpoints, {
  rounds = 3, delayMs = 250, timeoutMs = 10_000, address = DEFAULT_ADDRESS, commitment = "confirmed", probes = true,
  ws = false, backoffMs = 2000, onProgress = null, fetch: fetchFn = globalThis.fetch, WebSocket: WS = globalThis.WebSocket,
} = {}) {
  const list = parseEndpoints(endpoints);
  if (!(Number.isInteger(rounds) && rounds >= 1 && rounds <= 100)) throw new BenchInputError("rounds must be a whole number from 1 to 100");
  if (!(delayMs >= 0)) throw new BenchInputError("delayMs must be 0 or more");
  const urls = list.flatMap((e) => [e.url, e.wsUrl || toWsUrl(e.url)]);
  const clean = (s) => (s == null ? s : scrub(s, urls));
  const startedAt = new Date().toISOString();

  const eps = list.map((e, i) => ({
    index: i + 1, url: redactUrl(e.url), name: e.name || redactUrl(e.url), raw: e,
    calls: [], slots: [], lags: [], probes: [], ws: null, pauseUntil: 0, signature: null, txVersion: 0,
  }));

  let first = true;
  async function call(ep, method, params) {
    const wait = Math.max(first ? 0 : delayMs, ep.pauseUntil - Date.now());
    first = false;
    if (wait > 0) await sleep(wait);
    const requestedAt = performance.now();
    const rec = await timedCall(ep.raw.url, method, params, { fetch: fetchFn, timeoutMs });
    if (rec.status === 429) ep.pauseUntil = Date.now() + Math.min(10_000, Math.max(backoffMs, rec.retryAfterMs || 0));
    const { result, ...kept } = rec;
    const out = { ...kept, message: clean(kept.message) };
    onProgress?.({ endpoint: ep.name, method, ok: out.ok, ms: out.ms, kind: out.kind });
    return { rec: out, result, sampledAt: requestedAt + rec.ms / 2 };
  }

  for (let round = 1; round <= rounds; round++) {
    // Compare each valid reading at the start of the sweep, allowing for chain progress between calls.
    const sweepStartedAt = performance.now();
    const sweep = [];
    for (const ep of eps) {
      const { rec, result, sampledAt } = await call(ep, "getSlot", paramsFor("getSlot", { commitment }));
      ep.calls.push({ round, ...rec });
      const valid = rec.ok && Number.isFinite(result);
      sweep.push(valid ? result - (sampledAt - sweepStartedAt) / ESTIMATED_SLOT_MS : null);
      if (valid) ep.slots.push(result);
    }
    const top = Math.max(...sweep.filter((s) => s != null));
    sweep.forEach((s, i) => { if (s != null) eps[i].lags.push(Math.round(top - s)); });

    for (const ep of eps) {
      for (const method of TIMED_METHODS.slice(1)) {
        if (method === "getTransaction" && !ep.signature) { ep.calls.push({ round, method, ok: false, kind: "skipped", ms: 0, status: null, code: null, message: "no signature from getSignaturesForAddress", retryAfterMs: null }); continue; }
        let { rec, result } = await call(ep, method, paramsFor(method, { address, commitment, signature: ep.signature, txVersion: ep.txVersion }));
        // A transaction newer than the version we said we can read (-32015 "Transaction version (1) is not supported
        // by the requesting client"): our request's fault, not the endpoint's. Ask once more with that version, keep
        // the second timing, and use that version from then on.
        const newer = method === "getTransaction" && rec.code === -32015 && /version \((\d+)\)/i.exec(rec.message || "");
        if (newer && Number(newer[1]) > ep.txVersion) {
          ep.txVersion = Number(newer[1]);
          ({ rec, result } = await call(ep, method, paramsFor(method, { address, commitment, signature: ep.signature, txVersion: ep.txVersion })));
          rec.note = `retried with maxSupportedTransactionVersion ${ep.txVersion}`;
        }
        if (method === "getSignaturesForAddress" && rec.ok) ep.signature = result?.[0]?.signature || ep.signature;
        if (method === "getTransaction" && rec.ok && result == null) { rec.ok = false; rec.kind = "empty"; rec.message = "transaction not found on this endpoint"; }
        ep.calls.push({ round, ...rec });
      }
    }
  }

  const probeList = probes === true ? DEFAULT_PROBES : Array.isArray(probes) ? probes : [];
  for (const ep of eps) {
    for (const p of probeList) {
      const { rec } = await call(ep, p.method, p.params);
      ep.probes.push({ name: p.name || p.method, method: p.method, supported: rec.ok, kind: rec.kind, ms: rec.ms, status: rec.status, code: rec.code, message: rec.message });
    }
  }

  if (ws) {
    for (const ep of eps) {
      if (ep.pauseUntil > Date.now()) await sleep(ep.pauseUntil - Date.now());
      const wsUrl = ep.raw.wsUrl || toWsUrl(ep.raw.url);
      const r = await wsCheck(wsUrl, { WebSocket: WS, timeoutMs });
      ep.ws = { url: redactUrl(wsUrl), ...r, error: clean(r.error) };
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    node: process.versions.node,
    settings: { rounds, delayMs, timeoutMs, address, commitment, ws: Boolean(ws) },
    endpoints: eps.map(summarizeEndpoint),
    note: "One location, one time window. Latency includes your own network path to each provider. Not a ranking of providers.",
  };
}

function summarizeEndpoint(ep) {
  const methods = {};
  for (const m of TIMED_METHODS) {
    const calls = ep.calls.filter((c) => c.method === m);
    const okMs = calls.filter((c) => c.ok).map((c) => c.ms);
    const errs = calls.filter((c) => !c.ok && c.kind !== "skipped");
    methods[m] = {
      calls: calls.filter((c) => c.kind !== "skipped").length,
      ok: okMs.length,
      errors: errs.length,
      skipped: calls.filter((c) => c.kind === "skipped").length,
      p50: percentile(okMs, 50), p90: percentile(okMs, 90), max: okMs.length ? Math.max(...okMs) : null,
      lastError: errs.length ? describeFailure(errs.at(-1)) : null,
    };
  }
  const all = [...ep.calls.filter((c) => c.kind !== "skipped"), ...ep.probes];
  const http = {};
  for (const c of all) if (c.status != null) http[c.status] = (http[c.status] || 0) + 1;
  const okAll = ep.calls.filter((c) => c.ok).map((c) => c.ms);
  return {
    index: ep.index,
    name: ep.name,
    url: ep.url,
    requests: all.length,
    errors: ep.calls.filter((c) => !c.ok && c.kind !== "skipped").length,   // timed methods only; refused probes are in `probes`
    rateLimited: all.filter((c) => c.status === 429).length,
    timeouts: all.filter((c) => c.kind === "timeout").length,
    http,
    latency: { p50: percentile(okAll, 50), p90: percentile(okAll, 90), max: okAll.length ? Math.max(...okAll) : null },
    slotLag: { samples: ep.lags.length, median: percentile(ep.lags, 50), max: ep.lags.length ? Math.max(...ep.lags) : null, lastSlot: ep.slots.at(-1) ?? null },
    methods,
    probes: ep.probes,
    ws: ep.ws,
    calls: ep.calls,

  };
}
