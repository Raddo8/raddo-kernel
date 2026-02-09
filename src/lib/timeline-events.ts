/**
 * Centralized timeline write helper (constraint 2).
 *
 * UI components may call this helper but must NEVER write to
 * the timeline_events table directly.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Direction = Database["public"]["Enums"]["item_direction"];

// Allow-listed values for direction and channel validation.
const VALID_DIRECTIONS: Set<string> = new Set(["inbound", "outbound", "system"]);
const VALID_CHANNELS: Set<string> = new Set(["email", "sms", "phone", "system", "portal"]);

export interface TimelineEventParams {
  accountId: string;
  itemId?: string;
  contactId?: string;
  direction: Direction;
  channel: string;
  summary: string;
  body?: string;
  rawJson?: Record<string, unknown>;
}

export async function writeTimelineEvent(params: TimelineEventParams) {
  // Validate direction against allow-list
  if (!VALID_DIRECTIONS.has(params.direction)) {
    console.error(`[writeTimelineEvent] Invalid direction: "${params.direction}". Must be one of: ${[...VALID_DIRECTIONS].join(", ")}`);
    return { error: { message: `Invalid direction: ${params.direction}` } };
  }

  // Validate channel against allow-list
  if (!VALID_CHANNELS.has(params.channel)) {
    console.error(`[writeTimelineEvent] Invalid channel: "${params.channel}". Must be one of: ${[...VALID_CHANNELS].join(", ")}`);
    return { error: { message: `Invalid channel: ${params.channel}` } };
  }

  const row: Record<string, unknown> = {
    account_id: params.accountId,
    item_id: params.itemId ?? null,
    contact_id: params.contactId ?? null,
    direction: params.direction,
    channel: params.channel,
    summary: params.summary,
    body: params.body ?? null,
    raw_json: params.rawJson ?? null,
    occurred_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("timeline_events").insert(row as any);

  if (error) {
    console.error("[writeTimelineEvent] Failed:", error.message);
  }
  return { error };
}
