import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SRC = path.join(ROOT, "web", "src");

const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(path.join(dir, f)).isDirectory() ? files(path.join(dir, f)) : [path.join(dir, f)]));

// Claims we cannot back with a list of what we looked at do not go on the site.
const CLAIM = /\bthe only\b|\bfirst (to|ever)\b|\bunique\b|\bthe best\b|\bleading\b|\bworld'?s\b|\bguarantee/i;

test("no unbacked superlatives in page text", () => {
  const hits = [];
  for (const f of files(SRC).filter((x) => /\.(tsx?|mjs)$/.test(x))) {
    readFileSync(f, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (!line.trim().startsWith("//") && CLAIM.test(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(hits, []);
});

// A source file that git ignores never reaches the repo or a git-triggered deploy, while a local build
// still serves it. This happened: "data/" in .gitignore swallowed web/src/app/data/ and /data went 404.
test("no source file under web/src is ignored by git", () => {
  const src = files(SRC).map((f) => path.relative(ROOT, f).split(path.sep).join("/"));
  let ignored = "";
  try {
    ignored = execFileSync("git", ["check-ignore", "--stdin"], { cwd: ROOT, input: src.join("\n"), encoding: "utf8" });
  } catch (e) {
    ignored = e.status === 1 ? "" : String(e.stdout ?? ""); // exit 1 = nothing ignored
  }
  assert.deepEqual(ignored.split("\n").filter(Boolean), []);
});

const DATA = path.join(ROOT, "data");
const haveData = existsSync(path.join(DATA, "index.json")) && existsSync(path.join(DATA, "facts.json"));

test("probe classes add up and each result maps to one class", { skip: !haveData && "data/ not built" }, () => {
  const { servers } = JSON.parse(readFileSync(path.join(DATA, "index.json"), "utf8"));
  const facts = JSON.parse(readFileSync(path.join(DATA, "facts.json"), "utf8"));
  const p = facts.probe;
  assert.equal(p.answered + p.authRequired + p.paymentRequired + p.notAnswering, p.probed, "answered + sign-in + payment + down must equal probed");
  const classOf = new Map();
  for (const s of servers) {
    if (!s.live) continue;
    assert.ok(["answers", "gated", "unknown", "down"].includes(s.live.cls), `${s.name}: class ${s.live.cls}`);
    const prev = classOf.get(s.live.result);
    assert.ok(!prev || prev === s.live.cls, `result ${s.live.result} is both ${prev} and ${s.live.cls}`);
    classOf.set(s.live.result, s.live.cls);
  }
  assert.equal(servers.length, facts.servers);
  assert.equal(servers.filter((s) => s.indexable).length, facts.indexable);
});

test("no indexable page carries a flag that should keep it out", { skip: !haveData && "data/ not built" }, () => {
  const { servers } = JSON.parse(readFileSync(path.join(DATA, "index.json"), "utf8"));
  const KEEP_OUT = ["test_like", "ephemeral_host", "clone_host", "mass_publisher", "repo_missing", "archived", "thin_description", "not_answering"];
  const bad = servers.filter((s) => s.indexable && s.flags.some((f) => KEEP_OUT.includes(f))).map((s) => s.name);
  assert.deepEqual(bad.slice(0, 5), []);
});
