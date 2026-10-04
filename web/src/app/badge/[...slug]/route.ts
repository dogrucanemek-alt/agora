// README badge: /badge/<registry name>.svg → "agora | answers" with the result of our last check.
// The badge links nothing by itself; maintainers wrap it in a link to the server's page.

import { getServer } from "@/lib/store";

type Ctx = { params: Promise<{ slug: string[] }> };

const COLORS = { ok: "#2ea043", auth: "#3b82c4", bad: "#cf4b4b", none: "#6b7280" } as const;

function svg(label: string, value: string, color: string) {
  const w = (s: string) => Math.round(s.length * 6.4 + 12);
  const lw = w(label);
  const vw = w(value);
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + vw}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}"><title>${esc(label)}: ${esc(value)}</title><rect width="${lw}" height="20" fill="#1f2433"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle"><text x="${lw / 2}" y="14">${esc(label)}</text><text x="${lw + vw / 2}" y="14">${esc(value)}</text></g></svg>`;
}

export async function GET(_req: Request, { params }: Ctx) {
  const parts = (await params).slug.map(decodeURIComponent);
  parts[parts.length - 1] = parts[parts.length - 1].replace(/\.svg$/, "");
  const found = await getServer(parts.join("/"));
  let value = "not listed";
  let color: string = COLORS.none;
  if (found) {
    const l = found.server.live;
    if (!l) [value, color] = ["runs locally", COLORS.none];
    else if (l.cls === "answers") [value, color] = [l.toolCount != null ? `answers · ${l.toolCount} tools` : "answers", COLORS.ok];
    else if (l.cls === "gated") [value, color] = [l.result === "http_402" ? "answers · paid" : "answers · sign-in", COLORS.auth];
    else if (l.cls === "down") [value, color] = ["handshake fails", COLORS.bad];
    else [value, color] = ["unknown", COLORS.none];
    if (found.proofs.works > 0) value += ` · ${found.proofs.works} signed`;
  }
  return new Response(svg("agora", value, color), {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=3600" },
  });
}
