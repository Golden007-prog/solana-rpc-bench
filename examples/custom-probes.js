// Check whether an endpoint serves the methods your app needs, with your own probe list.
// node examples/custom-probes.js [url]
import { bench, PUBLIC_RPC } from "../src/index.js";

const url = process.argv[2] || process.env.SOLANA_RPC_URL || PUBLIC_RPC;
const report = await bench([url], {
  rounds: 1,
  delayMs: 500,
  probes: [
    { name: "getVersion", method: "getVersion", params: [] },
    { name: "getBlockHeight", method: "getBlockHeight", params: [{ commitment: "confirmed" }] },
  ],
});
for (const p of report.endpoints[0].probes) console.log(`${p.name.padEnd(16)} ${p.supported ? `yes, ${p.ms} ms` : `no (${p.kind} ${p.status ?? ""} ${p.message ?? ""})`}`);
