// Local prototype: one search box over data/katalog.json. No database, no deploy.
//   node scripts/serve.mjs   → http://localhost:4317

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { checkReport } from "../lib/report.mjs";

const PORT = Number(process.env.PORT ?? 4317);
const catalog = JSON.parse(await readFile(new URL("../data/katalog.json", import.meta.url), "utf8"));
const pageUrl = new URL("../public/index.html", import.meta.url);
const reportsUrl = new URL("../data/reports.json", import.meta.url);
const known = new Set(catalog.servers.map((s) => s.name));
let reports = [];
try { reports = JSON.parse(await readFile(reportsUrl, "utf8")); } catch {}
const seen = new Set(reports.map((r) => r.receipt));
const proofs = (name) => reports.filter((r) => r.server === name);

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
    // ranking comes from evidence: each signed "works" report lifts a tool, a "broken"/"unsafe" one pulls it down
    for (const r of proofs(d.s.name)) score += r.verdict === "works" ? 4 : -4;
    hits.push({ score, s: d.s });
  }
  hits.sort((a, b) => b.score - a.score || (b.s.updatedAt ?? "").localeCompare(a.s.updatedAt ?? ""));
  return {
    total: hits.length,
    results: hits.slice(0, limit).map((h) => {
      const p = proofs(h.s.name);
      return { ...h.s, proofs: { count: p.length, works: p.filter((x) => x.verdict === "works").length, operators: new Set(p.map((x) => x.operator)).size } };
    }),
  };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/search") {
    const t0 = performance.now();
    const out = search(url.searchParams.get("q") ?? "");
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ...out, catalog: catalog.count, withProof: new Set(reports.map((r) => r.server)).size, ms: Math.round(performance.now() - t0) }));
    return;
  }
  if (url.pathname === "/api/report" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) { body += chunk; if (body.length > 64 * 1024) break; }
    let report;
    try { report = JSON.parse(body); } catch { report = null; }
    const r = body.length > 64 * 1024 ? { ok: false, problems: ["report larger than 64 KB"] }
      : checkReport(report, { knownServer: (n) => known.has(n), seenReceipt: (id) => seen.has(id) });
    if (r.ok) {
      reports.push(r.entry);
      seen.add(r.entry.receipt);
      await writeFile(reportsUrl, JSON.stringify(reports, null, 1));
    }
    res.writeHead(r.ok ? 201 : 422, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(r.ok ? { ok: true, report: r.entry } : { ok: false, problems: r.problems }));
    return;
  }
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(await readFile(pageUrl)); // read per request: edits show without a restart
    return;
  }
  // Static files under public/: a fixed allow-list of extensions, no path escapes.
  const m = /^\/((?:vendor\/)?[a-z0-9._-]+\.(js|txt))$/i.exec(url.pathname);
  if (m && !m[1].includes("..")) {
    try {
      const body = await readFile(new URL(`../public/${m[1]}`, import.meta.url));
      res.writeHead(200, { "content-type": m[2] === "js" ? "text/javascript; charset=utf-8" : "text/plain; charset=utf-8" });
      res.end(body);
      return;
    } catch {}
  }
  res.writeHead(404).end();
}).listen(PORT, "127.0.0.1", () => console.log(`http://localhost:${PORT}  (${catalog.count} servers)`));
