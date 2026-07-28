import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET") ?? "";
const TEAM_ID = Deno.env.get("SLACK_TEAM_ID") ?? "";
const CHANNEL_ID = Deno.env.get("SLACK_BRIDGE_CHANNEL_ID") ?? "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySlack(raw: string, ts: string, sig: string): Promise<boolean> {
  if (!SIGNING_SECRET || !ts || !sig) return false;
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`v0:${ts}:${raw}`),
  );
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return constantTimeEqual(`v0=${hex}`, sig);
}

Deno.serve(async (req: Request) => {
  const raw = await req.text();
  const ts = req.headers.get("x-slack-request-timestamp") ?? "";
  const sig = req.headers.get("x-slack-signature") ?? "";

  if (!(await verifySlack(raw, ts, sig))) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }

  if (body.type === "url_verification") {
    return new Response(JSON.stringify({ challenge: body.challenge }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const ev = (body.event ?? {}) as Record<string, unknown>;

  if (body.team_id !== TEAM_ID) return new Response("ok", { status: 200 });
  if (ev.channel !== CHANNEL_ID) return new Response("ok", { status: 200 });
  if (ev.bot_id) return new Response("ok", { status: 200 });
  if (ev.subtype === "message_changed" || ev.subtype === "message_deleted") {
    return new Response("ok", { status: 200 });
  }

  const text = String(ev.text ?? "");
  let target: string | null = null;
  const m = text.match(/requires_response:\s*(BUDDY|COB)/i);
  if (m) target = m[1].toUpperCase();
  const ignored = target === null || /requires_response:\s*NONE/i.test(text);

  const now = new Date().toISOString();
  const { error } = await supabase.from("bridge_events").insert({
    event_id: String(body.event_id ?? ""),
    team_id: String(body.team_id ?? ""),
    channel_id: String(ev.channel ?? ""),
    message_ts: String(ev.ts ?? ""),
    thread_ts: ev.thread_ts ? String(ev.thread_ts) : null,
    slack_user_id: ev.user ? String(ev.user) : null,
    event_type: String(ev.type ?? ""),
    target_agent: target,
    payload: body,
    status: ignored ? "IGNORED" : "QUEUED",
    processed_at: ignored ? now : null,
  });

  if (error && error.code !== "23505") {
    return new Response("storage failure", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
