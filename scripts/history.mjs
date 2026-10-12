// One compact record per check day of what the handshake check found, kept so that a server's
// history can be read later. data/index.json is replaced on every refresh; this is what remains.
//   data/index.json + data/facts.json → data/history/status-YYYY-MM-DD.json.gz
//   { date, checkedAt, counts: { class: n }, servers: { registry name: class } }
// Only servers with a remote endpoint appear: a server that runs locally was never checked.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

export function snapshot(index, facts) {
  const checkedAt = facts?.probeUpdatedAt;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(checkedAt))) throw new Error("facts.probeUpdatedAt is missing; no day to file the snapshot under");
  const servers = {};
  for (const s of index.servers) if (s.live?.cls) servers[s.name] = s.live.cls;
  const counts = {};
  for (const cls of Object.values(servers)) counts[cls] = (counts[cls] ?? 0) + 1;
  return { date: checkedAt.slice(0, 10), checkedAt, counts, servers };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = async (f) => JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url), "utf8"));
  const snap = snapshot(await read("index.json"), await read("facts.json"));
  await mkdir(new URL("../data/history/", import.meta.url), { recursive: true });
  const file = new URL(`../data/history/status-${snap.date}.json.gz`, import.meta.url);
  const body = gzipSync(JSON.stringify(snap));
  await writeFile(file, body);
  console.log(JSON.stringify({ file: `data/history/status-${snap.date}.json.gz`, bytes: body.length, servers: Object.keys(snap.servers).length, counts: snap.counts }));
}
