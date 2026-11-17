#!/usr/bin/env node
// solana-rpc-bench [url...] [--rounds N] [--delay ms] [--timeout ms] [--address A] [--ws] [--no-probes] [--json|--markdown]
import { bench, formatTable, formatMarkdown, PUBLIC_RPC, redactUrl } from "../src/index.js";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const value = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const help = flag("-h") || flag("--help"), json = flag("--json"), markdown = flag("--markdown"), ws = flag("--ws"), noProbes = flag("--no-probes"), quiet = flag("--quiet");
const rounds = Number(value("--rounds") ?? 3), delayMs = Number(value("--delay") ?? 250), timeoutMs = Number(value("--timeout") ?? 10_000);
const address = value("--address");
const unknown = args.find((a) => a.startsWith("-"));

if (help || unknown) {
  console.log(`solana-rpc-bench: compare Solana RPC endpoints from here, now

  solana-rpc-bench <url> [url...]       or a comma list in SOLANA_RPC_URLS (default: the public mainnet RPC)
  --rounds <n>                          times each method is timed per endpoint (default 3)
  --delay <ms>                          pause between any two requests (default 250)
  --timeout <ms>                        per request (default 10000)
  --address <base58>                    account for getBalance/getAccountInfo/getSignaturesForAddress (default: wSOL mint)
  --ws                                  also time a WebSocket slotSubscribe (Node 22+)
  --no-probes                           skip the method-support checks
  --json | --markdown                   machine-readable or paste-ready output
  --quiet                               no progress on stderr

  API keys in URLs are replaced with *** in every output. Requests are sequential.
  Made by Blix: https://blixvip.com   Discord: https://discord.gg/grokbot`);
  if (unknown) console.error(`\nunknown option: ${unknown}`);
  process.exit(unknown ? 1 : 0);
}

let urls = args.length ? args : (process.env.SOLANA_RPC_URLS || "").split(",").map((s) => s.trim()).filter(Boolean);
if (!urls.length) { urls = [PUBLIC_RPC]; if (!quiet) console.error(`no URL given: using ${PUBLIC_RPC}`); }

const onProgress = quiet ? null : (e) => process.stderr.write(`  ${e.endpoint}  ${e.method}  ${e.ok ? `${e.ms} ms` : e.kind}\n`);
try {
  if (!quiet) console.error(`benchmarking ${urls.map(redactUrl).join(", ")}`);
  const report = await bench(urls, { rounds, delayMs, timeoutMs, ws, probes: !noProbes, onProgress, ...(address ? { address } : {}) });
  if (json) console.log(JSON.stringify(report, null, 2));
  else if (markdown) console.log(formatMarkdown(report));
  else console.log(formatTable(report));
} catch (e) { console.error(e.message); process.exit(1); }
