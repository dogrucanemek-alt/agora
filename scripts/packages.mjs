// npm / PyPI measurements. Full refresh requires metadata; download counts are optional.
// --sample N checks N distinct packages, balanced across registries, and marks the partial snapshot.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { listedPackages } from "./package-signals.mjs";

export const USER_AGENT = "agora-probe/0.1 (+https://openforallofus.com/probe)";
export const npmPath = (name) => encodeURIComponent(name).replace(/%2F/g, "%2f");
export function npmBatches(names) {
  const plain = names.filter((n) => !n.startsWith("@"));
  const out = [];
  for (let i = 0; i < plain.length; i += 128) out.push(plain.slice(i, i + 128));
  return [...out, ...names.filter((n) => n.startsWith("@")).map((n) => [n])];
}

export function parseNpm(status, body, checkedAt) {
  if (status === 404) return { exists: false, checkedAt, latestVersion: null, latestPublish: null, deprecated: null };
  if (status !== 200 || typeof body?.name !== "string") throw new Error(`npm metadata unavailable (${status})`);
  const latestVersion = body["dist-tags"]?.latest ?? null;
  const v = body.versions?.[latestVersion];
  return { exists: true, checkedAt, latestVersion, latestPublish: body.time?.[latestVersion] ?? body.modified ?? body.time?.modified ?? null,
    deprecated: v ? Boolean(v.deprecated) : null };
}

export function parsePypi(status, body, checkedAt) {
  if (status === 404) return { exists: false, checkedAt, latestVersion: null, latestUpload: null, yanked: null };
  if (status !== 200 || !body?.info || !body.releases) throw new Error(`PyPI metadata unavailable (${status})`);
  const latestVersion = body.info.version ?? null;
  const files = body.releases[latestVersion] ?? body.urls ?? [];
  const dates = files.map((f) => f.upload_time_iso_8601 ?? f.upload_time).filter(Boolean).sort();
  // A release is yanked only when all its files are yanked; no files means unknown.
  return { exists: true, checkedAt, latestVersion, latestUpload: dates.at(-1) ?? null,
    yanked: files.length ? files.every((f) => f.yanked === true) : null };
}

export function parseDownloads(body, name) {
  const d = body?.package === name ? body : body?.[name];
  return Number.isFinite(d?.downloads) && d.downloads >= 0 ? d.downloads : null;
}
export const parsePypistats = (body) => Number.isFinite(body?.data?.last_week) && body.data.last_week >= 0 ? body.data.last_week : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function request(url, headers = {}, fetcher = fetch) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetcher(url, { headers: { "user-agent": USER_AGENT, ...headers }, signal: AbortSignal.timeout(12000) });
      const checkedAt = new Date().toISOString();
      const body = response.status === 200 ? await response.json() : null;
      return { status: response.status, body, checkedAt, retryAfter: response.headers.get("retry-after") };
    } catch (error) {
      if (attempt === 1) throw error;
      await sleep(500);
    }
  }
}
export async function pool(list, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) await fn(list[next++]);
  }));
}

// Serialized optional source, with injectable clock/transport for offline rate-limit tests.
export function pypistatsReader({ get = request, wait = sleep, now = Date.now } = {}) {
  let nextRequest = 0, stopped = false;
  return async (name) => {
    let r;
    if (!stopped) {
      await wait(Math.max(0, nextRequest - now()));
      try {
        const url = `https://pypistats.org/api/packages/${encodeURIComponent(name.toLowerCase())}/recent`;
        r = await get(url);
        if (r.status === 429) {
          const retryMs = Number(r.retryAfter) * 1000 || Date.parse(r.retryAfter) - now() || 10000;
          await wait(Math.min(60000, Math.max(10000, retryMs)));
          r = await get(url);
          if (r.status === 429) stopped = true;
        }
      } catch { stopped = true; }
      nextRequest = now() + 1000;
    }
    return { weeklyDownloads: r?.status === 200 ? parsePypistats(r.body) : null,
      downloadsCheckedAt: r?.checkedAt ?? null, downloadsStatus: r?.status ?? null };
  };
}

export async function collect(catalog, sample = null) {
  const listed = listedPackages(catalog.servers);
  const selected = { npm: [], pypi: [] };
  if (sample === null) Object.assign(selected, listed);
  else {
    // Alternate unscoped/scoped npm names so a small sample exercises both endpoint forms.
    const plain = listed.npm.filter((n) => !n.startsWith("@"));
    const scoped = listed.npm.filter((n) => n.startsWith("@"));
    const npm = Array.from({ length: Math.max(plain.length, scoped.length) }, (_, i) => [plain[i], scoped[i]]).flat().filter(Boolean);
    let i = 0;
    while (selected.npm.length + selected.pypi.length < sample && (i < npm.length || i < listed.pypi.length)) {
      for (const [r, ids] of [["npm", npm], ["pypi", listed.pypi]]) {
        if (ids[i] && selected.npm.length + selected.pypi.length < sample) selected[r].push(ids[i]);
      }
      i++;
    }
  }
  const out = { fetchedAt: new Date().toISOString(), sample, npm: {}, pypi: {} };
  const errors = [];
  for (const [registry, limit] of [["npm", 8], ["pypi", 4]]) {
    await pool(selected[registry], limit, async (name) => {
      try {
        const url = registry === "npm" ? `https://registry.npmjs.org/${npmPath(name)}` : `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
        const r = await request(url, registry === "npm" ? { accept: "application/vnd.npm.install-v1+json" } : {});
        out[registry][name] = (registry === "npm" ? parseNpm : parsePypi)(r.status, r.body, r.checkedAt);
      } catch {
        errors.push(`${registry}:${name}`);
        out[registry][name] = { exists: null, checkedAt: new Date().toISOString(), error: "metadata unavailable" };
      }
    });
  }
  // Do not replace a complete snapshot when mandatory metadata failed in a full run.
  if (sample === null && errors.length) throw new Error(`Metadata unavailable for ${errors.length} packages; previous snapshot preserved`);
  await pool(npmBatches(selected.npm), 4, async (batch) => {
    let r;
    try { r = await request(`https://api.npmjs.org/downloads/point/last-week/${batch.map(npmPath).join(",")}`); } catch { /* optional */ }
    for (const name of batch) Object.assign(out.npm[name], { weeklyDownloads: r?.status === 200 ? parseDownloads(r.body, name) : null,
      downloadsCheckedAt: r?.checkedAt ?? new Date().toISOString() });
  });
  const stats = pypistatsReader();
  for (const name of selected.pypi) Object.assign(out.pypi[name], await stats(name));
  out.summary = Object.fromEntries(["npm", "pypi"].map((registry) => {
    const values = Object.values(out[registry]);
    return [registry, { selected: values.length, exists: values.filter((v) => v.exists === true).length,
      missing: values.filter((v) => v.exists === false).length, unavailable: values.filter((v) => v.exists === null).length,
      downloadsAvailable: values.filter((v) => v.weeklyDownloads !== null).length }];
  }));
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--sample" || !/^\d+$/.test(args[1]) || Number(args[1]) < 1)) throw new Error("Usage: node scripts/packages.mjs [--sample N]");
  const catalog = JSON.parse(await readFile(new URL("../data/katalog.json", import.meta.url), "utf8"));
  const out = await collect(catalog, args.length ? Number(args[1]) : null);
  await writeFile(new URL("../data/packages.json", import.meta.url), JSON.stringify(out));
  console.log(JSON.stringify({ sample: out.sample, ...out.summary }, null, 2));
}
