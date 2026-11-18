// Text, Markdown and CSV renderings of a bench() report, which is already redacted.
import { describeFailure } from "./call.js";

const ms = (v) => (v == null ? "-" : `${v}`);
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

function httpLine(http) {
  const parts = Object.entries(http).sort(([a], [b]) => a - b).map(([s, n]) => `${s} x${n}`);
  return parts.length ? parts.join(", ") : "no HTTP response";
}

function probeText(p) {
  if (p.supported) return `yes (${p.ms} ms)`;
  return `no: ${describeFailure(p).slice(0, 110)}`;
}

function wsText(w) {
  if (!w) return null;
  if (w.skipped) return `skipped: ${w.error}`;
  if (!w.ok) return `failed: ${w.error}${w.openMs != null ? ` (opened in ${w.openMs} ms)` : ""}`;
  return `open ${w.openMs} ms, subscribed ${w.subscribedMs} ms, first slot ${w.firstSlotMs} ms`;
}

/** A plain-text report for the terminal. */
export function formatTable(report) {
  const out = [];
  const s = report.settings;
  out.push(`solana-rpc-bench  ${report.startedAt}  ${s.rounds} round${s.rounds > 1 ? "s" : ""}, ${s.delayMs} ms between requests, commitment ${s.commitment}`);
  for (const e of report.endpoints) {
    out.push("", `#${e.index} ${e.name}`);
    out.push(`  requests ${e.requests}, errors ${e.errors}, 429s ${e.rateLimited}, timeouts ${e.timeouts}; HTTP ${httpLine(e.http)}`);
    out.push(`  slot lag (adjusted): median ${ms(e.slotLag.median)}, max ${ms(e.slotLag.max)} (${e.slotLag.samples} samples, last slot ${ms(e.slotLag.lastSlot)})`);
    out.push(`  ${pad("method", 26)}${lpad("ok", 7)}${lpad("p50 ms", 9)}${lpad("p90 ms", 9)}${lpad("max ms", 9)}  last error`);
    for (const [m, r] of Object.entries(e.methods)) {
      out.push(`  ${pad(m, 26)}${lpad(`${r.ok}/${r.calls}`, 7)}${lpad(ms(r.p50), 9)}${lpad(ms(r.p90), 9)}${lpad(ms(r.max), 9)}  ${r.lastError ? r.lastError.slice(0, 80) : r.skipped ? `skipped x${r.skipped}` : ""}`.trimEnd());
    }
    if (e.probes.length) {
      out.push("  supports:");
      for (const p of e.probes) out.push(`    ${pad(p.name, 30)}${probeText(p)}`);
    }
    const w = wsText(e.ws);
    if (w) out.push(`  websocket ${e.ws.url}: ${w}`);
  }
  out.push("", report.note);
  return out.join("\n");
}

const cell = (s) => String(s ?? "-").replace(/\|/g, "\\|").replace(/\n/g, " ");

/** A Markdown report: one summary table, one per-method table, one support table. */
export function formatMarkdown(report) {
  const s = report.settings;
  const eps = report.endpoints;
  const out = [];
  out.push(`## Solana RPC bench, ${report.startedAt}`, "");
  out.push(`${s.rounds} round(s), ${s.delayMs} ms between requests, timeout ${s.timeoutMs} ms, commitment \`${s.commitment}\`, Node ${report.node}.`, "");
  out.push("| # | endpoint | p50 ms | p90 ms | max ms | errors | 429s | slot lag (median / max) |");
  out.push("|---|---|---:|---:|---:|---:|---:|---|");
  for (const e of eps) out.push(`| ${e.index} | \`${cell(e.name)}\` | ${ms(e.latency.p50)} | ${ms(e.latency.p90)} | ${ms(e.latency.max)} | ${e.errors} | ${e.rateLimited} | ${ms(e.slotLag.median)} / ${ms(e.slotLag.max)} |`);
  const methods = Object.keys(eps[0]?.methods || {});
  out.push("", "### p50 latency by method (ms, ok/calls)", "");
  out.push(`| method | ${eps.map((e) => `#${e.index}`).join(" | ")} |`);
  out.push(`|---|${eps.map(() => "---:").join("|")}|`);
  for (const m of methods) out.push(`| ${m} | ${eps.map((e) => `${ms(e.methods[m].p50)} (${e.methods[m].ok}/${e.methods[m].calls})`).join(" | ")} |`);
  const probes = eps[0]?.probes.map((p) => p.name) || [];
  if (probes.length) {
    out.push("", "### Method support", "");
    out.push(`| method | ${eps.map((e) => `#${e.index}`).join(" | ")} |`);
    out.push(`|---|${eps.map(() => "---").join("|")}|`);
    for (const name of probes) out.push(`| ${name} | ${eps.map((e) => cell(probeText(e.probes.find((p) => p.name === name) || { supported: false, kind: "-" }))).join(" | ")} |`);
  }
  if (eps.some((e) => e.ws)) {
    out.push("", "### WebSocket (slotSubscribe)", "");
    for (const e of eps) out.push(`- #${e.index} \`${cell(e.ws.url)}\`: ${cell(wsText(e.ws))}`);
  }
  out.push("", `_${report.note}_`);
  return out.join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV for spreadsheets: one row per endpoint and timed method. */
export function formatCsv(report) {
  const rows = ["startedAt,endpoint,method,calls,ok,errors,p50_ms,p90_ms,max_ms,slot_lag_median,slot_lag_max"];
  for (const endpoint of report.endpoints) {
    for (const [method, stats] of Object.entries(endpoint.methods)) {
      rows.push([
        report.startedAt, endpoint.name, method, stats.calls, stats.ok, stats.errors,
        stats.p50, stats.p90, stats.max, endpoint.slotLag.median, endpoint.slotLag.max,
      ].map(csvCell).join(","));
    }
  }
  return rows.join("\r\n");
}
