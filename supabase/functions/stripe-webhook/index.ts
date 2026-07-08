// Stripe webhook. Updates revenue_schedules status and writes timeline events.
// Inert until STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET are set.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "stripe-signature, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    return new Response("stripe not configured", { status: 200, headers: corsHeaders });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, webhookSecret);
  } catch (e: any) {
    console.error("webhook signature failed", e?.message);
    return new Response(`bad signature: ${e?.message}`, { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const findScheduleId = (obj: any): string | null => {
    return obj?.metadata?.schedule_id
      ?? obj?.subscription_details?.metadata?.schedule_id
      ?? null;
  };

  const writeTimeline = async (scheduleId: string, summary: string, raw: any) => {
    const { data: s } = await supabase
      .from("revenue_schedules")
      .select("account_id, item_id")
      .eq("id", scheduleId)
      .maybeSingle();
    if (!s) return;
    await supabase.from("timeline_events").insert({
      account_id: s.account_id,
      item_id: s.item_id,
      direction: "system",
      channel: "system",
      summary,
      raw_json: raw,
      occurred_at: new Date().toISOString(),
    });
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const obj = event.data.object as Stripe.Checkout.Session;

        // Hybrid rail: settle an invoice if the payment link carried cob_invoice_id.
        const cobInvoiceId = (obj.metadata as any)?.cob_invoice_id
          ?? (obj.payment_intent && typeof obj.payment_intent === "object"
              ? (obj.payment_intent as any)?.metadata?.cob_invoice_id : null);
        if (cobInvoiceId) {
          const { data: inv } = await supabase.from("invoices")
            .select("id, account_id, invoice_number, status")
            .eq("id", cobInvoiceId).maybeSingle();
          if (inv && inv.status !== "paid" && inv.status !== "void") {
            await supabase.from("invoices").update({
              status: "paid",
              paid_at: new Date().toISOString(),
              paid_via: "stripe",
              stripe_invoice_id: obj.id,
            }).eq("id", inv.id);
            await supabase.from("timeline_events").insert({
              account_id: inv.account_id,
              direction: "system", channel: "system",
              summary: `Invoice ${inv.invoice_number} paid via Stripe`,
              raw_json: { invoice_id: inv.id, session_id: obj.id, amount_total: obj.amount_total },
              occurred_at: new Date().toISOString(),
            });
          }
        }

        // Legacy revenue-schedule flow.
        const id = findScheduleId(obj);
        if (id) {
          const patch: any = { status: obj.mode === "subscription" ? "active" : "paid" };
          if (obj.subscription) patch.stripe_subscription_id = String(obj.subscription);
          await supabase.from("revenue_schedules").update(patch).eq("id", id);
          await writeTimeline(id, `Stripe checkout completed (${obj.mode})`, { session_id: obj.id });
        }
        break;
      }
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const obj = event.data.object as Stripe.Invoice;
        const subId = obj.subscription ? String(obj.subscription) : null;
        if (subId) {
          const { data: row } = await supabase
            .from("revenue_schedules")
            .select("id")
            .eq("stripe_subscription_id", subId)
            .maybeSingle();
          if (row) {
            await supabase.from("revenue_schedules")
              .update({ status: "active", stripe_invoice_id: obj.id })
              .eq("id", row.id);
            await writeTimeline(row.id, `Stripe invoice paid`, { invoice_id: obj.id, amount: obj.amount_paid });
          }
        }
        const id = findScheduleId(obj);
        if (id) {
          await supabase.from("revenue_schedules").update({ status: "paid", stripe_invoice_id: obj.id }).eq("id", id);
          await writeTimeline(id, `Stripe invoice paid`, { invoice_id: obj.id, amount: obj.amount_paid });
        }
        // Settle COB-side invoice: match by metadata OR by stored stripe_invoice_id.
        const cobInvoiceId = (obj.metadata as any)?.cob_invoice_id ?? null;
        let cobInv: any = null;
        if (cobInvoiceId) {
          const { data } = await supabase.from("invoices")
            .select("id, account_id, invoice_number, status")
            .eq("id", cobInvoiceId).maybeSingle();
          cobInv = data;
        }
        if (!cobInv && obj.id) {
          const { data } = await supabase.from("invoices")
            .select("id, account_id, invoice_number, status")
            .eq("stripe_invoice_id", obj.id).maybeSingle();
          cobInv = data;
        }
        if (cobInv && cobInv.status !== "paid" && cobInv.status !== "void") {
          await supabase.from("invoices").update({
            status: "paid",
            paid_at: new Date().toISOString(),
            paid_via: "stripe",
            stripe_invoice_id: obj.id,
          }).eq("id", cobInv.id);
          await supabase.from("timeline_events").insert({
            account_id: cobInv.account_id,
            direction: "system", channel: "system",
            summary: `Invoice ${cobInv.invoice_number} paid via Stripe`,
            raw_json: { invoice_id: cobInv.id, stripe_invoice_id: obj.id, amount_paid: obj.amount_paid },
            occurred_at: new Date().toISOString(),
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const obj = event.data.object as Stripe.Invoice;
        const subId = obj.subscription ? String(obj.subscription) : null;
        if (subId) {
          const { data: row } = await supabase
            .from("revenue_schedules").select("id").eq("stripe_subscription_id", subId).maybeSingle();
          if (row) {
            await supabase.from("revenue_schedules").update({ status: "overdue" }).eq("id", row.id);
            await writeTimeline(row.id, `Stripe payment failed`, { invoice_id: obj.id });
          }
        }
        const cobInvoiceId = (obj.metadata as any)?.cob_invoice_id;
        if (cobInvoiceId) {
          const { data: inv } = await supabase.from("invoices")
            .select("id, account_id, invoice_number").eq("id", cobInvoiceId).maybeSingle();
          if (inv) {
            await supabase.from("invoices").update({ status: "overdue" }).eq("id", inv.id);
            await supabase.from("timeline_events").insert({
              account_id: inv.account_id,
              direction: "system", channel: "system",
              summary: `Invoice ${inv.invoice_number} · Stripe payment failed — chase draft needed`,
              raw_json: { invoice_id: inv.id, stripe_invoice_id: obj.id },
              occurred_at: new Date().toISOString(),
            });
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const obj = event.data.object as Stripe.Subscription;
        const { data: row } = await supabase
          .from("revenue_schedules").select("id").eq("stripe_subscription_id", obj.id).maybeSingle();
        if (row) {
          await supabase.from("revenue_schedules").update({ status: "cancelled" }).eq("id", row.id);
          await writeTimeline(row.id, `Stripe subscription cancelled`, { subscription_id: obj.id });
        }
        break;
      }
    }
  } catch (e: any) {
    console.error("webhook handler error", e?.message);
    return new Response(`handler error: ${e?.message}`, { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
