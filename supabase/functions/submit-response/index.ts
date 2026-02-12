import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { writeTimeline } from "../_shared/write-timeline.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, selected_option } = await req.json();
    if (!token || typeof token !== "string" || !selected_option || typeof selected_option !== "string") {
      return json({ valid: false, reason_code: "INVALID_TOKEN" }, 400);
    }

    const tokenHash = await hashToken(token);
    const prefix = tokenHash.substring(0, 8);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Step 1: Select row to validate option (safe: options are immutable)
    const { data: row, error: selectErr } = await supabase
      .from("action_responses")
      .select("options, submitted_at, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (selectErr || !row) {
      return json({ valid: false, reason_code: "INVALID_TOKEN" });
    }

    if (row.submitted_at) {
      return json({ valid: false, reason_code: "ALREADY_RESPONDED" });
    }

    if (new Date(row.expires_at) <= new Date()) {
      return json({ valid: false, reason_code: "TOKEN_EXPIRED" });
    }

    // Step 2: Validate selected_option key against options
    const options = row.options as Array<{ key: string; label: string }>;
    const matchedOption = options.find((o) => o.key === selected_option);
    if (!matchedOption) {
      return json({ valid: false, reason_code: "INVALID_OPTION" });
    }

    // Step 3: Atomic update
    const now = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabase
      .from("action_responses")
      .update({ selected_option, submitted_at: now })
      .eq("token_hash", tokenHash)
      .is("submitted_at", null)
      .gt("expires_at", now)
      .select("action_id, workspace_id, options")
      .maybeSingle();

    if (updateErr || !updated) {
      const { data: recheck } = await supabase
        .from("action_responses")
        .select("submitted_at, expires_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (recheck?.submitted_at) {
        return json({ valid: false, reason_code: "ALREADY_RESPONDED" });
      }
      if (recheck && new Date(recheck.expires_at) <= new Date()) {
        return json({ valid: false, reason_code: "TOKEN_EXPIRED" });
      }
      return json({ valid: false, reason_code: "ALREADY_RESPONDED" });
    }

    // Step 4: Load action -> item -> account_id for timeline
    const { data: action } = await supabase
      .from("actions")
      .select("item_id, items(account_id)")
      .eq("id", updated.action_id)
      .maybeSingle();

    // Step 5: Write inbound timeline event (only after update success)
    if (action?.items) {
      const accountId = (action.items as any).account_id as string;
      await writeTimeline(supabase, {
        accountId,
        itemId: action.item_id,
        direction: "inbound",
        channel: "portal",
        summary: `Recipient responded: ${matchedOption.label}`,
        rawJson: {
          event_type: "recipient_response",
          selected_option,
          submitted_at: now,
          token_hash_prefix: prefix,
        },
      });
    }

    // Step 6: Structured log
    console.log(JSON.stringify({
      event: "response_submitted",
      token_hash_prefix: prefix,
      selected_option,
      action_id: updated.action_id,
      workspace_id: updated.workspace_id,
      timestamp: now,
    }));

    return json({ valid: true });
  } catch (err) {
    console.error("[submit-response] Error:", err);
    return json({ valid: false, reason_code: "INVALID_TOKEN" }, 500);
  }
});

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
