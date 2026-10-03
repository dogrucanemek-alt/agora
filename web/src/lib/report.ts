// Proof reports: "I used this tool, here is what happened", with a signed decision record attached.
//
// What a valid report proves today, and no more:
//   - the record was signed by the key the reporter names (the operator's gate key),
//   - that gate allowed a call to the tool named in the record, at the time in the record,
//   - the same record has not been used for another report.
// What it does NOT prove yet: which MCP server answered the call. A decision record names the
// tool (e.g. "memory.get"), not the upstream server, so the server link is the reporter's claim.
// The report carries that honestly as level "operator-signed", never as "verified server".
//
// Erasable TypeScript only, so `node --test` can run it directly (Node 24 strips the types).

import { createHash } from "node:crypto";
import { verifyDecisionRecord } from "@cedulon/core";

export type Verdict = "works" | "broken" | "unsafe";
export type Receipt = { claims: Record<string, unknown> & { decision?: unknown; subject?: unknown; timestampMs?: unknown }; coseHex: string };
export type ReportInput = { server?: unknown; verdict?: unknown; note?: unknown; receipt?: unknown; operatorKeyPem?: unknown };
export type ReportEntry = {
  server: string;
  verdict: Verdict;
  note: string;
  level: "operator-signed";
  operator: string;
  tool: string;
  at: number;
  receipt: string;
  receivedAt: number;
};
export type CheckContext = { knownServer: (name: string) => boolean; seenReceipt: (id: string) => boolean };
export type CheckResult = { ok: true; problems: []; entry: ReportEntry } | { ok: false; problems: string[] };

const VERDICTS = new Set(["works", "broken", "unsafe"]);
const MAX_NOTE = 1000;

export const keyId = (pem: string): string => createHash("sha256").update(pem.trim()).digest("hex").slice(0, 16);
const receiptId = (coseHex: string): string => createHash("sha256").update(coseHex).digest("hex");

export function checkReport(report: ReportInput | null | undefined, ctx: CheckContext): CheckResult {
  const problems: string[] = [];
  const r = report ?? {};
  if (typeof r.server !== "string" || !ctx.knownServer(r.server)) problems.push("server is not in the catalog");
  if (typeof r.verdict !== "string" || !VERDICTS.has(r.verdict)) problems.push("verdict must be works, broken or unsafe");
  if (r.note != null && (typeof r.note !== "string" || r.note.length > MAX_NOTE)) problems.push(`note must be text up to ${MAX_NOTE} characters`);
  const pem = typeof r.operatorKeyPem === "string" ? r.operatorKeyPem : "";
  if (!pem.includes("BEGIN PUBLIC KEY")) problems.push("operatorKeyPem must be a PEM public key");
  const rec = r.receipt as Receipt | undefined;
  if (!rec || typeof rec.coseHex !== "string" || typeof rec.claims !== "object" || rec.claims === null) {
    problems.push("receipt must be a signed decision record { claims, coseHex }");
  }
  if (problems.length || !rec) return { ok: false, problems };

  let signed = false;
  try {
    signed = verifyDecisionRecord(rec as Parameters<typeof verifyDecisionRecord>[0], pem);
  } catch {
    signed = false;
  }
  if (!signed) return { ok: false, problems: ["receipt signature does not verify under operatorKeyPem"] };
  if (rec.claims.decision !== "allow") {
    return { ok: false, problems: [`receipt decision is "${String(rec.claims.decision)}", only an allowed call can back a report`] };
  }
  const id = receiptId(rec.coseHex);
  if (ctx.seenReceipt(id)) return { ok: false, problems: ["this receipt already backs another report"] };

  return {
    ok: true,
    problems: [],
    entry: {
      server: r.server as string,
      verdict: r.verdict as Verdict,
      note: typeof r.note === "string" ? r.note : "",
      level: "operator-signed",
      operator: keyId(pem),
      tool: String(rec.claims.subject),
      at: Number(rec.claims.timestampMs),
      receipt: id,
      receivedAt: Date.now(),
    },
  };
}
