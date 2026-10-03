import type { NextRequest } from "next/server";
import { search } from "@/lib/store";

export async function GET(request: NextRequest) {
  const t0 = performance.now();
  const out = await search(request.nextUrl.searchParams.get("q") ?? "");
  return Response.json({ ...out, ms: Math.round(performance.now() - t0) });
}
