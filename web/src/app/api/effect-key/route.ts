// The public key Agora signs effect receipts with (lib/effect-receipt.ts). A caller pins this key as the
// effect root for calls it routes to Agora. 404 while receipts are off.
import { receiptKeyFromEnv } from "@/lib/effect-receipt";

export async function GET() {
  const key = receiptKeyFromEnv();
  if (!key) return new Response("effect receipts are not enabled\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(key.publicKeyPem, {
    headers: { "content-type": "application/x-pem-file", "cache-control": "public, max-age=300" },
  });
}
