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
    return jsonResponse({
      connected: Boolean(stripeKey),
      test_mode: stripeKey ? stripeKey.startsWith("sk_test_") : null,
    });
  }

  if (!stripeKey) {
    return jsonResponse({ error: "Stripe not connected — set STRIPE_SECRET_KEY in project secrets (test mode: sk_test_…)" }, 400);
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

  // ---------- Hosted Stripe Invoice (hybrid rail) ----------
  if (action === "create_invoice_payment_link") {
    const invoiceId = body.invoice_id;
    if (!invoiceId) return jsonResponse({ error: "invoice_id required" }, 400);

    const { data: inv, error: iErr } = await supabase
      .from("invoices")
      .select("*, accounts(id, name, primary_contact_id, stripe_customer_id, metadata)")
      .eq("id", invoiceId)
      .maybeSingle();
    if (iErr || !inv) return jsonResponse({ error: "invoice not found" }, 404);

    const { data: isMemberInv } = await supabase.rpc("is_workspace_member", {
      _user_id: user.id,
      _workspace_id: inv.workspace_id,
    });
    if (!isMemberInv) return jsonResponse({ error: "forbidden" }, 403);

    if (inv.status === "paid" || inv.status === "void") {
      return jsonResponse({ error: `invoice is ${inv.status}` }, 400);
    }

    // Idempotent: if a Stripe invoice already exists, reuse it.
    if (inv.stripe_invoice_id && String(inv.stripe_invoice_id).startsWith("in_") && inv.stripe_payment_link) {
      return jsonResponse({
        ok: true,
        url: inv.stripe_payment_link,
        pdf: inv.stripe_invoice_pdf ?? null,
        stripe_invoice_id: inv.stripe_invoice_id,
        reused: true,
      });
    }

    try {
      // Best-effort branding sync (safe to call repeatedly; ignore failure).
      try {
        await stripe.accounts.update("self" as any, {
          settings: {
            branding: {
              primary_color: "#042C53",
              secondary_color: "#EF9F27",
            },
          },
        } as any);
      } catch { /* branding not writable on all account types; ignore */ }

      const acc: any = inv.accounts;
      const accountId: string = acc?.id;

      // Resolve customer email/name from primary contact → metadata fallback.
      let contactEmail: string | null = null;
      let contactName: string | null = null;
      if (acc?.primary_contact_id) {
        const { data: c } = await supabase.from("contacts")
          .select("name, email").eq("id", acc.primary_contact_id).maybeSingle();
        if (c) { contactName = c.name; contactEmail = c.email; }
      }
      if (!contactEmail) {
        const p = acc?.metadata?.cob_profile?.primary_contact;
        if (p?.email) { contactEmail = p.email; contactName = p.name ?? contactName; }
      }

      // Find or create Stripe customer.
      let customerId: string | null = acc?.stripe_customer_id ?? null;
      if (!customerId) {
        const customer = await stripe.customers.create({
          name: acc?.name ?? undefined,
          email: contactEmail ?? undefined,
          description: contactName ? `Primary contact: ${contactName}` : undefined,
          metadata: {
            cob_account_id: accountId,
            workspace_id: inv.workspace_id,
          },
        });
        customerId = customer.id;
        await supabase.from("accounts")
          .update({ stripe_customer_id: customerId })
          .eq("id", accountId);
      }

      // Compute days_until_due from our due_date.
      const today = new Date(); today.setUTCHours(0, 0, 0, 0);
      const due = new Date(String(inv.due_date) + "T00:00:00Z");
      const daysUntilDue = Math.max(1, Math.round((due.getTime() - today.getTime()) / 86_400_000));

      const lines = (inv.line_items || []) as Array<{ description: string; amount_usd: number | string; occurrence_date?: string }>;
      if (!lines.length) return jsonResponse({ error: "invoice has no line items" }, 400);

      // Create invoice items for each line (in USD cents).
      for (const li of lines) {
        const cents = Math.round(Number(li.amount_usd) * 100);
        if (cents <= 0) continue;
        await stripe.invoiceItems.create({
          customer: customerId!,
          currency: "usd",
          amount: cents,
          description: li.description + (li.occurrence_date ? ` · ${li.occurrence_date}` : ""),
          metadata: {
            cob_invoice_id: inv.id,
            invoice_number: inv.invoice_number,
          },
        });
      }

      // Create the invoice pulling in the pending items.
      const created = await stripe.invoices.create({
        customer: customerId!,
        collection_method: "send_invoice",
        days_until_due: daysUntilDue,
        pending_invoice_items_behavior: "include",
        auto_advance: false,
        description: `${inv.invoice_number} · ${acc?.name ?? "Account"}`,
        footer: inv.notes ?? undefined,
        metadata: {
          cob_invoice_id: inv.id,
          workspace_id: inv.workspace_id,
          invoice_number: inv.invoice_number,
        },
      });

      // Finalize to produce hosted URL + PDF.
      const finalized = await stripe.invoices.finalizeInvoice(created.id, {
        auto_advance: false,
      });

      await supabase.from("invoices").update({
        stripe_invoice_id: finalized.id,
        stripe_payment_link: finalized.hosted_invoice_url ?? null,
        stripe_invoice_pdf: finalized.invoice_pdf ?? null,
      }).eq("id", inv.id);

      await supabase.from("timeline_events").insert({
        account_id: inv.account_id,
        direction: "system",
        channel: "system",
        summary: `Stripe hosted invoice created for ${inv.invoice_number}`,
        raw_json: {
          invoice_id: inv.id,
          stripe_invoice_id: finalized.id,
          hosted_invoice_url: finalized.hosted_invoice_url,
          invoice_pdf: finalized.invoice_pdf,
          customer_id: customerId,
        },
        occurred_at: new Date().toISOString(),
      });

      return jsonResponse({
        ok: true,
        url: finalized.hosted_invoice_url,
        pdf: finalized.invoice_pdf,
        stripe_invoice_id: finalized.id,
      });
    } catch (e: any) {
      console.error("create_invoice_payment_link error", e?.message);
      return jsonResponse({ error: e?.message ?? "stripe error" }, 500);
    }
  }


  // ---------- Revenue schedule flows (existing) ----------
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
