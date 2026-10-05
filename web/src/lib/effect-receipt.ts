// Signed effect receipts: Agora's own word that it ran a tool call, in the Cedulon Effect Extract format.
//
// A caller's gate (for example Verax) records a signed decision before it calls a tool. The decision
// alone says the call was allowed; it does not say which server answered. When the caller names its
// decision in the request, Agora signs a one-row extract with its own key and returns it next to the
// result. The caller can then hold its decision ledger against a row that the tool's operator signed,
// not one it wrote itself.
//
// Request:  params._meta["io.cedulon/decision"] = { ref, deciderId }
// Response: result._meta["io.cedulon/effect-extract"] = SignedEffectExtract
//
// The row's effectHash is SHA-256 over the RFC 8785 canonical form of { tool, arguments }, with the tool
// name and the arguments exactly as Agora received them (before any default is filled in). That is the
// same descriptor the caller hashes for its own decision, so the two can be compared byte for byte.
//
// What a receipt proves, and no more: Agora's key signed that Agora answered a call to this tool with
// these arguments at this time, for the decision ref the caller named. The ref is the caller's label;
// Agora does not check it against any ledger. Whether Agora is independent of the caller is a fact about
// who runs each side, not something the signature shows.
//
// Erasable TypeScript only, so `node --test` can run it directly (Node 24 strips the types).

import { createHash, createPublicKey } from "node:crypto";
import { canonical } from "@cedulon/core";
import { signEffectExtract, type SignedEffectExtract } from "@cedulon/effect-extract";

export const DECISION_META = "io.cedulon/decision";
export const RECEIPT_META = "io.cedulon/effect-extract";
export const CHANNEL_ID = "openforallofus.com/api/mcp";

export type ReceiptKey = { privateKeyPem: string; publicKeyPem: string };

/** The signing key from AGORA_EFFECT_KEY_PEM (PKCS#8 Ed25519). Absent or unreadable: receipts are off. */
export function receiptKeyFromEnv(env: Record<string, string | undefined> = process.env): ReceiptKey | null {
  const raw = env.AGORA_EFFECT_KEY_PEM;
  if (!raw || raw.trim() === "") return null;
  const privateKeyPem = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  try {
    const publicKeyPem = createPublicKey(privateKeyPem).export({ type: "spki", format: "pem" }).toString();
    return { privateKeyPem, publicKeyPem };
  } catch {
    return null;
  }
}

export function effectHash(tool: string, args: unknown): string {
  return createHash("sha256").update(canonical({ tool, arguments: args }), "utf8").digest("hex");
}

/** The caller's decision label, or null when the request does not name one in the expected shape. */
export function decisionFromMeta(meta: unknown): { ref: string; deciderId: string } | null {
  if (!meta || typeof meta !== "object") return null;
  const d = (meta as Record<string, unknown>)[DECISION_META];
  if (!d || typeof d !== "object") return null;
  const { ref, deciderId } = d as Record<string, unknown>;
  const ok = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 200;
  return ok(ref) && ok(deciderId) ? { ref: ref as string, deciderId: deciderId as string } : null;
}

export function signToolEffect(
  input: { tool: string; args: unknown; ref: string; deciderId: string; nowMs: number },
  key: ReceiptKey,
): SignedEffectExtract {
  return signEffectExtract(
    {
      deciderId: input.deciderId,
      channelId: CHANNEL_ID,
      // One-row window [t, t+1), the same shape Verax uses for its own one-row extracts.
      windowStartMs: input.nowMs,
      windowEndMs: input.nowMs + 1,
      effects: [{ ref: input.ref, effectHash: effectHash(input.tool, input.args), effectClass: input.tool, timestampMs: input.nowMs }],
    },
    key.privateKeyPem,
    key.publicKeyPem,
  );
}

type JsonRpc = { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown> };

function addReceipt(message: JsonRpc, id: unknown, receipt: SignedEffectExtract): boolean {
  if (message.id !== id || !message.result || message.result.isError === true) return false;
  const meta = (message.result._meta as Record<string, unknown> | undefined) ?? {};
  message.result._meta = { ...meta, [RECEIPT_META]: receipt };
  return true;
}

/**
 * Wraps the MCP route. Only a tools/call that names a decision, answered without error, gets a receipt;
 * every other request and response passes through untouched. The tool name and arguments are read from
 * the raw request body, before the tool's schema fills defaults.
 */
export function withEffectReceipts(
  handler: (req: Request) => Promise<Response>,
  getKey: () => ReceiptKey | null = () => receiptKeyFromEnv(),
  now: () => number = () => Date.now(),
): (req: Request) => Promise<Response> {
  return async (req) => {
    const key = req.method === "POST" ? getKey() : null;
    if (!key) return handler(req);
    const text = await req.text();
    const forward = new Request(req.url, { method: req.method, headers: req.headers, body: text });
    let call: JsonRpc | null = null;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) call = parsed as JsonRpc;
    } catch {
      call = null;
    }
    const decision = call?.method === "tools/call" ? decisionFromMeta(call.params?._meta) : null;
    const tool = call?.params?.name;
    if (!call || !decision || typeof tool !== "string") return handler(forward);

    const res = await handler(forward);
    const receipt = signToolEffect({ tool, args: call.params?.arguments ?? {}, ...decision, nowMs: now() }, key);
    const type = res.headers.get("content-type") ?? "";
    const body = await res.text();
    let out = body;
    if (type.includes("application/json")) {
      try {
        const msg = JSON.parse(body) as JsonRpc;
        if (addReceipt(msg, call.id, receipt)) out = JSON.stringify(msg);
      } catch {
        out = body;
      }
    } else if (type.includes("text/event-stream")) {
      out = body
        .split("\n")
        .map((line) => {
          if (!line.startsWith("data: ")) return line;
          try {
            const msg = JSON.parse(line.slice(6)) as JsonRpc;
            return addReceipt(msg, call.id, receipt) ? `data: ${JSON.stringify(msg)}` : line;
          } catch {
            return line;
          }
        })
        .join("\n");
    }
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(out, { status: res.status, statusText: res.statusText, headers });
  };
}
