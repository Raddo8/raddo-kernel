// supabase/functions/world-graph/receipts.ts
//
// W1b · change_log receipts. Write then read back, retry once.
// A receipt that cannot be proven is reported as unproven, never assumed.

export type ReceiptArgs = {
  tenant_id: string;
  entity_id: string | null;
  change: string;
  summary: string;
  actor: "cob" | "client";
};

export type Receipt = { ok: boolean; change_log_id: string | null; attempts: number };

// change_log carries CHECK vocabularies on entity and change. World receipts
// map onto that vocabulary rather than widening it: the world change name is
// kept verbatim at the head of the summary so the receipt stays legible.
const CHANGE_MAP: Record<string, string> = {
  "world.stage": "created",
  "world.govern": "status",
  "world.merge": "status",
};

async function attempt(admin: any, a: ReceiptArgs): Promise<string | null> {
  const { data, error } = await admin
    .from("change_log")
    .insert({
      tenant_id: a.tenant_id,
      entity: "knowledge",
      entity_id: a.entity_id,
      change: CHANGE_MAP[a.change] ?? "edited",
      summary: `${a.change.toUpperCase()} \u00b7 ${a.summary}`,
      actor: a.actor,
    })
    .select("id")
    .single();
  if (error || !data?.id) return null;

  const back = await admin.from("change_log").select("id").eq("id", data.id).maybeSingle();
  if (back.error || !back.data?.id) return null;
  return back.data.id as string;
}

export async function writeReceipt(admin: any, a: ReceiptArgs): Promise<Receipt> {
  if (!admin) return { ok: false, change_log_id: null, attempts: 0 };
  for (let i = 1; i <= 2; i++) {
    try {
      const id = await attempt(admin, a);
      if (id) return { ok: true, change_log_id: id, attempts: i };
    } catch (e) {
      console.error("world_receipt_exception", e instanceof Error ? e.message : String(e));
    }
  }
  console.error("world_receipt_unproven", JSON.stringify({ change: a.change, tenant_id: a.tenant_id }));
  return { ok: false, change_log_id: null, attempts: 2 };
}
