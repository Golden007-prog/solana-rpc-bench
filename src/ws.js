// WebSocket check: open a socket, slotSubscribe, time the first slot notification, unsubscribe, close.

/** ws:// or wss:// for an http(s) RPC URL (same host, path and query: true for most providers, not all). */
export function toWsUrl(httpUrl) {
  return String(httpUrl).replace(/^http(s?):\/\//i, (_, s) => `ws${s}://`);
}

/**
 * @param {string} wsUrl
 * @param {{ WebSocket?: typeof WebSocket, timeoutMs?: number, now?: () => number }} [options]
 * @returns {Promise<{ skipped?: boolean, ok: boolean, openMs: number|null, subscribedMs: number|null, firstSlotMs: number|null, slot: number|null, error: string|null }>}
 */
export function wsCheck(wsUrl, { WebSocket: WS = globalThis.WebSocket, timeoutMs = 10_000, now = () => performance.now() } = {}) {
  if (typeof WS !== "function") {
    return Promise.resolve({ skipped: true, ok: false, openMs: null, subscribedMs: null, firstSlotMs: null, slot: null, error: `no global WebSocket in Node ${process.versions.node}: use Node 22+ for the WebSocket check` });
  }
  return new Promise((resolve) => {
    const t0 = now();
    const r = { ok: false, openMs: null, subscribedMs: null, firstSlotMs: null, slot: null, error: null };
    let ws, subId = null, done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) r.error = error;
      r.ok = !error && r.firstSlotMs != null;
      try { if (subId != null) ws.send(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "slotUnsubscribe", params: [subId] })); } catch {}
      try { ws.close(); } catch {}
      resolve(r);
    };
    const timer = setTimeout(() => finish(`no slot notification within ${timeoutMs} ms`), timeoutMs);
    try { ws = new WS(wsUrl); } catch (e) { finish(`could not open: ${e?.message || e}`); return; }
    ws.onopen = () => {
      r.openMs = Math.round(now() - t0);
      try { ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "slotSubscribe" })); } catch (e) { finish(`send failed: ${e?.message || e}`); }
    };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)); } catch { return; }
      if (m.id === 1) {
        if (m.error) return finish(`slotSubscribe refused: ${m.error.message || m.error.code}`);
        subId = m.result; r.subscribedMs = Math.round(now() - t0);
      } else if (m.method === "slotNotification") {
        r.firstSlotMs = Math.round(now() - t0);
        r.slot = m.params?.result?.slot ?? null;
        finish(null);
      }
    };
    ws.onerror = () => finish(r.openMs == null ? "could not connect" : "socket error");
    ws.onclose = (ev) => finish(`closed by the server${ev?.code ? ` (code ${ev.code})` : ""}`);
  });
}
