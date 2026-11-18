import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bench, timedCall, redactUrl, scrub, wsCheck, toWsUrl, formatTable, formatMarkdown, percentile, BenchInputError, TIMED_METHODS } from "../src/index.js";

// Real responses from https://api.mainnet-beta.solana.com, one per method, captured 2026-11-17: { status, body }.
const fx = (method) => JSON.parse(readFileSync(new URL(`./fixtures/${method}.json`, import.meta.url), "utf8"));

const HELIUS = "https://mainnet.helius-rpc.com/?api-key=FAKE0000-not-a-real-key-0000-000000000000";
const ALCHEMY = "https://solana-mainnet.g.alchemy.com/v2/AbCdEfGhIjKlMnOpQrStUvWx12";
const QUICKNODE = "https://example-name.solana-mainnet.quiknode.pro/0123456789abcdef0123456789abcdef/";
const SECRETS = ["FAKE0000-not-a-real-key-0000-000000000000", "AbCdEfGhIjKlMnOpQrStUvWx12", "0123456789abcdef0123456789abcdef"];

function response(status, body, headers = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => text };
}

// A fetch that answers from the fixtures, per endpoint overrides, and records concurrency.
function fakeNet({ overrides = {}, slotOffset = {} } = {}) {
  const log = [];
  let inFlight = 0, maxInFlight = 0;
  const fetch = async (url, init) => {
    const { method, params } = JSON.parse(init.body);
    log.push({ url, method, params });
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((ok) => setTimeout(ok, 1));
    inFlight--;
    const o = overrides[url]?.[method];
    if (o) return typeof o === "function" ? o() : o;
    const f = fx(method);
    if (method === "getSlot") return response(200, { ...f.body, result: f.body.result - (slotOffset[url] || 0) });
    return response(f.status, f.body);
  };
  return { fetch, log, maxInFlight: () => maxInFlight };
}

test("redactUrl hides keys in query strings, path segments and user info", () => {
  assert.equal(redactUrl(HELIUS), "https://mainnet.helius-rpc.com/?api-key=***");
  assert.equal(redactUrl(ALCHEMY), "https://solana-mainnet.g.alchemy.com/v2/***");
  assert.equal(redactUrl(QUICKNODE), "https://example-name.solana-mainnet.quiknode.pro/***/");
  assert.equal(redactUrl("https://user:pa55word@rpc.example.com/"), "https://***@rpc.example.com/");
  assert.equal(redactUrl("https://api.mainnet-beta.solana.com"), "https://api.mainnet-beta.solana.com");
  assert.equal(redactUrl("https://rpc.example.com/solana/mainnet?cluster=mainnet&token=abc12345"), "https://rpc.example.com/solana/mainnet?cluster=mainnet&token=***");
  assert.equal(redactUrl("not a url"), "invalid-url");
});

test("scrub removes secrets from free text such as error messages", () => {
  const msg = `fetch failed for ${ALCHEMY} (key AbCdEfGhIjKlMnOpQrStUvWx12)`;
  const s = scrub(msg, [ALCHEMY]);
  assert.ok(!s.includes("AbCdEfGhIjKlMnOpQrStUvWx12"));
  assert.match(s, /alchemy\.com\/v2\/\*\*\*/);
});

