// Join the measured sources into what the site serves:
//   data/katalog.json  (official MCP registry)  +  data/github.json  (repo signals)  +  data/probe.json  (liveness)
//   + data/packages.json (npm and PyPI metadata / optional downloads)
// → data/index.json  one record per server, with quality flags and whether its page should be indexed
// → data/facts.json  every number the site prints, derived here so no page carries a hand-typed count
//
// Usage: node scripts/build-index.mjs

import { readFile, writeFile } from "node:fs/promises";
import { mergePackages, packageFacts } from "./package-signals.mjs";
import { pathToFileURL } from "node:url";

const read = async (f, fallback) => {
  try {
    return JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url), "utf8"));
  } catch {
    return fallback;
  }
};

export function buildIndex(catalog, github = { repos: {} }, probe = { results: {} }, packages = null) {
const EPHEMERAL = /(^|\.)(trycloudflare\.com|ngrok(-free)?\.(app|io|dev)|loca\.lt|localhost)$|^(127\.|0\.0\.0\.0|10\.|192\.168\.)/i;
const TEST_LIKE = /(^|[-_.])(test\d*|tests|testing|demo\d*|example|hello[-_]?world|sample|dummy|tmp|temp|playground|foo|bar)([-_.]|$)|-ok$/i;
const BULK_HOST = 50; // a host this busy is either a platform (Apify, Smithery) or a cloning operation
const MASS_PUBLISHER = 500; // one namespace publishing this many entries is generating them, not writing them

const hostOf = (s) => {
  const r = s.remotes.find((x) => x.type === "streamable-http") ?? s.remotes[0];
  if (!r || r.url.includes("{")) return null;
  try {
    return new URL(r.url.replace(/\{[^}]*\}/g, "x")).host.toLowerCase();
  } catch {
    return null;
  }
};

const perHost = new Map();
const hostDescs = new Map();
const perPublisher = new Map();
for (const s of catalog.servers) {
  const h = hostOf(s);
  if (h) {
    perHost.set(h, (perHost.get(h) ?? 0) + 1);
    hostDescs.set(h, (hostDescs.get(h) ?? new Set()).add((s.description ?? "").slice(0, 30)));
  }
  const p = s.name.split("/")[0];
  perPublisher.set(p, (perPublisher.get(p) ?? 0) + 1);
}
// Busy host whose entries mostly share one description: copies of a template, not distinct tools.
const cloneHost = (h) => (perHost.get(h) ?? 0) > BULK_HOST && hostDescs.get(h).size / perHost.get(h) < 0.5;

const LIVE_OK = new Set(["ok", "ok_no_tools"]);
// Answered, but not with a handshake: sign-in required, or payment required (x402). The server is up.
const GATED = new Set(["auth", "http_402"]);
// Rate-limited us, or never checked: we do not know, so it counts neither way.
const UNKNOWN = new Set(["http_429", "templated", "bad_url"]);
const servers = catalog.servers.map((s) => {
  const host = hostOf(s);
  const gh = s.repo ? (github.repos[s.repo.toLowerCase()] ?? null) : null;
  const live = probe.results[s.name] ?? null;
  const short = s.name.split("/").pop() ?? s.name;
  const flags = [];
  if (s.status === "deprecated") flags.push("deprecated");
  if (TEST_LIKE.test(short)) flags.push("test_like");
  if (host && EPHEMERAL.test(host)) flags.push("ephemeral_host");
  if (host && cloneHost(host)) flags.push("clone_host");
  if ((perPublisher.get(s.name.split("/")[0]) ?? 0) > MASS_PUBLISHER) flags.push("mass_publisher");
  if (gh?.missing) flags.push("repo_missing");
  if (gh?.archived) flags.push("archived");
  if ((s.description ?? "").trim().length < 40) flags.push("thin_description");
  if (live && !LIVE_OK.has(live.result) && !GATED.has(live.result) && !UNKNOWN.has(live.result)) flags.push("not_answering");

  const answered = live ? LIVE_OK.has(live.result) || GATED.has(live.result) : false;
  const hasRepo = gh && !gh.missing;
  // A page is worth indexing only if we add something beyond the registry entry: a live check that
  // succeeded, or a real repository; and nothing marks it as a test, a tunnel, a bulk clone or dead.
  const indexable =
    s.status === "active" &&
    !flags.some((f) => ["test_like", "ephemeral_host", "clone_host", "mass_publisher", "repo_missing", "archived", "thin_description", "not_answering"].includes(f)) &&
    (answered || hasRepo);

  return {
    ...s,
    packages: mergePackages(s.packages, packages),
    host,
    gh: gh && !gh.missing ? gh : gh?.missing ? { missing: true } : null,
    live: live && {
      result: live.result,
      // the one place a probe result is classified; the site reads this field and never re-derives it
      cls: LIVE_OK.has(live.result) ? "answers" : GATED.has(live.result) ? "gated" : UNKNOWN.has(live.result) ? "unknown" : "down",
      at: live.at,
      ms: live.ms ?? null,
      protocol: live.server?.protocol ?? null,
      serverName: live.server?.name ?? null,
      toolCount: live.toolCount ?? null,
      tools: live.tools ?? null,
    },
    flags,
    indexable,
  };
});

