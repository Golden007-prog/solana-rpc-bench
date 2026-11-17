// Compare the endpoints in SOLANA_RPC_URLS (comma list), or the public RPC alone. One round, no support probes.
// SOLANA_RPC_URLS="https://a...,https://b..." node examples/compare.js
import { bench, formatTable, PUBLIC_RPC } from "../src/index.js";

const urls = (process.env.SOLANA_RPC_URLS || PUBLIC_RPC).split(",").map((s) => s.trim()).filter(Boolean);
const report = await bench(urls, { rounds: 1, delayMs: 500, probes: false });
console.log(formatTable(report));

// Pick by your own rule, e.g. the lowest p50 among endpoints with no errors and no slot lag:
const fine = report.endpoints.filter((e) => e.errors === 0 && (e.slotLag.max ?? 0) <= 2);
fine.sort((a, b) => a.latency.p50 - b.latency.p50);
console.log("\nfastest clean endpoint this time:", fine[0]?.name ?? "none");
