// Keep API keys out of every line this tool prints. RPC providers put keys in three places: the query string
// (?api-key=..., Helius), a path segment (/v2/<key>, Alchemy; /<token>/, QuickNode) and, rarely, user:pass@host.

const SECRET_PARAM = /key|token|secret|auth|pass|sig|credential/i;

// A path segment that looks like a token: long, URL-safe characters only, and with a digit in it or long enough
// that no ordinary path word would be. "v2", "solana", "mainnet" survive; "a1b2c3...32 chars" does not.
function looksLikeToken(segment) {
  if (!/^[A-Za-z0-9_\-.~]+$/.test(segment)) return false;
  return (segment.length >= 16 && /\d/.test(segment)) || segment.length >= 24;
}

/** The secret pieces of a URL (so they can be scrubbed from error messages too). */
export function secretsOf(url) {
  const out = [];
  let u;
  try { u = new URL(url); } catch { return [String(url)]; }
  if (u.username) out.push(u.username);
  if (u.password) out.push(u.password);
  for (const [k, v] of u.searchParams) if (v && (SECRET_PARAM.test(k) || v.length >= 20)) out.push(v);
  for (const seg of u.pathname.split("/")) if (seg && looksLikeToken(seg)) out.push(seg);
  return out.filter((s) => s.length >= 4);
}

/**
 * The URL with its secrets replaced by "***". Host, port and ordinary path words are kept so you can still tell
 * endpoints apart.
 */
export function redactUrl(url) {
  let u;
  try { u = new URL(url); } catch { return "invalid-url"; }
  let out = `${u.protocol}//${u.username || u.password ? "***@" : ""}${u.host}`;
  out += u.pathname.split("/").map((seg) => (seg && looksLikeToken(seg) ? "***" : seg)).join("/");
  if ([...u.searchParams].length) {
    out += "?" + [...u.searchParams].map(([k, v]) => `${k}=${v && (SECRET_PARAM.test(k) || v.length >= 20) ? "***" : v}`).join("&");
  }
  return out.endsWith("/") && !String(url).endsWith("/") ? out.slice(0, -1) : out;
}

/** Replace every secret of these URLs that appears in text. */
export function scrub(text, urls) {
  let s = String(text ?? "");
  for (const url of urls) {
    s = s.split(String(url)).join(redactUrl(url));
    for (const secret of secretsOf(url)) s = s.split(secret).join("***");
  }
  return s;
}
