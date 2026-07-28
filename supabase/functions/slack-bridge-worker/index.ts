import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") ?? "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

async function postToSlack(channel: string, threadTs: string, text: string): Promise<string> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Authorization": `Bearer ${BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel, thread_ts: threadTs, text }),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`slack_post_failed:${j.error ?? "unknown"}`);
  return String(j.ts ?? "");
}

Deno.serve(async () => {
  // Expiry is not release. Reap before claiming so a dead worker's row returns to the queue.
  const { error: reapError } = await supabase.rpc("bridge_reap_stale_claims");
  if (reapError) {
    return new Response(JSON.stringify({ stage: "reap", error: reapError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data, error } = await supabase.rpc("bridge_claim_next");
  if (error) {
    return new Response(JSON.stringify({ stage: "claim", error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return new Response(JSON.stringify({ claimed: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (!BOT_TOKEN) throw new Error("missing_SLACK_BOT_TOKEN");
    const threadTs = row.thread_ts ?? row.message_ts;
    await postToSlack(
      row.channel_id,
      threadTs,
      `BRIDGE EVENT RECEIVED · ${row.target_agent ?? "UNROUTED"} ROUTE VERIFIED`,
    );
    await supabase
      .from("bridge_events")
      .update({ status: "PROCESSED", processed_at: new Date().toISOString() })
      .eq("id", row.id);
    return new Response(JSON.stringify({ claimed: 1, event_id: row.event_id, result: "PROCESSED" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
    await supabase
      .from("bridge_events")
      .update({ status: "FAILED", last_error: msg })
      .eq("id", row.id);
    return new Response(JSON.stringify({ claimed: 1, event_id: row.event_id, result: "FAILED" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
