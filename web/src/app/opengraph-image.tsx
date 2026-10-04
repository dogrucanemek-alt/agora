import { ImageResponse } from "next/og";
import { getFacts } from "@/lib/store";
import { BRAND, n, pct } from "@/lib/site";

export const alt = `${BRAND}: which MCP servers actually work`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Share card. The numbers are read from data/facts.json at build time, like every other count on the site.
export default async function Image() {
  const f = await getFacts();
  const p = f?.probe;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          color: "#e8ebf2",
          background: "radial-gradient(ellipse at 75% 15%, #2a2f6b 0%, #0b0d1c 45%, #04050a 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>
          <span>Agora</span>
          <span style={{ color: "#9aa3b5", marginLeft: 14, fontWeight: 400 }}>by openforallofus</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>{`${n(f?.servers)} MCP servers.`}</div>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, color: "#9cd2ff" }}>Which ones actually work?</div>
        </div>
        <div style={{ display: "flex", gap: 48, fontSize: 30, color: "#cfd4de" }}>
          <span style={{ display: "flex" }}>
            <b style={{ color: "#6fe0a4" }}>{pct(p?.answered ?? 0, p?.probed ?? 0)}</b>&nbsp;complete the handshake
          </span>
          <span style={{ display: "flex" }}>
            <b style={{ color: "#9cd2ff" }}>{pct(p?.authRequired ?? 0, p?.probed ?? 0)}</b>&nbsp;need sign-in
          </span>
          <span style={{ display: "flex" }}>
            <b style={{ color: "#ff9a9a" }}>{pct(p?.notAnswering ?? 0, p?.probed ?? 0)}</b>&nbsp;fail it
          </span>
        </div>
      </div>
    ),
    size,
  );
}
