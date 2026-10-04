import { store } from "@/lib/store";

// Our measurements, one row per registry entry. Descriptions are left out: they belong to their publishers
// and are on each server's page with attribution. The measurements are CC BY 4.0.
const COLS = ["name", "endpoint", "check_result", "check_class", "checked_at", "protocol", "tool_count", "github_repo", "github_stars", "github_last_push", "github_archived", "registry_status", "flags", "indexed"];

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET() {
  const s = await store();
  const rows = s.servers.map((x) => {
    const gh = x.gh && !("missing" in x.gh) ? x.gh : null;
    const remote = x.remotes.find((r) => r.type === "streamable-http") ?? x.remotes[0];
    return [
      x.name,
      remote?.url,
      x.live?.result,
      x.live?.cls,
      x.live?.at,
      x.live?.protocol,
      x.live?.toolCount,
      x.repo,
      gh?.stars,
      gh?.pushedAt,
      gh?.archived,
      x.status,
      (x.flags ?? []).join(" "),
      x.indexable ? "yes" : "no",
    ]
      .map(cell)
      .join(",");
  });
  return new Response([COLS.join(","), ...rows].join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="agora-mcp-servers.csv"',
      // open data: any site or notebook may fetch it directly
      "access-control-allow-origin": "*",
    },
  });
}