test("timedCall turns every outcome into a record", async () => {
  const ok = await timedCall("https://x", "getSlot", [], { fetch: async () => response(200, fx("getSlot").body) });
  assert.equal(ok.ok, true); assert.equal(typeof ok.result, "number");
  const limited = await timedCall("https://x", "getTokenLargestAccounts", [], { fetch: async () => response(429, fx("getTokenLargestAccounts").body, { "retry-after": "3" }) });
  assert.deepEqual([limited.ok, limited.kind, limited.status, limited.code, limited.retryAfterMs], [false, "http-error", 429, 429, 3000]);
  const rpcErr = await timedCall("https://x", "nope", [], { fetch: async () => response(200, { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } }) });
  assert.deepEqual([rpcErr.kind, rpcErr.code], ["rpc-error", -32601]);
  const timeout = await timedCall("https://x", "getSlot", [], { fetch: async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); }, timeoutMs: 5 });
  assert.equal(timeout.kind, "timeout");
  const net = await timedCall("https://x", "getSlot", [], { fetch: async () => { throw Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } }); } });
  assert.deepEqual([net.kind, net.message], ["network", "ENOTFOUND"]);
  const html = await timedCall("https://x", "getSlot", [], { fetch: async () => response(200, "<html>") });
  assert.equal(html.kind, "bad-json");
  let signal;
  await timedCall("https://x", "getSlot", [], { fetch: async (_, init) => { signal = init.signal; return response(200, fx("getSlot").body); } });
  assert.ok(signal instanceof AbortSignal, "every request carries a timeout signal");
});

test("bench: sequential, slot lag against the highest adjusted slot, signature reused, probes classified", async () => {
  const A = "https://a.example/", B = HELIUS;
  const net = fakeNet({ slotOffset: { [B]: 3 } });
  const r = await bench([A, B], { rounds: 2, delayMs: 0, backoffMs: 0, fetch: net.fetch, ws: false });
  assert.equal(net.maxInFlight(), 1, "never more than one request at a time");
  const perEndpoint = TIMED_METHODS.length * 2 + 3;
  assert.equal(net.log.length, perEndpoint * 2);
  const [a, b] = r.endpoints;
  assert.deepEqual([a.slotLag.median, a.slotLag.max, b.slotLag.median, b.slotLag.max], [0, 0, 3, 3]);
  assert.equal(a.methods.getTransaction.ok, 2);
  const sig = fx("getSignaturesForAddress").body.result[0].signature;
  assert.ok(net.log.filter((c) => c.method === "getTransaction").every((c) => c.params[0] === sig));
  const probes = Object.fromEntries(a.probes.map((p) => [p.method, p]));
  assert.equal(probes.getTokenLargestAccounts.supported, false);
  assert.equal(probes.getTokenLargestAccounts.status, 429);
  assert.equal(probes.getProgramAccounts.supported, true);
  assert.equal(probes.getRecentPrioritizationFees.supported, true);
  assert.equal(a.rateLimited, 1);
  assert.equal(a.errors, 0);
  assert.equal(a.http["200"], perEndpoint - 1);
  const everything = JSON.stringify(r) + formatTable(r) + formatMarkdown(r);
  for (const s of SECRETS.slice(0, 1)) assert.ok(!everything.includes(s), "Helius key never appears");
  assert.ok(everything.includes("https://mainnet.helius-rpc.com/?api-key=***"));
});

test("bench waits delayMs between requests and backs off after a 429", async () => {
  const net = fakeNet({ overrides: { "https://a.example/": { getLatestBlockhash: () => response(429, { error: { code: 429, message: "slow down" } }) } } });
  const t0 = Date.now();
  const r = await bench(["https://a.example/"], { rounds: 1, delayMs: 20, backoffMs: 150, probes: false, fetch: net.fetch });
  const took = Date.now() - t0;
  // 6 requests: 5 gaps of 20 ms, one of which is stretched to 150 ms by the 429.
  assert.ok(took >= 20 * 4 + 150 - 10, `took ${took} ms`);
  assert.equal(r.endpoints[0].rateLimited, 1);
  assert.equal(r.endpoints[0].methods.getLatestBlockhash.errors, 1);
  assert.match(r.endpoints[0].methods.getLatestBlockhash.lastError, /429/);
});

