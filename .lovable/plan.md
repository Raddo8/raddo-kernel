

## Execute Verification Steps B and C

### Correction Acknowledged

`due_date` is type `date`. The `older_than_minutes` predicate parses it via `new Date(fieldValue)` which yields midnight UTC -- not minute-granularity. Using `current_date - 1` (yesterday) guarantees the value is deterministically in the past by at least 24 hours, making the predicate pass reliably regardless of timezone.

### Step B -- Cron queues actions

1. Run:
   ```sql
   UPDATE items
   SET due_date = (current_date - 1),
       updated_at = now()
   WHERE id = '65d6cc88-f665-428c-a929-6ef87f005274';
   ```

2. Wait ~3 minutes for `process-policy-rules` cron tick.

3. Query actions (verified column names, no `rule_id` column exists -- rule reference lives only in the `idempotency_key` string):
   ```sql
   SELECT id, workspace_id, item_id, type, channel,
          scheduled_for, idempotency_key, status, created_at
   FROM actions
   WHERE workspace_id = 'f3ebf868-ba4b-48cc-a36c-079452d04c78'
     AND idempotency_key LIKE 'policy:%'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

4. Check `process-policy-rules` edge function logs for queued/skipped counts.

5. Wait another tick, re-query -- expect same row count (unique violation skip path).

### Step C -- UI toggle

1. Open browser to `/policy-rules`.
2. Toggle sort_order=100 rule OFF.
3. Confirm DB:
   ```sql
   SELECT sort_order, enabled
   FROM policy_rules
   WHERE workspace_id = 'f3ebf868-ba4b-48cc-a36c-079452d04c78'
     AND vertical_pack_key = 'casey'
   ORDER BY sort_order;
   ```
4. Update item again (`updated_at = now()`), wait for tick, query actions -- no new row from disabled rule.
5. Toggle back ON, wait, confirm skip (already queued via idempotency).

### Files Modified

None -- database updates and browser interaction only.

