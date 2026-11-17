# API

```js
import {
  bench, formatTable, formatMarkdown,
  timedCall, describeFailure, wsCheck, toWsUrl,
  redactUrl, secretsOf, scrub, percentile,
  PUBLIC_RPC, DEFAULT_ADDRESS, TIMED_METHODS, DEFAULT_PROBES, BenchInputError,
} from "solana-rpc-bench";
```

## `bench(endpoints, options?) → Promise<BenchReport>`

`endpoints`: URL strings, or `{ url, wsUrl?, name? }`. `wsUrl` defaults to the URL with `http` swapped for `ws`.

| option | default | |
|---|---|---|
| `rounds` | `3` | times each timed method runs per endpoint (1 to 100) |
| `delayMs` | `250` | pause before every request after the first; one queue for all endpoints |
| `timeoutMs` | `10000` | per request (`AbortSignal.timeout`) and for the WebSocket check |
| `address` | wSOL mint | account for getBalance, getAccountInfo, getSignaturesForAddress |
| `commitment` | `"confirmed"` | for every timed method |
| `probes` | `true` | `true` = `DEFAULT_PROBES`, `false` = none, or your own `[{ name?, method, params }]` |
| `ws` | `false` | run the WebSocket check |
| `backoffMs` | `2000` | extra pause for an endpoint after it answers 429 (Retry-After wins if longer; capped at 10 s) |
| `onProgress` | none | `({ endpoint, method, ok, ms, kind }) => void` after each request |
| `fetch`, `WebSocket` | globals | swap in your own (tests, proxies, the `ws` package on Node 20) |

Order of requests, all sequential:

1. Each round: `getSlot` on every endpoint back to back (the slot sweep), then on each endpoint `getLatestBlockhash`,
   `getBalance`, `getAccountInfo` (zero-length data slice), `getSignaturesForAddress` (limit 1), `getTransaction`
   (for the signature just returned).
2. Each probe once per endpoint.
3. The WebSocket check once per endpoint.

Requests per endpoint: `6 × rounds + probes` (+1 WebSocket). If `getTransaction` returns error `-32015`
("Transaction version (N) is not supported"), it is asked once more with `maxSupportedTransactionVersion: N`; that
second timing is kept, the call carries a `note`, and the refused first attempt is not counted in the report.

### Report

```ts
{
  startedAt, finishedAt, node,
  settings: { rounds, delayMs, timeoutMs, address, commitment, ws },
  note: "One location, one time window. ...",
  endpoints: [{
    index, name, url,                 // url is redacted
    requests, errors, rateLimited, timeouts,
    http: { "200": 17, "429": 1 },    // status counts, probes included
    latency: { p50, p90, max },       // over successful timed calls
    slotLag: { samples, median, max, lastSlot },
    methods: { getSlot: { calls, ok, errors, skipped, p50, p90, max, lastError }, ... },
    probes: [{ name, method, supported, kind, ms, status, code, message }],
    ws: { url, ok, skipped?, openMs, subscribedMs, firstSlotMs, slot, error } | null,
    calls: [{ round, method, ok, kind, ms, status, code, message, retryAfterMs, note? }],
  }],
}
```

- `errors` counts failed timed calls; refused probes are reported in `probes`, not here. `rateLimited` counts every
  429, probes included.
- Latency is milliseconds from sending the request to having the full body. Percentiles are nearest-rank.
- `slotLag`: per round, the highest slot any endpoint returned in the sweep minus this endpoint's slot.
- `kind`: `ok`, `rpc-error` (JSON-RPC error), `http-error`, `timeout`, `network`, `bad-json`, `empty`
  (getTransaction returned null), `skipped` (no signature to look up).

## `formatTable(report)` / `formatMarkdown(report)`

Text for a terminal; Markdown with a summary table, a per-method table and a support table.

## `timedCall(url, method, params, { fetch?, timeoutMs? }) → Promise<CallRecord>`

One JSON-RPC call that never throws; every outcome is a record (`ok`, `kind`, `ms`, `status`, `code`, `message`,
`retryAfterMs`, `result`). `describeFailure(record)` turns a failed one into one line.

## `wsCheck(wsUrl, { WebSocket?, timeoutMs? }) → Promise<WsResult>`

Opens the socket, sends `slotSubscribe`, records `openMs`, `subscribedMs`, `firstSlotMs` (all from the start), then
sends `slotUnsubscribe` and closes. Without a WebSocket class (Node 20) it resolves `{ skipped: true, error: "..." }`
instead of failing.

## Redaction

- `redactUrl(url)`: user info, secret-looking query values (`api-key`, `token`, `key`, `auth`, ... or any value of
  20+ characters) and token-like path segments (16+ URL-safe characters with a digit, or 24+ characters) become
  `***`. Host and ordinary path words stay.
- `secretsOf(url)`: those secret pieces.
- `scrub(text, urls)`: removes them from free text. Every message in a report has been through it.

## Errors

`BenchInputError` for bad input (no URLs, non-http URL, rounds out of range), thrown before any request. Endpoint
failures are never thrown; they are in the report.
