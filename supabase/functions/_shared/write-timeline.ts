import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const VALID_DIRECTIONS = new Set(["inbound", "outbound", "system"]);
const VALID_CHANNELS = new Set(["email", "sms", "phone", "system", "portal"]);

export interface WriteTimelineParams {
  accountId: string;
  itemId?: string;
  contactId?: string;
  direction: string;
  channel: string;
  summary: string;
  body?: string | null;
  rawJson?: Record<string, unknown> | null;
}

export async function writeTimeline(
  supabase: ReturnType<typeof createClient>,
  params: WriteTimelineParams
) {
  if (!VALID_DIRECTIONS.has(params.direction) || !VALID_CHANNELS.has(params.channel)) {
    console.error(
      `[writeTimeline] Invalid params: direction=${params.direction}, channel=${params.channel}`
    );
    return;
  }

  await supabase.from("timeline_events").insert({
    account_id: params.accountId,
    item_id: params.itemId || null,
    contact_id: params.contactId || null,
    direction: params.direction as any,
    channel: params.channel,
    summary: params.summary,
    body: params.body || null,
    raw_json: params.rawJson ?? null,
    occurred_at: new Date().toISOString(),
  });
}
