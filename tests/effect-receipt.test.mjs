import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonical } from "@cedulon/core";
import { generateEffectExtractKeys, verifyEffectExtract } from "@cedulon/effect-extract";
import {
  CHANNEL_ID,
  DECISION_META,
  RECEIPT_META,
  decisionFromMeta,
  receiptKeyFromEnv,
  signToolEffect,
  withEffectReceipts,
} from "../web/src/lib/effect-receipt.ts";

const keys = generateEffectExtractKeys();
const key = receiptKeyFromEnv({ AGORA_EFFECT_KEY_PEM: keys.privateKeyPem });
const T = 1_790_000_000_000;

// The caller's descriptor, computed here without Agora's code: { tool, arguments } as sent.
const callerHash = (tool, args) => createHash("sha256").update(canonical({ tool, arguments: args }), "utf8").digest("hex");

const call = (meta, args = { query: "postgres" }) =>
  JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "search_tools", arguments: args, ...(meta ? { _meta: meta } : {}) } });
const named = { [DECISION_META]: { ref: "d-42", deciderId: "verax-proxy" } };

const post = (body) =>
  new Request("http://x/api/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body });

// Stands in for the MCP handler: answers the call as SSE, the way mcp-handler does.
const sseHandler = (result = { content: [{ type: "text", text: "{}" }] }) => async (req) => {
  const { id } = JSON.parse(await req.text());
  return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id, result })}\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
};
const readResult = async (res) => JSON.parse((await res.text()).split("\n").find((l) => l.startsWith("data: ")).slice(6)).result;

test("the key is read from the environment and the public half is derived", () => {
  assert.ok(key);
  assert.equal(key.publicKeyPem.replace(/\r/g, ""), keys.publicKeyPem.replace(/\r/g, ""));
  assert.equal(receiptKeyFromEnv({}), null);
  assert.equal(receiptKeyFromEnv({ AGORA_EFFECT_KEY_PEM: "not a key" }), null);
});

test("a signed effect verifies under Agora's key and hashes the caller's own descriptor", () => {
  const args = { query: "postgres" };
  const ex = signToolEffect({ tool: "search_tools", args, ref: "d-42", deciderId: "verax-proxy", nowMs: T }, key);
  assert.equal(verifyEffectExtract(ex, key.publicKeyPem), true);
  assert.equal(verifyEffectExtract(ex, generateEffectExtractKeys().publicKeyPem), false, "another key does not verify it");
  assert.deepEqual(ex.body.effects, [{ ref: "d-42", effectHash: callerHash("search_tools", args), effectClass: "search_tools", timestampMs: T }]);
  assert.equal(ex.body.channelId, CHANNEL_ID);
  assert.equal(ex.body.deciderId, "verax-proxy");
});

test("a changed row breaks the signature", () => {
  const ex = signToolEffect({ tool: "search_tools", args: { query: "a" }, ref: "d-1", deciderId: "v", nowMs: T }, key);
  ex.body.effects[0].ref = "d-2";
  assert.equal(verifyEffectExtract(ex, key.publicKeyPem), false);
});

test("the decision label must be present and well formed", () => {
  assert.deepEqual(decisionFromMeta(named), { ref: "d-42", deciderId: "verax-proxy" });
  assert.equal(decisionFromMeta(undefined), null);
  assert.equal(decisionFromMeta({ [DECISION_META]: { ref: "d-1" } }), null);
  assert.equal(decisionFromMeta({ [DECISION_META]: { ref: "", deciderId: "v" } }), null);
  assert.equal(decisionFromMeta({ [DECISION_META]: { ref: "x".repeat(201), deciderId: "v" } }), null);
});

test("a call that names a decision gets a receipt over the raw arguments", async () => {
  const route = withEffectReceipts(sseHandler(), () => key, () => T);
  const result = await readResult(await route(post(call(named))));
  const ex = result._meta[RECEIPT_META];
  assert.equal(verifyEffectExtract(ex, key.publicKeyPem), true);
  // The tool's schema would fill limit=10; the receipt hashes what was sent, not the filled-in form.
  assert.equal(ex.body.effects[0].effectHash, callerHash("search_tools", { query: "postgres" }));
  assert.notEqual(ex.body.effects[0].effectHash, callerHash("search_tools", { query: "postgres", limit: 10 }));
});

test("a JSON response gets the receipt too", async () => {
  const jsonHandler = async (req) => {
    const { id } = JSON.parse(await req.text());
    return Response.json({ jsonrpc: "2.0", id, result: { content: [] } });
  };
  const res = await withEffectReceipts(jsonHandler, () => key, () => T)(post(call(named)));
  assert.equal(verifyEffectExtract((await res.json()).result._meta[RECEIPT_META], key.publicKeyPem), true);
});

test("everything else passes through untouched", async () => {
  const plain = withEffectReceipts(sseHandler(), () => key, () => T);
  const noMeta = await readResult(await plain(post(call(null))));
  assert.equal(noMeta._meta, undefined, "no decision named, no receipt");

  const failed = withEffectReceipts(sseHandler({ content: [], isError: true }), () => key, () => T);
  assert.equal((await readResult(await failed(post(call(named)))))._meta, undefined, "a failed call is not signed as done");

  const off = withEffectReceipts(sseHandler(), () => null, () => T);
  assert.equal((await readResult(await off(post(call(named)))))._meta, undefined, "no key, no receipt");

  const list = JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: { _meta: named } });
  const listed = await withEffectReceipts(async () => Response.json({ jsonrpc: "2.0", id: 3, result: { tools: [] } }), () => key, () => T)(post(list));
  assert.equal((await listed.json()).result._meta, undefined, "only tools/call is signed");
});
