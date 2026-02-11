

# Step 2: Scheduler E2E Test

## Action

Insert one scheduled action into the database with `scheduled_for = now() + 3 minutes`, then monitor until the `process-scheduled-actions` worker picks it up.

## SQL to execute

```sql
INSERT INTO actions (item_id, type, channel, status, contact_id, template_id, source, scheduled_for)
VALUES (
  '65d6cc88-f665-428c-a929-6ef87f005274',
  'send_message',
  'email',
  'scheduled',
  '57be3fd2-e5c1-4154-afd5-d8648a802651',
  '5a9e2eab-a3a2-445a-afb9-a027fa71b244',
  'system',
  now() + interval '3 minutes'
)
RETURNING id, status, scheduled_for, workspace_id;
```

## Monitoring

After insert, poll the action row every 30 seconds for up to 5 minutes:

```sql
SELECT id, status, scheduled_for, claimed_at, executed_at, result_json
FROM actions
WHERE id = '<NEW_ACTION_ID>';
```

## Acceptance criteria

- Status transitions: `scheduled` -> `running` -> `completed`
- `claimed_at` populated
- `executed_at` populated
- `result_json.provider_message_id` present
- `result_json.recipient_email` = `jacobdburkett@gmail.com`
- Timeline events: scheduler-driven execution-start + outbound email

## Failure triage

| Symptom | Likely cause | Next step |
|---------|-------------|-----------|
| Still `scheduled` after 5 min | Cron not firing or query mismatch | Check `process-scheduled-actions` edge function logs |
| Stuck in `running` | Provider call hang or exception | Check `execute-action-core` error + edge logs |
| `failed` with error_code | Provider/config issue | Read `result_json` for exact Resend error |

## No code changes required

This is a single DB insert followed by monitoring queries and edge function log checks.

