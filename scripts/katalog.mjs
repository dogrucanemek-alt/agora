// Catalog collector: pages through the official MCP registry and writes a local catalog.
// No database yet. Output: data/katalog.json (one entry per server name, newest version wins).
//
//   node scripts/katalog.mjs            full crawl
//   node scripts/katalog.mjs --max 300  stop after N entries (quick check)

import { mkdir, writeFile } from "node:fs/promises";

const REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers";
const PAGE = 100;
const max = process.argv.includes("--max") ? Number(process.argv[process.argv.indexOf("--max") + 1]) : Infinity;

async function page(cursor) {
  const url = new URL(REGISTRY);
  url.searchParams.set("limit", String(PAGE));
  if (cursor) url.searchParams.set("cursor", cursor);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": "commons-catalog/0.1" } });
    if (res.ok) return res.json();
    if (attempt === 3) throw new Error(`registry ${res.status} at cursor ${cursor ?? "(start)"}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

function repoOf(s) {
  const u = s.repository?.url ?? "";
  const m = /github\.com\/([^/]+\/[^/#?]+)/.exec(u);
  return m ? m[1].replace(/\.git$/, "") : null;
}

const byName = new Map();
let cursor;
let raw = 0;
do {
  const body = await page(cursor);
  for (const item of body.servers ?? []) {
    const s = item.server ?? {};
    if (!s.name) continue;
    raw++;
    const meta = item._meta?.["io.modelcontextprotocol.registry/official"] ?? {};
    byName.set(s.name, {
      name: s.name,
      title: s.title ?? null,
      description: s.description ?? "",
      version: s.version ?? null,
      repo: repoOf(s),
      website: s.websiteUrl ?? null,
      remotes: (s.remotes ?? []).map((r) => ({ type: r.type, url: r.url })),
      packages: (s.packages ?? []).map((p) => ({ registry: p.registryType, id: p.identifier })),
      status: meta.status ?? null,
      updatedAt: meta.updatedAt ?? meta.publishedAt ?? null,
    });
  }
  cursor = body.metadata?.nextCursor;
  process.stdout.write(`\r${raw} versions, ${byName.size} servers`);
} while (cursor && raw < max);

const servers = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../data/katalog.json", import.meta.url),
  JSON.stringify({ source: REGISTRY, fetchedAt: new Date().toISOString(), count: servers.length, servers }, null, 1),
);
console.log(`\nwrote ${servers.length} servers (${raw} versions read)`);
