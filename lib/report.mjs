// Proof reports: "I used this tool, here is what happened", with a signed decision record attached.
//
// What a valid report proves today, and no more:
//   - the record was signed by the key the reporter names (the operator's gate key),
//   - that gate allowed a call to the tool named in the record, at the time in the record,
//   - the same record has not been used for another report.
// What it does NOT prove yet: which MCP server answered the call. A decision record names the
// tool (e.g. "memory.get"), not the upstream server, so the server link is the reporter's claim.
// The report carries that honestly as level "operator-signed", never as "verified server".

import { createHash } from "node:crypto";
import { verifyDecisionRecord } from "@cedulon/core";

const VERDICTS = new Set(["works", "broken", "unsafe"]);
const MAX_NOTE = 1000;

export const keyId = (pem) => createHash("sha256").update(pem.trim()).digest("hex").slice(0, 16);
const receiptId = (coseHex) => createHash("sha256").update(coseHex).digest("hex");

/**
 * @param {object} report  { server, verdict, note, receipt: { claims, coseHex }, operatorKeyPem }
 * @param {{ knownServer: (name: string) => boolean, seenReceipt: (id: string) => boolean }} ctx
 * @returns {{ ok: boolean, problems: string[], entry?: object }}
 */
export function checkReport(report, ctx) {
  const problems = [];
  const r = report ?? {};
  if (typeof r.server !== "string" || !ctx.knownServer(r.server)) problems.push("server is not in the catalog");
  if (!VERDICTS.has(r.verdict)) problems.push("verdict must be works, broken or unsafe");
  if (r.note != null && (typeof r.note !== "string" || r.note.length > MAX_NOTE)) problems.push(`note must be text up to ${MAX_NOTE} characters`);
  const pem = typeof r.operatorKeyPem === "string" ? r.operatorKeyPem : "";
  if (!pem.includes("BEGIN PUBLIC KEY")) problems.push("operatorKeyPem must be a PEM public key");
  const rec = r.receipt;
  if (!rec || typeof rec.coseHex !== "string" || typeof rec.claims !== "object") problems.push("receipt must be a signed decision record { claims, coseHex }");
  if (problems.length) return { ok: false, problems };

  let signed = false;
  try { signed = verifyDecisionRecord(rec, pem); } catch { signed = false; }
  if (!signed) return { ok: false, problems: ["receipt signature does not verify under operatorKeyPem"] };
  if (rec.claims.decision !== "allow") return { ok: false, problems: [`receipt decision is "${rec.claims.decision}", only an allowed call can back a report`] };
  const id = receiptId(rec.coseHex);
  if (ctx.seenReceipt(id)) return { ok: false, problems: ["this receipt already backs another report"] };

  return {
    ok: true,
    problems: [],
    entry: {
      server: r.server,
      verdict: r.verdict,
      note: r.note ?? "",
      level: "operator-signed",
      operator: keyId(pem),
      tool: rec.claims.subject,
      at: rec.claims.timestampMs,
      receipt: id,
      receivedAt: Date.now(),
    },
  };
}
