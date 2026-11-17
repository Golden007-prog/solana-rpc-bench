// One timed JSON-RPC call. It never throws: every outcome becomes a record, because a refusal is a result here.

/** Thrown only for bad input to the library (not for endpoint failures, which are recorded). */
export class BenchInputError extends Error {
  constructor(message) { super(message); this.name = "BenchInputError"; }
}

/**
 * @returns {Promise<{ method: string, ok: boolean, kind: "ok"|"rpc-error"|"http-error"|"timeout"|"network"|"bad-json",
 *   ms: number, status: number|null, code: number|null, message: string|null, result?: any, retryAfterMs: number|null }>}
 */
export async function timedCall(url, method, params, { fetch: fetchFn = globalThis.fetch, timeoutMs = 10_000, now = () => performance.now() } = {}) {
  const t0 = now();
  const rec = { method, ok: false, kind: "ok", ms: 0, status: null, code: null, message: null, retryAfterMs: null };
  let res;
  try {
    res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    rec.ms = Math.round(now() - t0);
    if (e?.name === "TimeoutError" || e?.name === "AbortError") return { ...rec, kind: "timeout", message: `no answer within ${timeoutMs} ms` };
    return { ...rec, kind: "network", message: String(e?.cause?.code || e?.message || e) };
  }
  rec.status = res.status;
  const ra = Number(res.headers?.get?.("retry-after"));
  if (ra > 0) rec.retryAfterMs = ra * 1000;
  let text = "";
  try { text = await res.text(); } catch {}
  rec.ms = Math.round(now() - t0);   // to the full body: what your code waits for
  let body = null;
  try { body = JSON.parse(text); } catch {}
  if (!res.ok) return { ...rec, kind: "http-error", code: body?.error?.code ?? null, message: body?.error?.message || text.slice(0, 160) || `HTTP ${res.status}` };
  if (!body) return { ...rec, kind: "bad-json", message: "reply was not JSON" };
  if (body.error) return { ...rec, kind: "rpc-error", code: body.error.code ?? null, message: String(body.error.message || "RPC error").slice(0, 200) };
  return { ...rec, ok: true, result: body.result };
}

/** One line for a failed record: "HTTP 429 (code 429): Too many requests", "RPC error -32601: Method not found", "timeout: ...". */
export function describeFailure(rec) {
  const head = rec.kind === "http-error" ? `HTTP ${rec.status}${rec.code != null ? ` (code ${rec.code})` : ""}`
    : rec.kind === "rpc-error" ? `RPC error ${rec.code ?? ""}`.trim()
    : rec.kind;
  return rec.message ? `${head}: ${rec.message}` : head;
}
