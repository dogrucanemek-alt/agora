// Tell IndexNow (Bing, Yandex and others) which pages exist, read from the live sitemap.
// The key file is served at https://openforallofus.com/<key>.txt from web/public.
// Usage: node scripts/indexnow.mjs [--limit N]

import { readdirSync } from "node:fs";

const HOST = "openforallofus.com";
const keyFile = readdirSync(new URL("../web/public/", import.meta.url)).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) throw new Error("no IndexNow key file in web/public");
const key = keyFile.slice(0, -4);
const args = process.argv.slice(2);
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : 10000;

const sitemap = await (await fetch(`https://${HOST}/sitemap.xml`)).text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).slice(0, limit);

// IndexNow accepts up to 10,000 URLs per request.
for (let i = 0; i < urls.length; i += 10000) {
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList: urls.slice(i, i + 10000) }),
  });
  console.log(`indexnow ${i + 1}-${Math.min(i + 10000, urls.length)}: HTTP ${res.status}`);
  if (res.status >= 400) throw new Error(await res.text());
}
