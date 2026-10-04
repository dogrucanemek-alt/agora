import type { ReportInput } from "@/lib/report";
import { fileReport } from "@/lib/store";

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
  const r = await fileReport(body);
  if (!r.ok) return Response.json({ ok: false, problems: r.problems }, { status: "closed" in r ? 503 : 422 });
  return Response.json({ ok: true, report: r.entry }, { status: 201 });
}
