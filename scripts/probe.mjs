// Liveness probe: does each remote MCP server in the catalog answer a handshake?
//
// For every active server with a Streamable HTTP remote, connect (initialize) and list its tools.
// Nothing else: no tool is ever called. Requests carry a User-Agent that names us and links to the
// probe policy. At most one open connection per host, so a host serving many entries is not hammered.
//
// Output data/probe.json, rewritten every 250 results so a stopped run resumes where it left off.
// Usage: UV_THREADPOOL_SIZE=64 node scripts/probe.mjs [--fresh] [--retry] [--limit N] [--names a,b] [--out path]
// (Node resolves DNS on a 4-thread pool by default; dead domains then starve it and live servers time out.)

import { readFile, writeFile } from "node:fs/promises";
import { Client, StreamableHTTPClientTransport, UnauthorizedError } from "@modelcontextprotocol/client";

const OUT = new URL(process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "../data/probe.json", import.meta.url);
const UA = "agora-probe/0.1 (+https://openforallofus.com/probe)";
const TIMEOUT_MS = 12_000;
const GLOBAL = 24;
const args = process.argv.slice(2);
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const only = args.includes("--names") ? new Set(args[args.indexOf("--names") + 1].split(",")) : null;

const catalog = JSON.parse(await readFile(new URL("../data/katalog.json", import.meta.url), "utf8"));
let done = {};
if (!args.includes("--fresh")) {
  try {
    done = JSON.parse(await readFile(OUT, "utf8")).results;
  } catch {
    done = {};
  }
}

// --retry: probe again everything that failed for a network reason, to confirm it before it is counted.
const RETRY = new Set(["network_error", "timeout", "protocol_error", "refused"]);
if (args.includes("--retry")) for (const [n, r] of Object.entries(done)) if (RETRY.has(r.result)) delete done[n];

const targets = [];
for (const s of catalog.servers) {
  if (s.status !== "active" || done[s.name] || (only && !only.has(s.name))) continue;
  const remote = s.remotes.find((r) => r.type === "streamable-http");
  if (!remote) continue;
  if (remote.url.includes("{")) {
    done[s.name] = { result: "templated", at: new Date().toISOString() };
    continue;
  }
  let host;
  try {
    host = new URL(remote.url).host;
  } catch {
    done[s.name] = { result: "bad_url", at: new Date().toISOString() };
    continue;
  }
  targets.push({ name: s.name, url: remote.url, host });
  if (targets.length >= limit) break;
}

function classify(e) {
  if (e instanceof UnauthorizedError) return "auth";
  const status = e?.status ?? e?.code ?? e?.data?.status;
  if (status === 401 || status === 403) return "auth";
  if (typeof status === "number" && status >= 100 && status < 600) return `http_${status}`;
  const msg = String(e?.message ?? e);
  if (/\b401\b|\b403\b|unauthori[sz]ed|forbidden/i.test(msg)) return "auth";
  const m = msg.match(/\b(4\d\d|5\d\d)\b/);
  if (m) return `http_${m[1]}`;
  if (e?.name === "TimeoutError" || /timed? ?out|aborted/i.test(msg)) return "timeout";
  let code = e?.code;
  for (let c = e?.cause, i = 0; c && i < 5; c = c.cause, i++) code = typeof c.code === "string" ? c.code : code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "UND_ERR_SOCKET") return "refused";
  if (typeof code === "string" && /CERT|TLS|SSL/i.test(code)) return "tls";
  if (/fetch failed/i.test(msg)) return "network_error";
  return "protocol_error";
}

async function probe(t) {
  const t0 = Date.now();
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  // Remember every HTTP status the server sent: when the SDK reacts to a 401 by starting OAuth discovery
  // and that discovery fails, the error it throws no longer mentions the 401 we actually got.
  const statuses = [];
  const fetchWithUa = async (url, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("user-agent", UA);
    const res = await fetch(url, { ...init, headers, signal });
    if (String(url).startsWith(t.url)) statuses.push(res.status);
    return res;
  };
  // "auto": try the 2026 discover handshake first, fall back to the 2025 initialize handshake.
  const client = new Client({ name: "agora-probe", version: "0.1.0" }, { capabilities: {}, versionNegotiation: { mode: "auto" } });
  try {
    const transport = new StreamableHTTPClientTransport(new URL(t.url), { fetch: fetchWithUa });
    await client.connect(transport, { timeout: TIMEOUT_MS });
    const info = { ...client.getServerVersion(), protocol: transport.protocolVersion ?? null };
    let tools = null;
    try {
      const listed = await client.listTools(undefined, { signal });
      tools = listed.tools.map((x) => x.name);
    } catch (e) {
      return { result: "ok_no_tools", ms: Date.now() - t0, server: info, toolsError: classify(e), at: new Date().toISOString() };
    }
    return { result: "ok", ms: Date.now() - t0, server: info, toolCount: tools.length, tools: tools.slice(0, 100), at: new Date().toISOString() };
  } catch (e) {
    const result = statuses.some((x) => x === 401 || x === 403) ? "auth" : classify(e);
    return { result, ms: Date.now() - t0, statuses, detail: String(e?.message ?? e).slice(0, 160), at: new Date().toISOString() };
  } finally {
    await Promise.race([client.close().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
  }
}

// One queue per host; GLOBAL workers take from hosts that are not busy.
const queues = new Map();
for (const t of targets) queues.set(t.host, [...(queues.get(t.host) ?? []), t]);
const busy = new Set();
let finished = 0;
let sinceSave = 0;
const started = Date.now();

async function save() {
  const tally = {};
  for (const r of Object.values(done)) tally[r.result] = (tally[r.result] ?? 0) + 1;
  await writeFile(OUT, JSON.stringify({ source: catalog.source, catalogFetchedAt: catalog.fetchedAt, userAgent: UA, updatedAt: new Date().toISOString(), tally, results: done }));
  return tally;
}

function next() {
  for (const [host, q] of queues) {
    if (busy.has(host) || q.length === 0) continue;
    busy.add(host);
    const t = q.shift();
    if (q.length === 0) queues.delete(host);
    return t;
  }
  return null;
}

async function worker() {
  for (;;) {
    const t = next();
    if (!t) {
      if (queues.size === 0) return;
      await new Promise((r) => setTimeout(r, 50));
      continue;
    }
    done[t.name] = await probe(t);
    busy.delete(t.host);
    finished++;
    if (++sinceSave >= 250) {
      sinceSave = 0;
      const tally = await save();
      const rate = finished / ((Date.now() - started) / 1000);
      console.log(`${finished}/${targets.length} · ${rate.toFixed(1)}/s · ${JSON.stringify(tally)}`);
    }
  }
}

console.log(`probing ${targets.length} servers on ${queues.size} hosts`);
await Promise.all(Array.from({ length: GLOBAL }, worker));
console.log("done", JSON.stringify(await save()));
