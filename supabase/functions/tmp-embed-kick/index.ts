// TEMPORARY one-shot invoker for world-embed. Deleted immediately after use.
const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const gate = Deno.env.get("COB_OPERATOR_KEY") ?? "";

Deno.serve(async (req) => {
  if ((req.headers.get("x-cob-operator-key") ?? "") !== gate || !gate) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 });
  }
  const body = await req.text();
  const res = await fetch(`${url}/functions/v1/world-embed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json", apikey: serviceRole },
    body,
  });
  return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
});
