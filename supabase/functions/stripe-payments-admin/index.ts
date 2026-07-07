// Stripe payments admin: status probe + create-payment-link / create-subscription.
// Manual, operator-driven. Never auto-charges.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = body.action;

  if (action === "status") {
    return jsonResponse({ connected: Boolean(stripeKey) });
  }

  if (!stripeKey) {
    return jsonResponse({ error: "Stripe not connected" }, 400);
  }

  // Auth: verify caller
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return jsonResponse({ error: "unauthorized" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: userData } = await supabase.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  const scheduleId = body.schedule_id;
  if (!scheduleId) return jsonResponse({ error: "schedule_id required" }, 400);

  const { data: schedule, error: sErr } = await supabase
    .from("revenue_schedules")
    .select("*, accounts(id, name), items(id, title)")
    .eq("id", scheduleId)
    .maybeSingle();
  if (sErr || !schedule) return jsonResponse({ error: "schedule not found" }, 404);

  const { data: isMember } = await supabase.rpc("is_workspace_member", {
    _user_id: user.id,
    _workspace_id: schedule.workspace_id,
  });
  if (!isMember) return jsonResponse({ error: "forbidden" }, 403);

  try {
    if (action === "create_payment_link") {
      if (schedule.kind !== "one_time") return jsonResponse({ error: "wrong kind" }, 400);

      const product = schedule.stripe_product_id
        ? await stripe.products.retrieve(schedule.stripe_product_id)
        : await stripe.products.create({
            name: `${schedule.accounts?.name ?? "Account"} · ${schedule.description}`,
            metadata: { schedule_id: schedule.id, workspace_id: schedule.workspace_id },
          });

      const price = schedule.stripe_price_id
        ? await stripe.prices.retrieve(schedule.stripe_price_id)
        : await stripe.prices.create({
            product: product.id,
            currency: "usd",
            unit_amount: Math.round(Number(schedule.amount_usd) * 100),
          });

      const link = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: { schedule_id: schedule.id, workspace_id: schedule.workspace_id },
      });

      await supabase.from("revenue_schedules").update({
        stripe_product_id: product.id,
        stripe_price_id: price.id,
        stripe_payment_link: link.url,
      }).eq("id", schedule.id);

      await supabase.from("timeline_events").insert({
        account_id: schedule.account_id,
        item_id: schedule.item_id,
        direction: "system",
        channel: "system",
        summary: `Stripe payment link created for “${schedule.description}”`,
        raw_json: { schedule_id: schedule.id, price_id: price.id, link: link.url },
        occurred_at: new Date().toISOString(),
      });

      return jsonResponse({ ok: true, url: link.url });
    }

    if (action === "create_subscription") {
      if (schedule.kind !== "subscription") return jsonResponse({ error: "wrong kind" }, 400);

      const product = schedule.stripe_product_id
        ? await stripe.products.retrieve(schedule.stripe_product_id)
        : await stripe.products.create({
            name: `${schedule.accounts?.name ?? "Account"} · ${schedule.description}`,
            metadata: { schedule_id: schedule.id, workspace_id: schedule.workspace_id },
          });

      const price = schedule.stripe_price_id
        ? await stripe.prices.retrieve(schedule.stripe_price_id)
        : await stripe.prices.create({
            product: product.id,
            currency: "usd",
            unit_amount: Math.round(Number(schedule.amount_usd) * 100),
            recurring: { interval: "month" },
          });

      // Create a checkout session in subscription mode so the customer sets up billing manually.
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: price.id, quantity: 1 }],
        success_url: `${req.headers.get("origin") ?? "https://chiefofbusiness.ai"}/app/revenue`,
        cancel_url: `${req.headers.get("origin") ?? "https://chiefofbusiness.ai"}/app/revenue`,
        metadata: { schedule_id: schedule.id, workspace_id: schedule.workspace_id },
      });

      await supabase.from("revenue_schedules").update({
        stripe_product_id: product.id,
        stripe_price_id: price.id,
        stripe_payment_link: session.url,
      }).eq("id", schedule.id);

      await supabase.from("timeline_events").insert({
        account_id: schedule.account_id,
        item_id: schedule.item_id,
        direction: "system",
        channel: "system",
        summary: `Stripe subscription checkout link created for “${schedule.description}”`,
        raw_json: { schedule_id: schedule.id, price_id: price.id, url: session.url },
        occurred_at: new Date().toISOString(),
      });

      return jsonResponse({ ok: true, url: session.url });
    }

    return jsonResponse({ error: "unknown action" }, 400);
  } catch (e: any) {
    console.error("stripe-payments-admin error", e);
    return jsonResponse({ error: e?.message ?? "stripe error" }, 500);
  }
});
