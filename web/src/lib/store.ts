// Local data for development: the catalog and accepted reports live in ../data (outside git).
// This file is the seam where a database replaces the JSON files later; nothing else reads them.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReportEntry } from "./report";

export type Server = {
  name: string;
  title: string | null;
  description: string;
  version: string | null;
  repo: string | null;
  website: string | null;
  remotes: { type: string; url: string }[];
  packages: { registry: string; id: string }[];
  status: string | null;
  updatedAt: string | null;
};

const DATA = path.join(process.cwd(), "..", "data");

type State = { servers: Server[]; known: Set<string>; docs: { s: Server; name: string; title: string; desc: string }[]; reports: ReportEntry[]; seen: Set<string> };
let state: Promise<State> | null = null;

async function load(): Promise<State> {
  const catalog = JSON.parse(await readFile(path.join(DATA, "katalog.json"), "utf8")) as { servers: Server[] };
  let reports: ReportEntry[] = [];
  try {
    reports = JSON.parse(await readFile(path.join(DATA, "reports.json"), "utf8"));
  } catch {
    reports = [];
  }
  return {
    servers: catalog.servers,
    known: new Set(catalog.servers.map((s) => s.name)),
    docs: catalog.servers.map((s) => ({ s, name: s.name.toLowerCase(), title: (s.title ?? "").toLowerCase(), desc: s.description.toLowerCase() })),
    reports,
    seen: new Set(reports.map((r) => r.receipt)),
  };
}

export const store = () => (state ??= load());

export async function addReport(entry: ReportEntry): Promise<void> {
  const s = await store();
  s.reports.push(entry);
  s.seen.add(entry.receipt);
  await writeFile(path.join(DATA, "reports.json"), JSON.stringify(s.reports, null, 1));
}

export async function search(q: string, limit = 20) {
  const s = await store();
  const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const byServer = new Map<string, ReportEntry[]>();
  for (const r of s.reports) byServer.set(r.server, [...(byServer.get(r.server) ?? []), r]);
  if (terms.length === 0) return { total: 0, results: [], catalog: s.servers.length, withProof: byServer.size };

  const hits: { score: number; s: Server }[] = [];
  for (const d of s.docs) {
    let score = 0;
    let all = true;
    for (const t of terms) {
      const inName = d.name.includes(t) || d.title.includes(t);
      const inDesc = d.desc.includes(t);
      if (!inName && !inDesc) {
        all = false;
        break;
      }
      score += (inName ? 5 : 0) + (inDesc ? 1 : 0);
    }
    if (!all) continue;
    if (d.s.status === "active") score += 1;
    if (d.s.repo) score += 1;
    // ranking comes from evidence: each signed "works" report lifts a tool, a "broken"/"unsafe" one pulls it down
    for (const r of byServer.get(d.s.name) ?? []) score += r.verdict === "works" ? 4 : -4;
    hits.push({ score, s: d.s });
  }
  hits.sort((a, b) => b.score - a.score || (b.s.updatedAt ?? "").localeCompare(a.s.updatedAt ?? ""));
  return {
    total: hits.length,
    catalog: s.servers.length,
    withProof: byServer.size,
    results: hits.slice(0, limit).map((h) => {
      const p = byServer.get(h.s.name) ?? [];
      return { ...h.s, proofs: { count: p.length, works: p.filter((x) => x.verdict === "works").length, operators: new Set(p.map((x) => x.operator)).size } };
    }),
  };
}

export type SearchResult = Awaited<ReturnType<typeof search>>;
