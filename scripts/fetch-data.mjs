// Before a build: make sure data/ holds what the site reads. Locally the scripts have built it already;
// on Vercel (data/ is not in git) the files come from the "data-latest" release of this repository,
// which the weekly refresh workflow replaces.
//
// Usage: node scripts/fetch-data.mjs   (no-op when data/index.json and data/facts.json exist)

import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const REPO = "dogrucanemek-alt/agora";
const DATA = new URL("../data/", import.meta.url);
const FILES = ["index.json", "facts.json"];

mkdirSync(DATA, { recursive: true });
if (!existsSync(new URL("reports.json", DATA))) writeFileSync(new URL("reports.json", DATA), "[]\n");

if (FILES.every((f) => existsSync(new URL(f, DATA)))) {
  console.log("data/ present, nothing to fetch");
  process.exit(0);
}

for (const f of FILES) {
  const url = `https://github.com/${REPO}/releases/download/data-latest/${f}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  JSON.parse(body.toString("utf8")); // refuse to build on a truncated or non-JSON download
  writeFileSync(new URL(f, DATA), body);
  console.log(`fetched ${f} (${body.length} bytes)`);
}
