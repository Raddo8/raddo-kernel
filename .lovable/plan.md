

# Store RESEND_API_KEY, Fail-Fast From Address, and End-to-End Email Test

## Step 1 — Store RESEND_API_KEY as a backend secret

Use the secure secrets tool to prompt for the key. It gets stored as an edge function environment variable — never in code, DB, or frontend.

Then redeploy all three edge functions: `execute-action-server`, `process-scheduled-actions`, `process-policy-rules`.

## Step 2 — Replace fallback with fail-fast

In `supabase/functions/_shared/execute-action-core.ts` (lines 359-373), remove the generic fallback and instead fail the action if the workspace has no email connector configured.

```text
Before (lines 360-373):
  let fromEmail = "noreply@example.com";
  let fromName = "Casey";
  const { data: connector } = await supabase
    .from("connectors")
    .select("config")
    .eq("type", "email")
    .eq("workspace_id", action.workspace_id)
    .maybeSingle();
  if (connector?.config) {
    const cfg = connector.config as Record<string, string>;
    if (cfg.from_email) fromEmail = cfg.from_email;
    if (cfg.from_name) fromName = cfg.from_name;
  }

After:
  const { data: connector } = await supabase
    .from("connectors")
    .select("config")
    .eq("type", "email")
    .eq("workspace_id", action.workspace_id)
    .maybeSingle();

  const cfg = connector?.config as Record<string, string> | undefined;
  const fromEmail = cfg?.from_email;
  const fromName = cfg?.from_name;

  if (!fromEmail || !fromName) {
    const errMsg = "from_address_not_configured: set from_email and from_name in the email connector config";
    await failAction(supabase, actionId, errMsg, renderErrors, {
      error_code: "from_address_not_configured",
    });
    if (accountId) {
      await writeTimeline(supabase, {
        accountId,
        itemId: action.item_id,
        direction: "system",
        channel: "system",
        summary: `Action failed: email connector missing from_email/from_name (${action.type})`,
      });
    }
    return { success: false, error: "from_address_not_configured" };
  }
```

This keeps the engine workspace-neutral. Each workspace must configure its own email connector with `from_email` and `from_name`. No environment-specific branding baked in.

## Step 3 — Update your workspace email connector

The existing connector `095900b6` currently has `from_email: "aa@aa.com"` and `from_name: "TEST Connector A"`. Update it to:

- `from_email`: `system@mail.raddo.ai`
- `from_name`: `Raddo Engine`

This is a DB update on the `connectors` table config column.

## Step 4 — End-to-end test via UI

1. Create a test template with subject `Test: {{account.name}}` and body `Hello {{contact.name}}, this is a test from Raddo Engine.`
2. Create a test action: channel=`email`, type=`send_message`, status=`scheduled`, pointing at an existing item/account/contact with a real email address, template_id set to the test template
3. Execute via the Actions Queue UI (click the execute button)
4. Verify:
   - Action status = `completed`
   - `result_json.provider` = `"resend"`
   - `result_json.provider_message_id` exists
   - Timeline event with direction=`outbound`, channel=`email`
   - Email received in inbox

## Step 5 — Scheduler test

1. Create another test action with `scheduled_for` set 1 minute ahead, status=`scheduled`
2. Wait for scheduler tick (or trigger manually)
3. Confirm it transitions `scheduled` -> `running` -> `completed` automatically

## Summary of changes

| What | Where | Type |
|------|-------|------|
| RESEND_API_KEY | Backend secrets | Secret |
| Fail-fast from address | `_shared/execute-action-core.ts` lines 359-373 | Code change (1 file) |
| Connector config update | `connectors` table, row `095900b6` | DB update |
| Redeploy | 3 edge functions | Deploy |
| No schema/migration changes needed | | |

