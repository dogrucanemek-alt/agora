import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkReport, keyId } from "../web/src/lib/report.ts";

// Verax test vectors v1 (Apache-2.0, see fixtures/verax-v1/SOURCE.txt): a real signed ledger and its record key.
const V = new URL("./fixtures/verax-v1/", import.meta.url);
const records = readFileSync(new URL("decisions.jsonl", V), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const pem = readFileSync(new URL("record-key.pem", V), "utf8");
const allow = records.find((r) => r.claims.decision === "allow" && r.claims.decider === "verax-proxy");
const deny = records.find((r) => r.claims.decision === "deny");

const ctx = (seen = new Set()) => ({ knownServer: (n) => n === "io.example/tool", seenReceipt: (id) => seen.has(id) });
const base = () => ({ server: "io.example/tool", verdict: "works", note: "ok", receipt: structuredClone(allow), operatorKeyPem: pem });

test("a signed allow record backs a report at operator-signed level", () => {
  const r = checkReport(base(), ctx());
  assert.equal(r.ok, true, r.problems.join("; "));
  assert.equal(r.entry.level, "operator-signed");
  assert.equal(r.entry.operator, keyId(pem));
  assert.equal(r.entry.tool, allow.claims.subject);
});

test("a changed claim breaks the signature", () => {
  const rep = base();
  rep.receipt.claims.subject = "spend";
  assert.match(checkReport(rep, ctx()).problems[0], /does not verify/);
});

test("a different key does not verify", () => {
  const other = readFileSync(new URL("witness-key.pem", V), "utf8");
  assert.match(checkReport({ ...base(), operatorKeyPem: other }, ctx()).problems[0], /does not verify/);
});

test("a deny record cannot back a report", () => {
  assert.match(checkReport({ ...base(), receipt: structuredClone(deny) }, ctx()).problems[0], /only an allowed call/);
});

test("the same receipt cannot back two reports", () => {
  const seen = new Set();
  const first = checkReport(base(), ctx(seen));
  seen.add(first.entry.receipt);
  assert.match(checkReport(base(), ctx(seen)).problems[0], /already backs/);
});

test("unknown server and bad verdict are refused before any crypto", () => {
  const r = checkReport({ ...base(), server: "nope", verdict: "great" }, ctx());
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 2);
});
