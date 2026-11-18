import { test } from "node:test";
import assert from "node:assert/strict";
import { redactUrl, scrub } from "../src/redact.js";

test("redaction covers percent-encoded path tokens and query keys with +", () => {
  const a = "https://x.example.com/abcDEF1234567890ghiJK%2Babc/";
  const b = "https://x.example.com/?my+key=FAKEsecretvalue1&x=1";
  assert.equal(redactUrl(a), "https://x.example.com/***/");
  const out = scrub(`failed ${a} and ${b}`, [a, b]);
  assert.ok(!out.includes("abcDEF1234567890") && !out.includes("FAKEsecretvalue1"), out);
});
