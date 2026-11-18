# solana-rpc-bench

**Solana RPC benchmark: compare Helius, QuickNode, Alchemy, Triton or the public endpoint from where you are, right now.** Latency per method, errors and 429s, slot lag against the other endpoints, which heavier methods each one serves, and a WebSocket check. API keys are hidden in every output. Sequential and gentle by default. Zero dependencies.

![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)
![node: 20+](https://img.shields.io/badge/node-20%2B-blue)
[![license: MIT](https://img.shields.io/badge/license-MIT-black)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/grokbot)
[![GitHub stars](https://img.shields.io/github/stars/blixvip/solana-rpc-bench?style=social)](https://github.com/blixvip/solana-rpc-bench/stargazers)

<a href="https://blixvip.com"><img src="assets/blix-hero.jpg" width="100%" alt="BLIX: AI-powered Solana memecoin terminal. Trade memes first."></a>

**[Start trading at blixvip.com →](https://blixvip.com)** &nbsp;·&nbsp; [Website and guides](https://blixvip.github.io/solana-rpc-bench/) &nbsp;·&nbsp; [Public API](https://blixvip.com/api) &nbsp;·&nbsp; [MCP server](https://blixvip.com/mcp) &nbsp;·&nbsp; [Discord](https://discord.gg/grokbot)

Built by the team behind **[Blix](https://blixvip.com)**, a Solana memecoin terminal that runs on several RPC keys at once.

If solana-rpc-bench saves you time, **[give it a ⭐](https://github.com/blixvip/solana-rpc-bench)**. It helps other Solana developers find it.

## The problem

Choosing an RPC provider, or choosing between the keys you already have, usually goes on reputation and a status page. What matters for your app is narrower: how fast this endpoint answers the methods you call, from your server, whether it is behind the chain, whether it rate-limits you, and whether it serves the heavier methods at all (`getProgramAccounts` with filters, `getTokenLargestAccounts`). That takes a few minutes of curl per endpoint, and the curl output has your API key in it.

## Features

- Times `getSlot`, `getLatestBlockhash`, `getBalance`, `getAccountInfo`, `getSignaturesForAddress` and `getTransaction` over N rounds: p50 / p90 / max, errors, HTTP status counts, 429 count, timeouts.
- Slot lag: each round compares the slot readings after adjusting for time between requests.
- Support probes: `getTokenLargestAccounts`, `getProgramAccounts` with filters (a tiny query), `getRecentPrioritizationFees`, or your own list.
- Optional WebSocket check: time to open, to `slotSubscribe` confirmation and to the first slot notification (Node 22+; skipped with a note on Node 20).
- Text table, `--json`, `--markdown`, or `--csv` for spreadsheets.
- API keys redacted from URLs and error messages: query-string keys, path tokens, user info.
- One request at a time with a delay between them (250 ms default), extra back-off after a 429. Never parallel.
- TypeScript declarations. Works with any Solana RPC; nothing here calls a Blix service.

## Install

```bash
npm install github:blixvip/solana-rpc-bench
```

Node 20 or newer (22+ for the WebSocket check). No dependencies.

## Quick start

CLI:

```bash
npx github:blixvip/solana-rpc-bench https://api.mainnet-beta.solana.com --rounds 1 --delay 500 --ws
# or several: SOLANA_RPC_URLS="https://a...,https://b..." npx github:blixvip/solana-rpc-bench
```

A real run from one machine on 2026-11-17 (`--quiet` hides the per-request progress on stderr):

```
solana-rpc-bench  2026-11-17T21:23:38.431Z  1 round, 500 ms between requests, commitment confirmed

#1 https://api.mainnet-beta.solana.com
  requests 9, errors 0, 429s 1, timeouts 0; HTTP 200 x8, 429 x1
  slot lag (adjusted): median 0, max 0 (1 samples, last slot 470682967)
  method                         ok   p50 ms   p90 ms   max ms  last error
  getSlot                       1/1      290      290      290
  getLatestBlockhash            1/1       89       89       89
  getBalance                    1/1      118      118      118
  getAccountInfo                1/1      116      116      116
  getSignaturesForAddress       1/1       95       95       95
  getTransaction                1/1      101      101      101
  supports:
    getTokenLargestAccounts       no: HTTP 429 (code 429): Too many requests for a specific RPC call
    getProgramAccounts (filters)  yes (297 ms)
    getRecentPrioritizationFees   yes (96 ms)
  websocket wss://api.mainnet-beta.solana.com: open 288 ms, subscribed 379 ms, first slot 595 ms

One location, one time window. Latency includes your own network path to each provider. Not a ranking of providers.
```

The one 429 is the public endpoint refusing `getTokenLargestAccounts`, which it does for every caller. A keyed URL shows as `https://mainnet.helius-rpc.com/?api-key=***`.

Library:

```js
import { bench, formatTable } from "solana-rpc-bench";

const report = await bench(
  ["https://api.mainnet-beta.solana.com", process.env.MY_RPC_URL].filter(Boolean),
  { rounds: 3, delayMs: 300, ws: false },
);
console.log(formatTable(report));
report.endpoints[0].methods.getAccountInfo.p50;   // ms
report.endpoints[0].slotLag.max;                  // estimated slots behind the best reading
report.endpoints[0].probes;                       // [{ name, supported, kind, status, code, message, ms }]
```

## Examples

| | |
|---|---|
| [`examples/compare.js`](examples/compare.js) | bench `SOLANA_RPC_URLS` (or the public RPC) for one round and pick by your own rule |
| [`examples/custom-probes.js`](examples/custom-probes.js) | check an endpoint for the methods your app needs |
| [`examples/redact.js`](examples/redact.js) | how keyed URLs appear in output (offline) |
| [`examples/html-report.js`](examples/html-report.js) | turn `--json` output into one self-contained HTML page: `node bin/cli.js --json --quiet \| node examples/html-report.js > report.html` |
| [`examples/github-action/bench.yml`](examples/github-action/bench.yml) | copy to `.github/workflows/` in your repository: benches `SOLANA_RPC_URLS` (a repository secret) daily and puts the Markdown report in the job summary |

Guides on the project site: [How to test Solana RPC latency](https://blixvip.github.io/solana-rpc-bench/how-to-test-solana-rpc-latency.html) · [Why your Solana RPC returns 429, and what to do](https://blixvip.github.io/solana-rpc-bench/solana-rpc-429-too-many-requests.html)

## API

`bench`, `formatTable`, `formatMarkdown`, `formatCsv`, `timedCall`, `describeFailure`, `wsCheck`, `toWsUrl`, `redactUrl`, `secretsOf`, `scrub`, `percentile`, the constants and `BenchInputError`. Full reference and the report shape in [docs/API.md](docs/API.md); types in [index.d.ts](index.d.ts).

## Configuration

| CLI | library | default | |
|---|---|---|---|
| `url ...` / `SOLANA_RPC_URLS` | `endpoints` | the public mainnet RPC | comma list in the env var |
| `--rounds` | `rounds` | 3 | |
| `--delay` | `delayMs` | 250 | between any two requests |
| `--timeout` | `timeoutMs` | 10000 | per request |
| `--address` | `address` | wSOL mint | account used by the account and signature methods |
| `--ws` | `ws` | off | WebSocket check |
| `--no-probes` | `probes: false` | probes on | |
| `--json` / `--markdown` / `--csv` | `formatMarkdown()` / `formatCsv()` | text | |
| `--quiet` | `onProgress` | progress on | |

With three rounds and the default probes, each endpoint gets 21 requests (22 with `--ws`). The public endpoint (`api.mainnet-beta.solana.com`) is free and rate limited; Helius, QuickNode, Alchemy, Triton and others are third-party services with their own free tiers and limits. Benchmarking a provider spends your quota there.

## How it works

Every request is a plain JSON-RPC POST with `AbortSignal.timeout`, timed from send to the full body. Requests go out one at a time through a single queue, so endpoints never compete with each other for your bandwidth, and a 429 pauses that endpoint for `backoffMs` (or Retry-After, up to 10 s).

Each round starts with a **slot sweep**: `getSlot` on every endpoint back to back, at the same commitment. The benchmark estimates each reading's slot at the start of the sweep using its request midpoint and 400 ms per slot. It rounds the gap from the highest adjusted reading to a whole slot. Then each endpoint runs the other five methods; `getTransaction` looks up the signature `getSignaturesForAddress` just returned, so it tests a recent transaction the endpoint itself listed. If that transaction is newer than the version requested (`-32015`), it is asked once more with the version the node names.

Probes run once per endpoint after the rounds. The `getProgramAccounts` probe asks the Config program for accounts of data size 1 with a zero-length slice: it uses filters, matches nothing, and returns almost no data. The WebSocket check opens the socket, subscribes to slots, waits for one notification, unsubscribes and closes.

## Reading the results honestly

- **One place, one time.** The numbers are your network path to each provider at that moment. A provider that is 40 ms from your laptop can be 5 ms from a server in the right region, or 200 ms from the wrong one. Run it where your app runs.
- **Not a ranking of providers.** Free tiers, paid tiers, shared and dedicated nodes behave differently; one run on one plan says nothing about another.
- **Few samples, wide error bars.** With 3 rounds, p90 is close to max. Use more rounds (and a longer delay) before drawing conclusions, and run at different times of day.
- **The first request pays for the connection.** DNS, TCP and TLS setup land on the first `getSlot` of each endpoint; that is why it is often the slowest line. Later requests reuse the connection.
- **Slot lag is an estimate.** The adjustment assumes 400 ms per slot and approximates when the endpoint read its slot. Look for gaps that persist across rounds.
- **A refusal is a fact about that endpoint and plan, today.** Providers change which methods they serve on which tier.
- **Latency is not throughput.** Sequential calls do not show how an endpoint holds up under your production load or how its rate limit behaves at 50 requests a second. This tool deliberately does not test that.

## Limitations

- No load or rate-limit testing, on purpose.
- The WebSocket URL is derived by swapping `http` for `ws`. Providers that use a different host or port for WebSockets need `{ url, wsUrl }` in the library (the CLI has no flag for it yet).
- Node 20 has no global WebSocket; the check is skipped with a note there (pass `WebSocket` from the `ws` package in the library if you need it).
- Redaction is pattern-based. It catches the common shapes (query keys, long path tokens, user info); a key hidden in a short path segment or in the hostname would not be caught. Check before you paste output publicly.
- Only HTTP JSON-RPC and slot subscriptions; no gRPC/Geyser, no transaction sending.

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Questions, ideas or claiming an issue: **[discord.gg/grokbot](https://discord.gg/grokbot)**. Tests run offline: `npm test`.

## Good first issues

New to the project? These are small, scoped and come with step-by-step instructions: **[good first issues](https://github.com/blixvip/solana-rpc-bench/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)**. Bigger pieces (a Docker image, a scheduled report, an HTML report flag) are under **[help wanted](https://github.com/blixvip/solana-rpc-bench/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)**, and the [roadmap issue](https://github.com/blixvip/solana-rpc-bench/issues/15) groups everything open. Questions go in [Discussions](https://github.com/blixvip/solana-rpc-bench/discussions) or the [Discord](https://discord.gg/grokbot).

## Related projects

| | |
|---|---|
| [solana-rpc-pool](https://github.com/blixvip/solana-rpc-pool) | A Solana RPC load balancer: once you know your endpoints, spread calls across them with failover |
| [solana-ws-keepalive](https://github.com/blixvip/solana-ws-keepalive) | Solana WebSocket subscriptions that reconnect on their own |

## Contributors

Every merged pull request is credited in the release notes. Pick a [good first issue](https://github.com/blixvip/solana-rpc-bench/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) or say hi in the [Discord](https://discord.gg/grokbot).

<a href="https://github.com/blixvip/solana-rpc-bench/graphs/contributors"><img src="https://contrib.rocks/image?repo=blixvip/solana-rpc-bench" alt="Contributors to solana-rpc-bench"></a>

## License

MIT
