import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseNpm, parsePypi, parseDownloads, npmPath, npmBatches, request, pool, attachPypiDownloads } from "../scripts/packages.mjs";
import { normalizePypi, weekWindow, countsByName, readPypiDownloads, QUERY, MAX_BYTES_BILLED } from "../scripts/pypi-bigquery.mjs";
import { buildIndex } from "../scripts/build-index.mjs";
import { mergePackages, packageFacts } from "../scripts/package-signals.mjs";
import { PACKAGE_COLUMNS, packageCells, csvCell } from "../web/src/lib/packages-csv.ts";

const f = JSON.parse(readFileSync(new URL("./fixtures/packages.json", import.meta.url), "utf8"));
const at = "2026-10-05T00:00:00Z";
test("npm latest metadata and deprecation", () => {
  assert.deepEqual(parseNpm(200, f.npm, at), { exists: true, checkedAt: at, latestVersion: "2.0.0", latestPublish: "2026-10-01T12:00:00Z", deprecated: true });
});
test("npm abbreviated timestamps stay unknown or use modified", () => {
  assert.equal(parseNpm(200, f.npmAbbreviated, at).latestPublish, null);
  assert.equal(parseNpm(200, { ...f.npmAbbreviated, modified: at }, at).latestPublish, at);
  assert.equal(parseNpm(200, { name: "unpublished", time: { modified: at } }, at).latestVersion, null);
});
test("PyPI latest release upload and yanked files", () => {
  assert.deepEqual(parsePypi(200, f.pypi, at), { exists: true, checkedAt: at, latestVersion: "2.0", latestUpload: "2026-10-02T12:00:00Z", yanked: true });
  const mixed = structuredClone(f.pypi);
  mixed.releases["2.0"][0].yanked = false;
  assert.equal(parsePypi(200, mixed, at).yanked, false);
  mixed.releases["2.0"] = [];
  assert.equal(parsePypi(200, mixed, at).yanked, null);
});
test("404 is missing and HTTP failures are not missing", () => {
  for (const parse of [parseNpm, parsePypi]) {
    assert.equal(parse(404, null, at).exists, false);
    assert.throws(() => parse(429, null, at), /metadata unavailable/);
    assert.throws(() => parse(503, null, at), /metadata unavailable/);
  }
});
test("scoped npm URL encodes slash", () => {
  assert.equal(npmPath("@scope/name"), "%40scope%2fname");
});
test("npm batches are at most 128 and scoped names stay separate", () => {
  const names = [...Array.from({ length: 260 }, (_, i) => `p${i}`), "@a/b", "@c/d"];
  const batches = npmBatches(names);
  assert.deepEqual(batches.map((b) => b.length), [128, 128, 4, 1, 1]);
  assert.deepEqual(batches.flat(), names);
});
test("download parsing preserves zero and unavailable", () => {
  assert.equal(parseDownloads(f.npmDownloads, "demo"), 42);
  assert.equal(parseDownloads(f.npmDownloads, "zero"), 0);
  assert.equal(parseDownloads({ package: "scoped", downloads: 7 }, "scoped"), 7);
  assert.equal(parseDownloads(f.npmDownloads, "missing"), null);
});
test("package merge preserves registry IDs and unknown sources", () => {
  const packages = [{ registry: "pypi", id: "Demo_Tool" }, { registry: "npm", id: "@a/b" }, { registry: "oci", id: "image" }];
  const signal = { exists: false, checkedAt: at };
  const result = mergePackages(packages, { pypi: { "demo-tool": signal } });
  assert.deepEqual(result, [{ ...packages[0], signal }, { ...packages[1], signal: null }, packages[2]]);
  assert.equal(packages[0].signal, undefined);
});
test("facts count distinct packages, missing and flags", () => {
  const servers = [{ packages: [{ registry: "npm", id: "demo" }, { registry: "pypi", id: "Demo_Tool" }] },
    { packages: [{ registry: "npm", id: "demo" }, { registry: "npm", id: "gone" }, { registry: "pypi", id: "demo-tool" }, { registry: "pypi", id: "unknown" }] }];
  assert.deepEqual(packageFacts(servers, { npm: { demo: { exists: true, deprecated: true }, gone: { exists: false } }, pypi: { "demo-tool": { exists: true, yanked: true }, unknown: { exists: null } } }),
    { npm: { listed: 2, checked: 2, missing: 1, deprecated: 1, yanked: 0 }, pypi: { listed: 2, checked: 1, missing: 0, deprecated: 0, yanked: 1 } });
});
test("CSV columns and aligned package values", () => {
  assert.deepEqual(PACKAGE_COLUMNS, ["npm_package", "npm_exists", "npm_weekly_downloads", "npm_latest_publish", "pypi_package", "pypi_exists", "pypi_last_week_downloads", "pypi_latest_upload", "package_deprecated"]);
  const packages = [{ registry: "npm", id: "demo", signal: { exists: true, weeklyDownloads: 0, latestPublish: at, deprecated: false } },
    { registry: "npm", id: "gone", signal: { exists: false } }, { registry: "pypi", id: "python", signal: { exists: true, weeklyDownloads: 99, latestUpload: at, yanked: true } }];
  assert.deepEqual(packageCells({ packages }), ['["demo","gone"]', '[true,false]', '[0,null]', JSON.stringify([at, null]), "python", true, 99, at, true]);
  assert.equal(csvCell('["demo","gone"]'), '"[""demo"",""gone""]"');
  assert.equal(packageCells({ packages: [] })[8], null);
});
test("network request retries once and sends user agent and timeout", async () => {
  let attempts = 0;
  const result = await request("https://fixture.invalid", {}, async (_url, options) => {
    assert.equal(options.headers["user-agent"], "agora-probe/0.1 (+https://openforallofus.com/probe)");
    assert.ok(options.signal instanceof AbortSignal);
    if (++attempts === 1) throw new Error("offline");
    return new Response(JSON.stringify(f.pypi), { status: 200 });
  });
  assert.equal(attempts, 2);
  assert.equal(result.status, 200);
  attempts = 0;
  await assert.rejects(request("https://fixture.invalid", {}, async () => { attempts++; throw new Error("offline"); }));
  assert.equal(attempts, 2);
});
test("worker pool respects concurrency and visits each item", async () => {
  let active = 0, peak = 0;
  const visited = [];
  await pool([1, 2, 3, 4, 5, 6], 2, async (i) => {
    active++; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 2));
    visited.push(i); active--;
  });
  assert.equal(peak, 2);
  assert.deepEqual(visited.sort(), [1, 2, 3, 4, 5, 6]);
});

