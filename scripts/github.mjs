// GitHub signals for every catalog repo: stars, last push, archived, fork, licence, language.
// One GraphQL query asks for 100 repositories, so the whole catalog is a few hundred requests.
// A repository GitHub cannot resolve (deleted, renamed away, made private) is recorded as missing.
//
// The token comes from the GitHub CLI's stored login and stays in memory; it is never printed.
// Output data/github.json. Usage: node scripts/github.mjs

import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
const catalog = JSON.parse(await readFile(new URL("../data/katalog.json", import.meta.url), "utf8"));

const repos = [...new Set(catalog.servers.map((s) => s.repo).filter(Boolean).map((r) => r.toLowerCase()))];
const VALID = /^[a-z0-9-_.]+\/[a-z0-9-_.]+$/i;

const FIELDS = "nameWithOwner stargazerCount forkCount pushedAt isArchived isFork licenseInfo { spdxId } primaryLanguage { name }";

async function batch(list) {
  const parts = list.map((r, i) => {
    const [owner, name] = r.split("/");
    return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${FIELDS} }`;
  });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { authorization: `bearer ${token}`, "content-type": "application/json", "user-agent": "agora-catalog" },
      body: JSON.stringify({ query: `query { ${parts.join("\n")} rateLimit { remaining resetAt } }` }),
    });
    if (res.ok) return res.json();
    if (attempt === 4) throw new Error(`github ${res.status}`);
    await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
}

const out = {};
let remaining = null;
const valid = repos.filter((r) => VALID.test(r));
for (const r of repos) if (!VALID.test(r)) out[r] = { missing: true, reason: "invalid name" };

for (let i = 0; i < valid.length; i += 100) {
  const list = valid.slice(i, i + 100);
  const body = await batch(list);
  list.forEach((r, j) => {
    const d = body.data?.[`r${j}`];
    out[r] = d
      ? {
          stars: d.stargazerCount,
          forks: d.forkCount,
          pushedAt: d.pushedAt,
          archived: d.isArchived,
          fork: d.isFork,
          license: d.licenseInfo?.spdxId ?? null,
          language: d.primaryLanguage?.name ?? null,
          canonical: d.nameWithOwner,
        }
      : { missing: true };
  });
  remaining = body.data?.rateLimit?.remaining ?? remaining;
  if ((i / 100) % 20 === 0) console.log(`${i + list.length}/${valid.length} · rate left ${remaining}`);
}

const missing = Object.values(out).filter((x) => x.missing).length;
await writeFile(new URL("../data/github.json", import.meta.url), JSON.stringify({ fetchedAt: new Date().toISOString(), count: repos.length, missing, repos: out }));
console.log(`done: ${repos.length} repos, ${missing} missing, rate left ${remaining}`);
