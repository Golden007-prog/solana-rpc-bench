// Turn a bench report into one self-contained HTML page (no scripts, no external files): a summary table, p50 per
// method, method support and the WebSocket line. Keys are already redacted in the report.
//
//   npx github:blixvip/solana-rpc-bench --json --quiet > report.json
//   node examples/html-report.js report.json > report.html
//
// With no file argument it reads the JSON from stdin:
//   node bin/cli.js --json --quiet | node examples/html-report.js > report.html
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const esc = (s) => String(s ?? "-").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ms = (v) => (v == null ? "-" : `${v}`);

/** @param {object} report a bench() report (or the CLI's --json output) */
export function toHtml(report) {
  const eps = report.endpoints;
  const methods = Object.keys(eps[0]?.methods || {});
  const probes = eps[0]?.probes.map((p) => p.name) || [];
  const s = report.settings;
  const row = (cells, tag = "td") => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
  const head = (cells) => row(cells.map(esc), "th");
  // Fastest p50 per method gets a highlight, so the table reads at a glance.
  const best = (m) => Math.min(...eps.map((e) => e.methods[m].p50 ?? Infinity));

  const summary = eps.map((e) => row([
    esc(e.index), `<code>${esc(e.name)}</code>`, esc(ms(e.latency.p50)), esc(ms(e.latency.p90)), esc(ms(e.latency.max)),
    esc(e.errors), esc(e.rateLimited), esc(`${ms(e.slotLag.median)} / ${ms(e.slotLag.max)}`),
  ])).join("\n");
  const perMethod = methods.map((m) => row([`<code>${esc(m)}</code>`, ...eps.map((e) => {
    const r = e.methods[m];
    const text = `${ms(r.p50)} <small>(${r.ok}/${r.calls})</small>`;
    return r.p50 != null && r.p50 === best(m) && eps.length > 1 ? `<b>${text}</b>` : text;
  })])).join("\n");
  const support = probes.map((name) => row([`<code>${esc(name)}</code>`, ...eps.map((e) => {
    const p = e.probes.find((x) => x.name === name);
    if (!p) return "-";
    return p.supported ? `<span class="yes">yes</span> ${esc(p.ms)} ms` : `<span class="no">no</span> <small>${esc(p.status ? `HTTP ${p.status}` : p.kind)}${p.message ? `: ${esc(p.message.slice(0, 90))}` : ""}</small>`;
  })])).join("\n");
  const ws = eps.filter((e) => e.ws).map((e) => {
    const w = e.ws;
    const text = w.skipped ? `skipped: ${w.error}` : !w.ok ? `failed: ${w.error}` : `open ${w.openMs} ms, subscribed ${w.subscribedMs} ms, first slot ${w.firstSlotMs} ms`;
    return `<li>#${esc(e.index)} <code>${esc(w.url)}</code>: ${esc(text)}</li>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Solana RPC bench, ${esc(report.startedAt)}</title>
<style>
:root{color-scheme:light dark;--line:#8884}
body{margin:0 auto;max-width:960px;padding:24px 16px;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;margin:0 0 20px}th,td{border:1px solid var(--line);padding:6px 9px;text-align:left;white-space:nowrap}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.92em}.yes{color:#2a9d4b;font-weight:600}.no{color:#d0453a;font-weight:600}small{opacity:.75}footer{opacity:.75;font-size:13px}
</style>
</head>
<body>
<h1>Solana RPC bench</h1>
<p>${esc(report.startedAt)} &middot; ${esc(s.rounds)} round(s), ${esc(s.delayMs)} ms between requests, timeout ${esc(s.timeoutMs)} ms, commitment <code>${esc(s.commitment)}</code>, Node ${esc(report.node)}</p>
<h2>Summary</h2>
<div class="wrap"><table>
${head(["#", "endpoint", "p50 ms", "p90 ms", "max ms", "errors", "429s", "slot lag (median / max)"])}
${summary}
</table></div>
<h2>p50 latency by method (ms, ok/calls)</h2>
<div class="wrap"><table>
${head(["method", ...eps.map((e) => `#${e.index}`)])}
${perMethod}
</table></div>
${probes.length ? `<h2>Method support</h2>\n<div class="wrap"><table>\n${head(["method", ...eps.map((e) => `#${e.index}`)])}\n${support}\n</table></div>` : ""}
${ws ? `<h2>WebSocket (slotSubscribe)</h2>\n<ul>\n${ws}\n</ul>` : ""}
<footer><p>${esc(report.note)}</p><p>Made with <a href="https://github.com/blixvip/solana-rpc-bench">solana-rpc-bench</a> by <a href="https://blixvip.com">Blix</a>.</p></footer>
</body>
</html>
`;
}

// Run as a script: report JSON from a file argument or stdin, HTML to stdout.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  const text = file ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
  process.stdout.write(toHtml(JSON.parse(text)));
}
