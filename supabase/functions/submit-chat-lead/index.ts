// @ts-nocheck
// Public endpoint · captures the Sample COB chat gate form before chat unlocks.
// No JWT · validated · rate-limited · service-role insert into chat_leads.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { checkRateLimitDb, getClientIp } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Rate limit by IP · 10 submissions / 10 minutes
  try {
    const ip = getClientIp(req.headers);
    const rl = await checkRateLimitDb(supabase, "submit-chat-lead", ip, 10, 10 * 60_000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many submissions. Try again shortly." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfter ?? 60) },
      });
    }
  } catch (e) {
    console.error("[submit-chat-lead] rate-limit check failed", e);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const name = clean(body?.name, 120);
  const email = clean(body?.email, 200).toLowerCase();
  const company = clean(body?.company, 160);
  const title = clean(body?.title, 160);
  const challenge = clean(body?.challenge, 2000);
  const sessionId = clean(body?.session_id, 64) || crypto.randomUUID();
  const voice = clean(body?.voice, 32) || "cob";

  if (!name) return jsonResponse({ error: "Name is required." }, 400);
  if (!email || !EMAIL_RE.test(email)) return jsonResponse({ error: "A valid email is required." }, 400);
  if (!company) return jsonResponse({ error: "Company is required." }, 400);
  if (!title) return jsonResponse({ error: "Title is required." }, 400);
  if (challenge.length < 10) return jsonResponse({ error: "Tell us a bit more · at least one sentence." }, 400);

  const userAgent = clean(req.headers.get("user-agent"), 500);
  const referer = clean(req.headers.get("referer"), 500);

  const { data, error } = await supabase
    .from("chat_leads")
    .insert({
      session_id: sessionId,
      name,
      email,
      company,
      title,
      challenge,
      voice,
      user_agent: userAgent,
      referer,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[submit-chat-lead] insert failed", error);
    return jsonResponse({ error: "Could not record submission." }, 502);
  }

  return jsonResponse({ ok: true, id: data?.id, session_id: sessionId });
});
