// Public viewer endpoint for /builds/:token
// Returns the stored HTML body as text/html so the React viewer can wrap it
// in a blob: URL (Supabase's gateway forces a sandbox CSP on every response,
// which blocks embedded JS — the blob: indirection sidesteps that).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const noindex = {
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cache-Control": "no-store",
};

const goneHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Build unavailable</title></head><body><h1>This build is no longer available.</h1></body></html>`;

function gone() {
  return new Response(goneHtml, {
    status: 410,
    headers: { ...corsHeaders, ...noindex, "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token || token.length < 8 || token.length > 128 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return gone();
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: build, error } = await supabase
    .from("builds")
    .select("id, storage_path, revoked, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !build || build.revoked) return gone();
  if (build.expires_at && new Date(build.expires_at).getTime() < Date.now()) return gone();

  const dl = await supabase.storage.from("builds").download(build.storage_path);
  if (dl.error || !dl.data) return gone();
  const html = await dl.data.text();

  const ua = req.headers.get("user-agent")?.slice(0, 256) ?? null;
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  supabase.from("build_views").insert({ build_id: build.id, ua, ip }).then(({ error: e }) => {
    if (e) console.log(JSON.stringify({ event: "build_view_log_failed", error: e.message }));
  });

  return new Response(html, {
    status: 200,
    headers: {
      ...corsHeaders,
      ...noindex,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
});