const count = (f) => servers.filter(f).length;
const probed = servers.filter((s) => s.live && !UNKNOWN.has(s.live.result));
const facts = {
  registry: catalog.source,
  catalogFetchedAt: catalog.fetchedAt,
  githubFetchedAt: github.fetchedAt ?? null,
  probeUpdatedAt: probe.updatedAt ?? null,
  packages: packages ? { fetchedAt: packages.fetchedAt, sample: packages.sample ?? null, ...packageFacts(catalog.servers, packages) } : null,
  servers: servers.length,
  active: count((s) => s.status === "active"),
  deprecated: count((s) => s.status === "deprecated"),
  withRemote: count((s) => s.remotes.length > 0),
  withRepo: count((s) => s.repo),
  repos: { distinct: github.count ?? null, missing: github.missing ?? null, archived: Object.values(github.repos).filter((r) => r.archived).length },
  probe: {
    probed: probed.length,
    answered: probed.filter((s) => LIVE_OK.has(s.live.result)).length,
    authRequired: probed.filter((s) => s.live.result === "auth").length,
    paymentRequired: probed.filter((s) => s.live.result === "http_402").length,
    notAnswering: probed.filter((s) => !LIVE_OK.has(s.live.result) && !GATED.has(s.live.result)).length,
    // Rate-limited or templated: no countable answer, so outside probed and every bucket above.
    unknown: servers.filter((s) => s.live && UNKNOWN.has(s.live.result)).length,
    rateLimited: servers.filter((s) => s.live?.result === "http_429").length,
    templated: servers.filter((s) => s.live?.result === "templated").length,
    byResult: Object.fromEntries(Object.entries(probe.tally ?? {}).sort((a, b) => b[1] - a[1])),
  },
  flags: Object.fromEntries(
    ["test_like", "ephemeral_host", "clone_host", "mass_publisher", "repo_missing", "archived", "thin_description", "not_answering", "deprecated"].map((f) => [f, count((s) => s.flags.includes(f))]),
  ),
  indexable: count((s) => s.indexable),
  // Among servers that completed the handshake: which protocol revision they settled on, and tool counts.
  protocols: Object.fromEntries(
    Object.entries(
      probed.filter((s) => LIVE_OK.has(s.live.result)).reduce((m, s) => ((m[s.live.protocol ?? "unknown"] = (m[s.live.protocol ?? "unknown"] ?? 0) + 1), m), {}),
    ).sort((a, b) => b[1] - a[1]),
  ),
  toolCounts: (() => {
    const c = probed.filter((s) => s.live.toolCount != null).map((s) => s.live.toolCount).sort((a, b) => a - b);
    const q = (p) => (c.length ? c[Math.min(c.length - 1, Math.floor(p * c.length))] : null);
    return { servers: c.length, median: q(0.5), p90: q(0.9), max: c.at(-1) ?? null, zero: c.filter((x) => x === 0).length, over50: c.filter((x) => x > 50).length };
  })(),
  busyHosts: [...perHost].filter(([, n]) => n > BULK_HOST).sort((a, b) => b[1] - a[1]).map(([host, n]) => ({ host, n, clone: cloneHost(host) })),
  massPublishers: [...perPublisher].filter(([, n]) => n > MASS_PUBLISHER).sort((a, b) => b[1] - a[1]).map(([publisher, n]) => ({ publisher, n })),
};

return { index: { builtAt: new Date().toISOString(), servers }, facts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { index, facts } = buildIndex(await read("katalog.json"), await read("github.json", { repos: {} }), await read("probe.json", { results: {} }), await read("packages.json", null));
  await writeFile(new URL("../data/index.json", import.meta.url), JSON.stringify(index));
  await writeFile(new URL("../data/facts.json", import.meta.url), JSON.stringify(facts, null, 1));
  console.log(JSON.stringify({ flags: facts.flags, indexable: facts.indexable, busyHosts: facts.busyHosts, massPublishers: facts.massPublishers }, null, 1));
}