test("index builder merges package facts without changing ranking inputs", () => {
  const catalog = { source: "fixture", fetchedAt: at, servers: [{ name: "io.example/tool", description: "A sufficiently long description for this fixture server.", status: "active", remotes: [], repo: "a/b", packages: [{ registry: "npm", id: "demo" }] }] };
  const github = { repos: { "a/b": { stars: 4 } } };
  const before = buildIndex(catalog, github);
  const after = buildIndex(catalog, github, undefined, { fetchedAt: at, npm: { demo: parseNpm(200, f.npm, at) }, pypi: {} });
  assert.equal(after.index.servers[0].packages[0].signal.latestVersion, "2.0.0");
  assert.equal(after.facts.packages.npm.deprecated, 1);
  assert.deepEqual(after.index.servers[0].flags, before.index.servers[0].flags);
  assert.equal(after.index.servers[0].indexable, before.index.servers[0].indexable);
  assert.equal(before.facts.packages, null);
});

test("PyPI names are PEP 503 normalized, the window is seven finished UTC days", () => {
  assert.equal(normalizePypi("Foo_Bar.baz--Qux"), "foo-bar-baz-qux");
  assert.deepEqual(weekWindow(new Date("2026-10-06T15:30:00Z")), { start: "2026-09-29T00:00:00.000Z", end: "2026-10-06T00:00:00.000Z" });
});
test("BigQuery query filters the partition and the listed projects, under a byte cap", () => {
  assert.match(QUERY, /timestamp >= TIMESTAMP\(@start\) AND timestamp < TIMESTAMP\(@end\)/);
  assert.match(QUERY, /file\.project IN UNNEST\(@names\)/);
  assert.ok(MAX_BYTES_BILLED > 0 && MAX_BYTES_BILLED <= 1024 ** 4);
});
test("BigQuery counts: a listed package with no row is 0, names map through normalization", async () => {
  assert.deepEqual(countsByName(["Demo_Pkg", "quiet"], [{ project: "demo-pkg", downloads: "99" }]), { Demo_Pkg: 99, quiet: 0 });
  let seen;
  const r = await readPypiDownloads(["Demo_Pkg", "demo-pkg", "quiet"], { now: new Date("2026-10-06T00:00:00Z"),
    runQuery: async (q) => { seen = q; return { rows: [{ project: "demo-pkg", downloads: 5 }], bytesBilled: 1234 }; } });
  assert.deepEqual(seen.params.names, ["demo-pkg", "quiet"]);
  assert.equal(seen.params.start, "2026-09-29T00:00:00.000Z");
  assert.deepEqual(r.counts, { Demo_Pkg: 5, "demo-pkg": 5, quiet: 0 });
  assert.equal(r.bytesBilled, 1234);
});
test("PyPI downloads stay null without BigQuery, on query failure, and for missing packages", async () => {
  const fresh = () => ({ a: { exists: true }, gone: { exists: false }, odd: { exists: null } });
  let pypi = fresh();
  const off = await attachPypiDownloads(pypi, Object.keys(pypi), { bigQuery: false, pypiDownloads: async () => { throw new Error("must not run"); } });
  assert.equal(off.source, "unavailable");
  assert.deepEqual(Object.values(pypi).map((v) => v.weeklyDownloads), [null, null, null]);
  pypi = fresh();
  const failed = await attachPypiDownloads(pypi, Object.keys(pypi), { bigQuery: true, pypiDownloads: async () => { throw new Error("bytes billed limit exceeded"); } });
  assert.match(failed.error, /limit exceeded/);
  assert.equal(pypi.a.weeklyDownloads, null);
  pypi = fresh();
  let asked;
  const ok = await attachPypiDownloads(pypi, Object.keys(pypi), { bigQuery: true,
    pypiDownloads: async (names) => { asked = names; return { counts: { a: 0 }, window: { start: "s", end: "e" }, bytesBilled: 10, checkedAt: at }; } });
  assert.deepEqual(asked, ["a"]);
  assert.equal(pypi.a.weeklyDownloads, 0);
  assert.equal(pypi.a.downloadsCheckedAt, at);
  assert.equal(pypi.gone.weeklyDownloads, null);
  assert.equal(pypi.odd.weeklyDownloads, null);
  assert.equal(ok.bytesBilled, 10);
});
