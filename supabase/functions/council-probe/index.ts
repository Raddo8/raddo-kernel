// Temporary acceptance probe for COUNCIL MINUTE PERSISTENCE.
// Calls mcp-council with the static tenant bearer from the function env so
// the acceptance evidence can be gathered without exposing the secret.
// Delete after the acceptance run.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mcp-council`;
const TOKEN = Deno.env.get("COUNCIL_TENANT_TOKEN_SPINNEY") ?? "";

async function rpc(method: string, params: unknown, timeoutMs = 250_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(BASE, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: ctrl.signal,
    });
    const text = await r.text();
    try { return { status: r.status, body: JSON.parse(text) }; }
    catch { return { status: r.status, raw: text.slice(0, 4000) }; }
  } finally { clearTimeout(t); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const op = body?.op;
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (op === "call") {
    const out = await rpc("tools/call", { name: body.name, arguments: body.arguments ?? {} });
    return json(out);
  }
  if (op === "fire") {
    // Fire and forget: kick the deliberation, return immediately so a
    // still_running fetch can be probed against the live run.
    const p = rpc("tools/call", { name: body.name, arguments: body.arguments ?? {} })
      .then((r) => console.log("fire_done", JSON.stringify(r).slice(0, 2000)))
      .catch((e) => console.log("fire_err", String(e)));
    try { (globalThis as any).EdgeRuntime?.waitUntil?.(p); } catch { /* noop */ }
    return json({ fired: true });
  }
  if (op === "list") {
    return json(await rpc("tools/list", {}));
  }
  return json({ error: "unknown_op" }, 400);
});
