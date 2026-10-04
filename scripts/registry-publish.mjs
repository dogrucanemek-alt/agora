// Publish server.json to the official MCP registry under com.openforallofus, using DNS authentication.
//
// The registry checks a TXT record on openforallofus.com ("v=MCPv1; k=ed25519; p=<public key>") and a
// timestamp signed with the matching private key. mcp-publisher only takes that key on the command
// line; this script reads it from a file instead, so it never appears in a process list or a log.
//
// Usage: node scripts/registry-publish.mjs [--dry-run]
//   key file: $AGORA_REGISTRY_KEY or ~/.config/agora/registry-ed25519.pem (PKCS#8 PEM, not in git)

import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const REGISTRY = "https://registry.modelcontextprotocol.io";
const DOMAIN = "openforallofus.com";
const keyFile = process.env.AGORA_REGISTRY_KEY ?? path.join(homedir(), ".config", "agora", "registry-ed25519.pem");
const server = JSON.parse(readFileSync(new URL("../server.json", import.meta.url), "utf8"));

const key = createPrivateKey(readFileSync(keyFile));
const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z"); // RFC 3339, seconds, like the Go publisher
const signed = sign(null, Buffer.from(timestamp), key).toString("hex");

const auth = await fetch(`${REGISTRY}/v0/auth/dns`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ domain: DOMAIN, timestamp, signed_timestamp: signed }),
});
const authBody = await auth.json().catch(() => ({}));
if (!auth.ok) throw new Error(`auth ${auth.status}: ${JSON.stringify(authBody).slice(0, 300)}`);
const token = authBody.registry_token;
if (!token) throw new Error("auth answered without a registry_token");
console.log(`auth ok for ${DOMAIN}`);

if (process.argv.includes("--dry-run")) process.exit(0);

const res = await fetch(`${REGISTRY}/v0/publish`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify(server),
});
const body = await res.text();
if (!res.ok) throw new Error(`publish ${res.status}: ${body.slice(0, 400)}`);
console.log(`published ${server.name} ${server.version}`);
