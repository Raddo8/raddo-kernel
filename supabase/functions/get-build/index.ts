// Public viewer endpoint for /builds/:token
// - Resolves the token to a build row
// - If not found / revoked / expired → 410 HTML
// - Else: logs the view and 302-redirects to a short-lived signed URL on the
//   private `builds` storage bucket. Storage serves the object with the
//   content-type it was uploaded with (text/html), and without the Supabase
//   Edge runtime's "default-src 'none'; sandbox" CSP — so the build's own
//   JavaScript runs normally inside the iframe.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const noindex = {
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cache-Control": "no-store",
};

const goneHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Build unavailable</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#0A0B0D;color:#F4F4F2}main{max-width:480px;padding:48px 32px;text-align:center}h1{font-size:22px;margin:0 0 12px;letter-spacing:-.01em}p{color:#B9BEC6;margin:0;font-size:14.5px;line-height:1.6}</style></head><body><main><h1>This build is no longer available.</h1><p>The link may have expired or been revoked. Contact the sender for an updated link.</p></main></body></html>`;

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

  // Mint a short-lived signed URL on the private bucket. Storage will serve
  // the object with the original content-type (text/html) and without the
  // edge runtime's sandbox CSP, so embedded JS runs normally.
  const signed = await supabase.storage
    .from("builds")
    .createSignedUrl(build.storage_path, 300); // 5 minutes
  if (signed.error || !signed.data?.signedUrl) {
    console.log(JSON.stringify({ event: "build_sign_failed", error: signed.error?.message }));
    return gone();
  }

  // Fire-and-forget view log
  const ua = req.headers.get("user-agent")?.slice(0, 256) ?? null;
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  supabase
    .from("build_views")
    .insert({ build_id: build.id, ua, ip })
    .then(({ error: e }) => {
      if (e) console.log(JSON.stringify({ event: "build_view_log_failed", error: e.message }));
    });

  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      ...noindex,
      Location: signed.data.signedUrl,
    },
  });
});
