# Verification log

Date: 2026-11-17. Machine: Windows 11, Node v24.15.0. Live checks: `https://api.mainnet-beta.solana.com` only, sequential, 500-700 ms between requests.

## Offline

```
> npm test
✔ redactUrl hides keys in query strings, path segments and user info
✔ scrub removes secrets from free text such as error messages
✔ timedCall turns every outcome into a record
✔ bench: sequential, slot lag against the highest slot, signature reused, probes classified
✔ bench waits delayMs between requests and backs off after a 429
✔ errors from a keyed endpoint are scrubbed and getTransaction is skipped without a signature
✔ a newer transaction version is retried once with that version, then remembered
✔ bad input is refused before any request
✔ wsCheck times open, subscribe and first slot, then unsubscribes
✔ wsCheck is skipped with a note when there is no WebSocket (Node 20)
✔ wsCheck reports a refused subscription and a silent socket
✔ bench with ws derives the wss URL and keeps it redacted
✔ formatters render every section
✔ percentile is nearest-rank
✔ CLI --help runs offline
﹣ live public RPC (LIVE=1 only) # SKIP
ℹ tests 16  pass 15  fail 0  skipped 1
```

`test/fixtures/<method>.json` are unmodified `{ status, body }` replies from the public RPC, one per method, captured
2026-11-17 (9 calls, 700 ms apart). `getTokenLargestAccounts` came back HTTP 429 with
`{"code":429,"message":"Too many requests for a specific RPC call"}`: the public endpoint does not serve it. The
`-32015` reply in the version-retry test starts with the text the public RPC returned in the first live run (below;
only its first ~80 characters were printed, the rest of the test message is reconstructed).

`index.d.ts` type-checked with TypeScript (`tsc --noEmit --strict`, module nodenext) against a usage file; exit 0.
No typecheck script is shipped (it would need a dev dependency).

README library snippet run offline with `globalThis.fetch` replaced by the fixtures and `MY_RPC_URL` set to a fake
Alchemy URL: 2 endpoints x 21 requests, second endpoint printed as `https://solana-mainnet.g.alchemy.com/v2/***`,
`getAccountInfo.p50`, `slotLag.max` and probe list printed as documented.

CLI offline (fixtures): `SOLANA_RPC_URLS="https://a.example/?api-key=SECRETSECRET123,https://b.example/" ... --markdown`
read both URLs from the env var and printed `https://a.example/?api-key=***` in progress and output.
`--bogus` prints help and exits 1.

`node examples/redact.js` (offline):

```
https://mainnet.helius-rpc.com/?api-key=***
https://solana-mainnet.g.alchemy.com/v2/***
https://example-name.solana-mainnet.quiknode.pro/***/
https://api.mainnet-beta.solana.com
```

## Live

**Run 1** `node bin/cli.js https://api.mainnet-beta.solana.com --rounds 1 --delay 500 --ws --quiet` (10 requests + 1 WebSocket):
found a real bug. The newest wSOL transaction was a **version 1** transaction and `getTransaction` with
`maxSupportedTransactionVersion: 0` failed:

```
getTransaction   0/1   -   -   -  RPC error -32015: Transaction version (1) is not supported by the requesting cli…
```

Fix: retry once with the version the node names, remember it per endpoint (`a newer transaction version is retried…`
test). One manual check (2 calls) confirmed the public RPC accepts `maxSupportedTransactionVersion: 1` and still
returns v0 transactions with it.

**Run 2** (same command with `--json`, rendered with `formatTable` / `formatMarkdown`; 9 requests + 1 WebSocket):
output pasted in the README Quick start. Markdown rendering:

```
| # | endpoint | p50 ms | p90 ms | max ms | errors | 429s | slot lag (median / max) |
|---|---|---:|---:|---:|---:|---:|---|
| 1 | `https://api.mainnet-beta.solana.com` | 101 | 290 | 290 | 0 | 1 | 0 / 0 |
...
| getTokenLargestAccounts | no: HTTP 429 (code 429): Too many requests for a specific RPC call |
| getProgramAccounts (filters) | yes (297 ms) |
| getRecentPrioritizationFees | yes (96 ms) |
- #1 `wss://api.mainnet-beta.solana.com`: open 288 ms, subscribed 379 ms, first slot 595 ms
```

`node examples/compare.js` (6 requests): all 6 methods ok, getSlot 387 ms (first request, connection setup),
others 72-103 ms; `fastest clean endpoint this time: https://api.mainnet-beta.solana.com`.

`node examples/custom-probes.js` (6 + 2 requests): `getVersion yes, 219 ms` / `getBlockHeight yes, 77 ms`.

## Not verified

- Node 20 was not run (only Node 24). The Node-20 WebSocket skip is covered by a test that passes `WebSocket: null`.
- No keyed or paid provider was benchmarked (none may be used here), so redaction was checked only against
  made-up URLs in the usual Helius / Alchemy / QuickNode shapes, and real refusals from other providers
  (e.g. `-32601`, 403) only via mocks.
- Slot lag across several real endpoints was not observed live (only one endpoint was allowed); it is covered by a
  mocked two-endpoint test.
- The 429 back-off was tested with a mock; live, only the probe's 429 occurred.
- `getTransaction` retry path ran only against a mock; the live run that would have used it happened before the fix.

## Known limitations

See README "Limitations" and "Reading the results honestly".

## Ecosystem pieces and project site (2026-11-17, Node v24.15.0)

`npm test`: 17 tests, 16 pass, 1 skipped (LIVE=1 only). New: `examples/html-report.js renders an escaped, key-free page`
(offline fixtures, a fake Helius key and a `<x>` in a URL: key absent, markup escaped, no `<script>`).

**`examples/github-action/bench.yml`**: parsed with PyYAML 6.0.3 (name, `workflow_dispatch` + `schedule`, 3 steps).
Not added as an active workflow in this repository. Its run step was executed locally in bash with
`GITHUB_STEP_SUMMARY` pointed at a temp file, `ROUNDS=1` and `SOLANA_RPC_URLS` empty, using the real
`npx --yes github:blixvip/solana-rpc-bench` from GitHub: exit 0 in 27 s, the summary file got the full Markdown report
(summary table, p50 by method, method support, WebSocket line: open 78 ms, subscribed 349 ms, first slot 455 ms). The
`actions/*` steps themselves were not run (that needs GitHub's runners).

**`examples/html-report.js`**: live, public RPC, one round each, 500-600 ms delay:
`node bin/cli.js --rounds 1 --delay 500 --json --quiet > report.json && node examples/html-report.js report.json > report.html`
(2613 bytes, sections Summary / p50 by method / Method support) and the stdin form
`node bin/cli.js --rounds 1 --delay 600 --no-probes --json --quiet | node examples/html-report.js > report2.html`
(no Method support section, as expected with `--no-probes`).

**Guide snippets** (docs/*.html), all run on this machine against the public RPC unless noted:
- curl `-w` timing of `getSlot`: `dns 0.008573s connect 0.075320s tls 0.145765s first byte 0.267736s total 0.267804s`.
- `latency.mjs` (10 sequential getSlot): p50 68 ms, p90 93 ms, first call 246 ms.
- `slotlag.mjs` with the public RPC and `https://solana-rpc.publicnode.com`: both lag 0.
- `curl -i` getTokenLargestAccounts: HTTP 429, `retry-after: 10`, `x-ratelimit-method-limit: 0` (headers quoted in the guide).
- `retry.mjs`: live, returns "not served by this endpoint (method limit 0)" in 0.5 s; against a local mock server
  (429, 429, 200, then 429 with Retry-After 1) it waited 704 ms and 1105 ms, returned slot 123, then gave up after 2 tries.
- The public-RPC limit table is quoted from solana-foundation/solana-com `apps/docs/content/docs/en/references/clusters.mdx`.