test("bench compares successful slots at a common time within the sweep", async (t) => {
  const endpoints = ["https://a.example/", "https://b.example/", "https://c.example/", "https://d.example/"];
  const { body } = fx("getSlot");
  const slots = [body.result, null, body.result + 2, body.result + 1];
  const responseTimes = [800, 200, 400, 400];
  const fallback = fakeNet();
  let elapsed = 0;
  t.mock.method(performance, "now", () => elapsed);
  const fetch = async (url, init) => {
    const { method } = JSON.parse(init.body);
    if (method !== "getSlot") return fallback.fetch(url, init);
    const index = endpoints.indexOf(url);
    elapsed += responseTimes[index];
    const slot = slots[index];
    if (slot === null) return response(503, "unavailable");
    return response(200, { ...body, result: slot });
  };

  const { endpoints: report } = await bench(endpoints, { rounds: 1, delayMs: 0, probes: false, fetch });
  assert.deepEqual(report.map(({ slotLag }) => slotLag.median), [0, null, 0, 2]);
  assert.deepEqual(report.map(({ slotLag }) => slotLag.lastSlot), slots);
});

test("errors from a keyed endpoint are scrubbed and getTransaction is skipped without a signature", async () => {
  const net = fakeNet({ overrides: { [ALCHEMY]: {
    getSignaturesForAddress: () => response(200, { jsonrpc: "2.0", id: 1, error: { code: -32000, message: `upstream ${ALCHEMY} failed` } }),
    getBalance: () => { throw new Error(`connect ECONNREFUSED ${ALCHEMY}`); },
  } } });
  const r = await bench([ALCHEMY], { rounds: 1, delayMs: 0, probes: false, fetch: net.fetch });
  const e = r.endpoints[0];
  assert.equal(e.methods.getTransaction.skipped, 1);
  assert.equal(e.methods.getTransaction.calls, 0);
  assert.equal(e.errors, 2);
  const out = JSON.stringify(r) + formatTable(r) + formatMarkdown(r);
  assert.ok(!out.includes(SECRETS[1]));
  assert.match(e.methods.getSignaturesForAddress.lastError, /v2\/\*\*\*/);
});

test("a newer transaction version is retried once with that version, then remembered", async () => {
  // The public RPC's -32015 reply for a v1 transaction asked with maxSupportedTransactionVersion 0 (2026-11-17; the start\n  // of the message is verbatim, the tail is reconstructed).
  const versionError = { jsonrpc: "2.0", id: 1, error: { code: -32015, message: "Transaction version (1) is not supported by the requesting client. Please try the request again with the following configuration parameter: \"maxSupportedTransactionVersion\": 1" } };
  const log = [];
  const net = fakeNet();
  const fetch = async (url, init) => {
    const { method, params } = JSON.parse(init.body);
    if (method !== "getTransaction") return net.fetch(url, init);
    log.push(params[1].maxSupportedTransactionVersion);
    return params[1].maxSupportedTransactionVersion >= 1 ? response(200, fx("getTransaction").body) : response(200, versionError);
  };
  const r = await bench(["https://a.example/"], { rounds: 2, delayMs: 0, probes: false, fetch });
  assert.deepEqual(log, [0, 1, 1]);
  const tx = r.endpoints[0].methods.getTransaction;
  assert.deepEqual([tx.ok, tx.calls, tx.errors], [2, 2, 0]);
  assert.match(r.endpoints[0].calls.find((c) => c.method === "getTransaction").note, /maxSupportedTransactionVersion 1/);
});

test("bad input is refused before any request", async () => {
  const fetch = () => { throw new Error("no requests expected"); };
  await assert.rejects(bench([], { fetch }), BenchInputError);
  await assert.rejects(bench(["ftp://x"], { fetch }), BenchInputError);
  await assert.rejects(bench(["https://x"], { rounds: 0, fetch }), BenchInputError);
});

// A WebSocket double that answers slotSubscribe and sends one slot.
class FakeWs {
  static sent = [];
  constructor(url) { this.url = url; setTimeout(() => this.onopen?.(), 2); }
  send(text) {
    const m = JSON.parse(text); FakeWs.sent.push(m.method);
    if (m.method === "slotSubscribe") {
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ jsonrpc: "2.0", id: 1, result: 42 }) }), 2);
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ jsonrpc: "2.0", method: "slotNotification", params: { result: { slot: 470000000, parent: 469999999, root: 469999968 }, subscription: 42 } }) }), 4);
    }
  }
  close() { this.closed = true; }
}

