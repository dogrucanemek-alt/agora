// Local prototype: one search box over data/katalog.json. No database, no deploy.
//   node scripts/serve.mjs   → http://localhost:4317

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const PORT = Number(process.env.PORT ?? 4317);
const catalog = JSON.parse(await readFile(new URL("../data/katalog.json", import.meta.url), "utf8"));
const page = await readFile(new URL("../public/index.html", import.meta.url));

const docs = catalog.servers.map((s) => ({
  s,
  name: s.name.toLowerCase(),
  title: (s.title ?? "").toLowerCase(),
  desc: s.description.toLowerCase(),
}));

function search(q, limit = 20) {
  const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (terms.length === 0) return { total: 0, results: [] };
  const hits = [];
  for (const d of docs) {
    let score = 0;
    let all = true;
    for (const t of terms) {
      const inName = d.name.includes(t) || d.title.includes(t);
      const inDesc = d.desc.includes(t);
      if (!inName && !inDesc) { all = false; break; }
      score += (inName ? 5 : 0) + (inDesc ? 1 : 0);
    }
    if (!all) continue;
    if (d.s.status === "active") score += 1;
    if (d.s.repo) score += 1;
    hits.push({ score, s: d.s });
  }
  hits.sort((a, b) => b.score - a.score || (b.s.updatedAt ?? "").localeCompare(a.s.updatedAt ?? ""));
  return { total: hits.length, results: hits.slice(0, limit).map((h) => h.s) };
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/search") {
    const t0 = performance.now();
    const out = search(url.searchParams.get("q") ?? "");
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ...out, catalog: catalog.count, ms: Math.round(performance.now() - t0) }));
    return;
  }
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page);
    return;
  }
  res.writeHead(404).end();
}).listen(PORT, "127.0.0.1", () => console.log(`http://localhost:${PORT}  (${catalog.count} servers)`));
