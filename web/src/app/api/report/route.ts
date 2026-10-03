import { checkReport, type ReportInput } from "@/lib/report";
import { addReport, store } from "@/lib/store";

const MAX_BODY = 64 * 1024;

export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return Response.json({ ok: false, problems: ["report larger than 64 KB"] }, { status: 413 });
  let body: ReportInput | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const s = await store();
  const r = checkReport(body, { knownServer: (n) => s.known.has(n), seenReceipt: (id) => s.seen.has(id) });
  if (!r.ok) return Response.json({ ok: false, problems: r.problems }, { status: 422 });
  await addReport(r.entry);
  return Response.json({ ok: true, report: r.entry }, { status: 201 });
}
