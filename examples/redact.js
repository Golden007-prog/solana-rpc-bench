// How endpoint URLs appear in every output: keys replaced with ***. Offline.
// node examples/redact.js
import { redactUrl } from "../src/index.js";

for (const url of [
  "https://mainnet.helius-rpc.com/?api-key=FAKE0000-not-a-real-key-0000-000000000000",
  "https://solana-mainnet.g.alchemy.com/v2/AbCdEfGhIjKlMnOpQrStUvWx12",
  "https://example-name.solana-mainnet.quiknode.pro/0123456789abcdef0123456789abcdef/",
  "https://api.mainnet-beta.solana.com",
]) console.log(redactUrl(url));
