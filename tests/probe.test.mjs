import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const probeScript = fileURLToPath(new URL("../scripts/probe.mjs", import.meta.url));

// A stateless server that answers the 2025 initialize handshake and tools/list without a token, and
// answers 401 to everything else: the 2026 discover request, a GET, a request with a session id.
// `gated` answers 401 to every request, as a server that needs sign-in before any handshake does.
function fakeServer({ gated }) {
  const seen = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let msg = {};
      try {
        msg = JSON.parse(body);
      } catch {}
      seen.push(`${req.method} ${msg.method ?? "-"}`);
      const deny = () => {
        res.writeHead(401, { "www-authenticate": 'Bearer resource_metadata="http://127.0.0.1/.well-known/oauth-protected-resource"' });
        res.end('{"error":"unauthorized"}');
      };
      if (gated || req.method !== "POST" || req.headers["mcp-session-id"]) return deny();
      const reply = (result) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
      };
      if (msg.method === "initialize") {
        return reply({ protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1.0.0" } });
      }
      if (msg.method === "notifications/initialized") {
        res.writeHead(202);
        return res.end();
      }
      if (msg.method === "tools/list") {
        return reply({ tools: [{ name: "a", inputSchema: { type: "object" } }, { name: "b", inputSchema: { type: "object" } }] });
      }
      return deny();
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}/mcp` })));
}

async function probeOne(url) {
  const dir = await mkdtemp(join(tmpdir(), "agora-probe-"));
  const catalog = join(dir, "katalog.json");
  const out = join(dir, "probe.json");
  await writeFile(catalog, JSON.stringify({ source: "test", fetchedAt: "2026-10-30T00:00:00Z", servers: [{ name: "t/one", status: "active", remotes: [{ type: "streamable-http", url }] }] }));
  await run(process.execPath, [probeScript, "--fresh", "--catalog", pathToFileURL(catalog).href, "--out", pathToFileURL(out).href]);
  return JSON.parse(await readFile(out, "utf8")).results["t/one"];
}

test("a server that refuses the 2026 discover request but answers initialize without a token is listed with its tools", async () => {
  const { server, seen, url } = await fakeServer({ gated: false });
  try {
    const r = await probeOne(url);
    assert.equal(r.result, "ok", JSON.stringify({ r, seen }));
    assert.equal(r.toolCount, 2);
    assert.ok(seen.includes("POST initialize"), seen.join(", "));
  } finally {
    server.close();
  }
});

test("a server that answers 401 to the discover request and to initialize stays classed as sign-in", async () => {
  const { server, url } = await fakeServer({ gated: true });
  try {
    const r = await probeOne(url);
    assert.equal(r.result, "auth");
  } finally {
    server.close();
  }
});
