

# Fix: Present Options Template Resolution (Revised)

All four requirements addressed. No hardcoded UUIDs anywhere.

---

## Changes to `src/pages/ItemDetail.tsx`

### 1. Add dynamic template lookup by workspace + type

New state and effect that resolves the template at runtime:

```typescript
const [presentOptionsTemplateId, setPresentOptionsTemplateId] = useState<string | null>(null);

useEffect(() => {
  if (workspace) {
    supabase.from("templates")
      .select("id")
      .eq("workspace_id", workspace.id)
      .eq("template_type", "present_options")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setPresentOptionsTemplateId(data?.id ?? null));
  }
}, [workspace]);
```

No concrete UUID referenced anywhere.

### 2. Disable the button when template is unresolved

The "Present Options" button gets a `disabled` prop and visual feedback:

```typescript
<Button
  variant="secondary"
  size="sm"
  className="w-full justify-start"
  disabled={!presentOptionsTemplateId}
  onClick={() => handleQueueAction("present_options", "email", {
    options: [
      { key: "pay_full", label: "Pay in Full" },
      { key: "request_extension", label: "Request Extension" },
      { key: "payment_plan", label: "Propose Payment Plan" },
      { key: "dispute", label: "Dispute" },
    ],
  }, presentOptionsTemplateId!)}
>
  <MessageSquare size={14} className="mr-2" />
  {presentOptionsTemplateId ? "Present Options" : "Present Options (template missing)"}
</Button>
```

When `presentOptionsTemplateId` is `null`, the button is grayed out and labeled accordingly. No action can be queued.

### 3. Fix the function signature

Update `handleQueueAction` to accept a 4th optional `templateId` parameter and forward it to `queueAction()` using the existing `templateId` field on `QueueActionParams`:

```typescript
const handleQueueAction = async (
  actionType: string,
  channel: string,
  payloadJson?: Record<string, unknown>,
  templateId?: string,
) => {
  if (!id || !item) return;
  const result = await queueAction({
    itemId: id,
    type: actionType,
    channel,
    source: "ui",
    actorUserId: userId ?? undefined,
    payloadJson,
    templateId,        // forwarded to QueueActionParams.templateId
  });
  // ... existing error/success handling unchanged
};
```

The field name `templateId` matches `QueueActionParams` exactly -- no mapping needed.

### 4. Guard against missing template at queue time

Even though the button is disabled, add a runtime guard as defense-in-depth:

```typescript
if (actionType === "present_options" && !templateId) {
  toast.error("No present_options template configured for this workspace");
  return;
}
```

This sits at the top of `handleQueueAction`, before calling `queueAction()`. Prevents terminal failures if the button state is somehow bypassed.

---

## No other files change

- `queue-actions.ts` already has `templateId` on `QueueActionParams` -- no changes needed.
- No backend changes needed -- SITE_URL and template already configured.

## After deployment: E2E test sequence

1. Open any item with contacts
2. Verify "Present Options" button is enabled (template resolved)
3. Click it -- confirm action queued successfully
4. Verify action transitions to completed
5. Check email, click link, verify respond page
6. Submit option, verify "Response received"
7. Revisit link, verify "Already responded"
8. Check timeline for inbound event with correct raw_json
9. Negative tests: expired token, random token