test("wsCheck times open, subscribe and first slot, then unsubscribes", async () => {
  FakeWs.sent = [];
  const r = await wsCheck("wss://x", { WebSocket: FakeWs, timeoutMs: 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.slot, 470000000);
  assert.ok(r.openMs <= r.subscribedMs && r.subscribedMs <= r.firstSlotMs);
  assert.deepEqual(FakeWs.sent, ["slotSubscribe", "slotUnsubscribe"]);
});

test("wsCheck is skipped with a note when there is no WebSocket (Node 20)", async () => {
  const r = await wsCheck("wss://x", { WebSocket: null });
  assert.equal(r.skipped, true);
  assert.match(r.error, /Node 22\+/);
});

test("wsCheck reports a refused subscription and a silent socket", async () => {
  class Refuse extends FakeWs { send() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ id: 1, error: { code: -32601, message: "Method not found" } }) }), 1); } }
  assert.match((await wsCheck("wss://x", { WebSocket: Refuse })).error, /refused/);
  class Silent extends FakeWs { send() {} }
  assert.match((await wsCheck("wss://x", { WebSocket: Silent, timeoutMs: 30 })).error, /within 30 ms/);
});

test("bench with ws derives the wss URL and keeps it redacted", async () => {
  const net = fakeNet();
  const r = await bench([HELIUS], { rounds: 1, delayMs: 0, probes: false, ws: true, WebSocket: FakeWs, fetch: net.fetch });
  assert.equal(r.endpoints[0].ws.url, "wss://mainnet.helius-rpc.com/?api-key=***");
  assert.equal(r.endpoints[0].ws.ok, true);
  assert.equal(toWsUrl("http://127.0.0.1:8899"), "ws://127.0.0.1:8899");
});

test("formatters render every section", async () => {
  const net = fakeNet({ slotOffset: { "https://b.example/": 1 } });
  const r = await bench(["https://a.example/", "https://b.example/"], { rounds: 1, delayMs: 0, backoffMs: 0, fetch: net.fetch });
  const t = formatTable(r), m = formatMarkdown(r);
  assert.match(t, /#2 https:\/\/b\.example\/\n/);
  assert.match(t, /slot lag \(adjusted\): median 1, max 1/);
  assert.match(t, /getTokenLargestAccounts\s+no: HTTP 429 \(code 429\): Too many requests/);
  assert.match(m, /\| method \| #1 \| #2 \|/);
  assert.match(m, /Not a ranking of providers/);
});

test("examples/html-report.js renders an escaped, key-free page", async () => {
  const { toHtml } = await import("../examples/html-report.js");
  const net = fakeNet();
  const r = await bench([HELIUS, "https://b.example/<x>"], { rounds: 1, delayMs: 0, backoffMs: 0, fetch: net.fetch });
  const html = toHtml(r);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<h2>Method support<\/h2>/);
  assert.match(html, /api-key=\*\*\*/);
  assert.match(html, /b\.example\/%3Cx%3E|&lt;x&gt;/);
  for (const s of SECRETS) assert.ok(!html.includes(s));
  assert.ok(!/<script/i.test(html));
});

test("percentile is nearest-rank", () => {
  assert.equal(percentile([5, 1, 3], 50), 3);
  assert.equal(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 90), 90);
  assert.equal(percentile([], 50), null);
});

test("CLI --help runs offline", () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/cli.js", import.meta.url)), "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /replaced with \*\*\*/);
});

test("live public RPC (LIVE=1 only)", { skip: !process.env.LIVE }, async () => {
  const r = await bench(["https://api.mainnet-beta.solana.com"], { rounds: 1, delayMs: 500, probes: false });
  assert.ok(r.endpoints[0].methods.getSlot.ok >= 1);
});
