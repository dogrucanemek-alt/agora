// Names and addresses used across pages. The product string is fixed: "Agora by openforallofus".
// "Agora" alone collides with other products in search, so every title carries the domain name too.

export const SITE_URL = (process.env.SITE_URL ?? "https://openforallofus.com").replace(/\/$/, "");
export const PRODUCT = "Agora";
export const ORG = "openforallofus";
export const BRAND = `${PRODUCT} by ${ORG}`;
export const CONTACT = "hello@openforallofus.com";
export const REPO = "https://github.com/dogrucanemek-alt/agora";
// Archived, citable snapshot of the measurements (Zenodo). Each archived snapshot gets its own DOI.
export const SNAPSHOT = { doi: "10.5281/zenodo.23137127", date: "2026-10-04" };
export const REGISTRY_UI = "https://registry.modelcontextprotocol.io";

export const toolPath = (name: string) => "/tools/" + name.split("/").map(encodeURIComponent).join("/");
export const registryRecordUrl = (name: string) => `${REGISTRY_UI}/v0.1/servers/${encodeURIComponent(name)}/versions/latest`;

export const day = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 10) : "unknown");
export const n = (x: number | null | undefined) => (x == null ? "unknown" : x.toLocaleString("en-US"));
export const clip = (text: string, max: number) => (text.length <= max ? text : text.slice(0, text.lastIndexOf(" ", max) > max * 0.6 ? text.lastIndexOf(" ", max) : max).replace(/[\s,.;:–—-]+$/, "") + "…");
export const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "0%");

// Plain-language reading of a probe result. The tone comes from live.cls (classified in build-index);
// this function only words the result code, it does not decide whether a server is up.
const TONE = { answers: "ok", gated: "auth", unknown: "none", down: "bad" } as const;
const WORDS: Record<string, string> = {
  ok: "Answers the MCP handshake and lists its tools",
  ok_no_tools: "Answers the MCP handshake; tool list not available without sign-in",
  auth: "Answers, but requires sign-in before the handshake",
  http_402: "Answers, but asks for payment (HTTP 402) before the handshake",
  http_429: "Rate-limited our check (HTTP 429), status unknown",
  templated: "Endpoint is a template (the URL needs your own values), not checked",
  bad_url: "Endpoint URL in the registry is not a valid URL",
  dns: "Did not answer: the domain does not resolve",
  timeout: "Did not answer within 12 seconds",
  refused: "Did not answer: the connection failed",
  network_error: "Did not answer: the connection failed",
  tls: "Did not answer: TLS certificate problem",
};
export function liveLabel(live: { result: string; cls: keyof typeof TONE }): { text: string; tone: (typeof TONE)[keyof typeof TONE] } {
  const r = live.result;
  const text = WORDS[r] ?? (r.startsWith("http_") ? `Did not complete the handshake: HTTP ${r.slice(5)}` : "Did not complete the MCP handshake");
  return { text, tone: TONE[live.cls] };
}

export const FLAG_TEXT: Record<string, string> = {
  deprecated: "Marked deprecated in the registry.",
  test_like: "The name reads like a test or demo entry.",
  ephemeral_host: "The endpoint is a temporary tunnel or a private address.",
  clone_host: "Its host serves many entries that share one description.",
  mass_publisher: "Its publisher namespace has more than 500 registry entries.",
  repo_missing: "The linked GitHub repository does not resolve (deleted, renamed or private).",
  archived: "The GitHub repository is archived.",
  thin_description: "The registry description is under 40 characters.",
  not_answering: "The endpoint did not complete the MCP handshake in our last check.",
};
