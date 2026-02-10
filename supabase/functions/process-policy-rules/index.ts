import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// ── Canonical predicate hashing ──

function canonicalStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (Array.isArray(obj))
    return "[" + obj.map(canonicalStringify).join(",") + "]";
  if (typeof obj === "object") {
    const sorted = Object.keys(obj as Record<string, unknown>).sort();
    return (
      "{" +
      sorted
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonicalStringify((obj as Record<string, unknown>)[k])
        )
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(obj);
}

async function hashPredicate(predicate: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(canonicalStringify(predicate));
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 8);
}

// ── Safe dot-path field resolver ──

function resolveField(item: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = item;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ── Predicate evaluator ──

interface Condition {
  all?: Condition[];
  any?: Condition[];
  field?: string;
  op?: string;
  value?: unknown;
}

function evaluatePredicate(
  condition: Condition,
  item: Record<string, unknown>,
  now: number
): boolean {
  if (condition.all) {
    return condition.all.every((c) => evaluatePredicate(c, item, now));
  }
  if (condition.any) {
    return condition.any.some((c) => evaluatePredicate(c, item, now));
  }

  const { field, op, value } = condition;
  if (!field || !op) return false;

  const fieldValue = resolveField(item, field);

  switch (op) {
    case "exists":
      return fieldValue !== undefined && fieldValue !== null;
    case "not_exists":
      return fieldValue === undefined || fieldValue === null;
    case "is_true":
      return fieldValue === true;
    case "is_false":
      return fieldValue === false;
    case "equals":
      if (fieldValue === undefined || fieldValue === null) return false;
      return fieldValue === value;
    case "not_equals":
      if (fieldValue === undefined || fieldValue === null) return false;
      return fieldValue !== value;
    case "gt":
      if (fieldValue === undefined || fieldValue === null) return false;
      return (fieldValue as number) > (value as number);
    case "gte":
      if (fieldValue === undefined || fieldValue === null) return false;
      return (fieldValue as number) >= (value as number);
    case "lt":
      if (fieldValue === undefined || fieldValue === null) return false;
      return (fieldValue as number) < (value as number);
    case "lte":
      if (fieldValue === undefined || fieldValue === null) return false;
      return (fieldValue as number) <= (value as number);
    case "in":
      if (fieldValue === undefined || fieldValue === null) return false;
      return Array.isArray(value) && value.includes(fieldValue);
    case "not_in":
      if (fieldValue === undefined || fieldValue === null) return false;
      return Array.isArray(value) && !value.includes(fieldValue);
    case "older_than_minutes": {
      if (fieldValue === undefined || fieldValue === null) return false;
      const fieldDate = new Date(fieldValue as string).getTime();
      if (isNaN(fieldDate)) return false;
      return (now - fieldDate) > (value as number) * 60_000;
    }
    case "newer_than_minutes": {
      if (fieldValue === undefined || fieldValue === null) return false;
      const fieldDate = new Date(fieldValue as string).getTime();
      if (isNaN(fieldDate)) return false;
      return (now - fieldDate) < (value as number) * 60_000;
    }
    default:
      return false;
  }
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: X-CRON-SECRET only
  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (!cronSecret || provided !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const now = Date.now();
  const tenMinutesAgo = new Date(now - 10 * 60_000).toISOString();
  const oneDayFromNow = new Date(now + 24 * 60 * 60_000).toISOString().split("T")[0];

  let totalProcessed = 0;
  let totalQueued = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  try {
    const { data: workspaces, error: wsErr } = await supabase
      .from("workspaces")
      .select("id");
    if (wsErr) throw wsErr;

    for (const ws of workspaces || []) {
      const { data: rules, error: rulesErr } = await supabase
        .from("policy_rules")
        .select("*")
        .eq("workspace_id", ws.id)
        .eq("enabled", true)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (rulesErr || !rules || rules.length === 0) continue;

      const { data: items, error: itemsErr } = await supabase
        .from("items")
        .select("*")
        .eq("workspace_id", ws.id)
        .or(`updated_at.gte.${tenMinutesAgo},due_date.lte.${oneDayFromNow}`)
        .limit(500);

      if (itemsErr || !items || items.length === 0) continue;

      const predicateHashes: string[] = [];
      for (const rule of rules) {
        predicateHashes.push(await hashPredicate(rule.predicate));
      }

      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const predHash = predicateHashes[i];

        for (const item of items) {
          totalProcessed++;

          const match = evaluatePredicate(
            rule.predicate as Condition,
            item as unknown as Record<string, unknown>,
            now
          );
          if (!match) continue;

          const delayMs =
            ((rule.delay_minutes || 0) * 60_000) +
            ((rule.delay_seconds || 0) * 1_000);
          const scheduledFor = new Date(now + delayMs).toISOString();

          const idempotencyKey = `policy:${rule.id}:${item.id}:${predHash}:${i}`;

          // Route through execute-action-server create mode
          try {
            const response = await fetch(
              `${supabaseUrl}/functions/v1/execute-action-server`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-CRON-SECRET": cronSecret,
                },
                body: JSON.stringify({
                  mode: "create",
                  params: {
                    itemId: item.id,
                    type: rule.action_type,
                    channel: rule.action_channel,
                    scheduledFor,
                    idempotencyKey,
                    requiresApproval: rule.requires_approval,
                    templateId: rule.template_id ?? undefined,
                    contactId: rule.contact_id ?? undefined,
                    source: "system",
                  },
                }),
              }
            );
            const result = await response.json();

            if (result.skipped && result.reason === "duplicate") {
              totalSkipped++;
            } else if (result.success && !result.skipped) {
              totalQueued++;
            } else if (result.skipped && result.reason === "rate_limited") {
              totalSkipped++;
            } else {
              totalErrors++;
              console.error(
                `[process-policy-rules] Create failed:`,
                { ruleId: rule.id, itemId: item.id, result }
              );
            }
          } catch (fetchErr) {
            totalErrors++;
            console.error(
              `[process-policy-rules] Fetch error:`,
              { ruleId: rule.id, itemId: item.id, error: (fetchErr as Error).message }
            );
          }
        }
      }
    }

    const result = {
      processed: totalProcessed,
      queued: totalQueued,
      skipped: totalSkipped,
      errors: totalErrors,
    };
    console.log("[process-policy-rules] Complete:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[process-policy-rules] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
