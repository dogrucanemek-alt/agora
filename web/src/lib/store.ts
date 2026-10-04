// Local data for development: the catalog and accepted reports live in ../data (outside git).
// This file is the seam where a database replaces the JSON files later; nothing else reads them.
//
// data/index.json is built by scripts/build-index.mjs (registry + GitHub + liveness probe).
// data/facts.json holds every count the site prints; pages read numbers from there, never type them.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkReport, type ReportEntry, type ReportInput } from "./report";

export type Live = {
  result: string;
  cls: "answers" | "gated" | "unknown" | "down";
  at: string;
  ms: number | null;
  protocol: string | null;
  serverName: string | null;
  toolCount: number | null;
  tools: string[] | null;
};
export type GitHub = { stars: number; forks: number; pushedAt: string; archived: boolean; fork: boolean; license: string | null; language: string | null; canonical: string } | { missing: true };

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
  host?: string | null;
  gh?: GitHub | null;
  live?: Live | null;
  flags?: string[];
  indexable?: boolean;
};

export type Facts = {
  registry: string;
  catalogFetchedAt: string;
  githubFetchedAt: string | null;
  probeUpdatedAt: string | null;
  servers: number;
  active: number;
  deprecated: number;
  withRemote: number;
  withRepo: number;
  repos: { distinct: number | null; missing: number | null; archived: number };
  probe: { probed: number; answered: number; authRequired: number; paymentRequired: number; notAnswering: number; rateLimited: number; templated: number; byResult: Record<string, number> };
  flags: Record<string, number>;
  indexable: number;
  massPublishers: { publisher: string; n: number }[];
  protocols: Record<string, number>;
  toolCounts: { servers: number; median: number | null; p90: number | null; max: number | null; zero: number; over50: number };
};

const DATA = path.join(process.cwd(), "..", "data");

type State = {
  servers: Server[];
  byName: Map<string, Server>;
  docs: { s: Server; name: string; title: string; desc: string; prior: number }[];
  reports: ReportEntry[];
  seen: Set<string>;
  facts: Facts | null;
};
let state: Promise<State> | null = null;

const readJson = async <T>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(path.join(DATA, file), "utf8")) as T;
  } catch {
    return null;
  }
};

// Probe results are classified once, in scripts/build-index.mjs (live.cls); nothing here re-derives them.
export const answers = (l: Live | null | undefined) => !!l && (l.cls === "answers" || l.cls === "gated");

// Query-independent part of the score: what we measured about the server, not what it says about itself.
function prior(s: Server): number {
  let p = 0;
  if (s.status === "active") p += 1;
  if (s.live) p += { answers: 3, gated: 2, unknown: 0, down: -3 }[s.live.cls];
  if (s.gh && !("missing" in s.gh)) p += Math.min(4, Math.log10(s.gh.stars + 1) * 1.5);
  const f = new Set(s.flags ?? []);
  if (f.has("test_like")) p -= 6;
  if (f.has("clone_host")) p -= 6;
  if (f.has("ephemeral_host")) p -= 4;
  if (f.has("deprecated")) p -= 4;
  if (f.has("mass_publisher")) p -= 3;
  if (f.has("archived")) p -= 3;
  if (f.has("repo_missing")) p -= 2;
  return p;
}

async function load(): Promise<State> {
  const index = (await readJson<{ servers: Server[] }>("index.json")) ?? (await readJson<{ servers: Server[] }>("katalog.json"));
  if (!index) throw new Error("no data/index.json or data/katalog.json");
  const reports = (await readJson<ReportEntry[]>("reports.json")) ?? [];
  return {
    servers: index.servers,
    byName: new Map(index.servers.map((s) => [s.name, s])),
    docs: index.servers.map((s) => ({ s, name: s.name.toLowerCase(), title: (s.title ?? "").toLowerCase(), desc: s.description.toLowerCase(), prior: prior(s) })),
    reports,
    seen: new Set(reports.map((r) => r.receipt)),
    facts: await readJson<Facts>("facts.json"),
  };
}

export const store = () => (state ??= load());

export async function addReport(entry: ReportEntry): Promise<void> {
  const s = await store();
  s.reports.push(entry);
  s.seen.add(entry.receipt);
  await writeFile(path.join(DATA, "reports.json"), JSON.stringify(s.reports, null, 1));
}

// The one write path for reports; the REST route and the MCP tool both go through here.
export async function fileReport(input: ReportInput | null) {
  const s = await store();
  const r = checkReport(input, { knownServer: (n) => s.byName.has(n), seenReceipt: (id) => s.seen.has(id) });
  if (r.ok) await addReport(r.entry);
  return r;
}

const proofsOf = (p: ReportEntry[]) => ({ count: p.length, works: p.filter((x) => x.verdict === "works").length, operators: new Set(p.map((x) => x.operator)).size });

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
    score += d.prior;
    // signed reports outweigh everything we measure ourselves: "works" lifts, "broken"/"unsafe" pulls down
    for (const r of byServer.get(d.s.name) ?? []) score += r.verdict === "works" ? 4 : -4;
    hits.push({ score, s: d.s });
  }
  hits.sort((a, b) => b.score - a.score || (b.s.updatedAt ?? "").localeCompare(a.s.updatedAt ?? ""));
  return {
    total: hits.length,
    catalog: s.servers.length,
    withProof: byServer.size,
    results: hits.slice(0, limit).map((h) => ({ ...h.s, proofs: proofsOf(byServer.get(h.s.name) ?? []) })),
  };
}

export type SearchResult = Awaited<ReturnType<typeof search>>;

export async function getServer(name: string) {
  const s = await store();
  const server = s.byName.get(name);
  if (!server) return null;
  const reports = s.reports.filter((r) => r.server === name);
  return { server, reports, proofs: proofsOf(reports) };
}

// Counts for a topic page, computed over every match (not just the page of results shown).
export async function topicStats(query: string) {
  const s = await store();
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const matched = s.docs.filter((d) => terms.every((t) => d.name.includes(t) || d.title.includes(t) || d.desc.includes(t))).map((d) => d.s);
  const live = matched.filter((x) => x.live && x.live.cls !== "unknown");
  return {
    matched: matched.length,
    checked: live.length,
    answers: live.filter((x) => x.live!.cls === "answers").length,
    gated: live.filter((x) => x.live!.cls === "gated").length,
    down: live.filter((x) => x.live!.cls === "down").length,
    local: matched.filter((x) => x.remotes.length === 0).length,
    flagged: matched.filter((x) => !x.indexable).length,
  };
}

export async function getFacts(): Promise<Facts | null> {
  return (await store()).facts;
}

// Same-publisher and same-topic neighbours for a tool page, best measured first.
export async function related(server: Server, n = 6) {
  const s = await store();
  const publisher = server.name.split("/")[0];
  const words = new Set((server.title ?? server.name.split("/").pop() ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const out: { s: Server; score: number }[] = [];
  for (const d of s.docs) {
    if (d.s.name === server.name || !d.s.indexable) continue;
    let score = 0;
    if (d.s.name.startsWith(publisher + "/")) score += 3;
    for (const w of words) if (d.name.includes(w) || d.title.includes(w)) score += 2;
    if (score > 0) out.push({ s: d.s, score: score + d.prior });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n).map((x) => x.s);
}

export async function indexableNames(): Promise<{ name: string; updatedAt: string | null }[]> {
  const s = await store();
  return s.servers.filter((x) => x.indexable).map((x) => ({ name: x.name, updatedAt: x.updatedAt }));
}
