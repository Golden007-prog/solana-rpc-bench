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
