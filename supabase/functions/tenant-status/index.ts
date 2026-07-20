// tenant-status
// Returns whether the authenticated user's COB Connector has completed OAuth.
// Server-truth for the onboarding "I'm connected" flip.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("Authorization") || "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ cob: "unknown", authenticated: false }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data } = await sb
    .from("onboarding_tenants")
    .select("connectors,status,current_step")
    .eq("user_id", user.id)
    .maybeSingle();
  const connectors = (data?.connectors ?? {}) as Record<string, string>;
  return new Response(JSON.stringify({
    authenticated: true,
    cob: connectors.cob === "done" ? "done" : "pending",
    connectors,
    status: data?.status ?? null,
    current_step: data?.current_step ?? null,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
