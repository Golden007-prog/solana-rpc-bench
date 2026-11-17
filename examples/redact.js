// How endpoint URLs appear in every output: keys replaced with ***. Offline.
// node examples/redact.js
import { redactUrl } from "../src/index.js";

for (const url of [
  "https://mainnet.helius-rpc.com/?api-key=0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
  "https://solana-mainnet.g.alchemy.com/v2/AbCdEfGhIjKlMnOpQrStUvWx12",
  "https://example-name.solana-mainnet.quiknode.pro/0123456789abcdef0123456789abcdef/",
  "https://api.mainnet-beta.solana.com",
]) console.log(redactUrl(url));
