# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-17

### Added

- `bench(endpoints, options)`: sequential rounds of getSlot, getLatestBlockhash, getBalance, getAccountInfo, getSignaturesForAddress and getTransaction per endpoint, with p50/p90/max latency, errors, HTTP status counts, 429s and timeouts.
- Slot lag per endpoint against the highest slot seen in each round's slot sweep.
- Support probes for getTokenLargestAccounts, getProgramAccounts with filters and getRecentPrioritizationFees, or a custom list.
- Optional WebSocket check (open, slotSubscribe confirmation, first slot notification) on Node 22+, skipped with a note on Node 20.
- getTransaction retries once with the transaction version a node names in error -32015.
- API-key redaction for URLs and error messages (`redactUrl`, `secretsOf`, `scrub`).
- `formatTable` and `formatMarkdown`; CLI with `--json` and `--markdown`.
- TypeScript declarations.

[1.0.0]: https://github.com/blixvip/solana-rpc-bench/releases/tag/v1.0.0
