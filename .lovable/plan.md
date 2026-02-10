

## Verify UI Execution Path

### Step 1: Insert test action
Insert a scheduled action via the database change tool:
```sql
INSERT INTO actions (item_id, type, channel, status, scheduled_for, source, requires_approval, workspace_id)
VALUES (
  'f7aae626-67fc-4f84-bb61-dd14a05fe49f',
  'test_ui_execute',
  'system',
  'scheduled',
  now(),
  'system',
  false,
  '589ccb00-4d3b-454a-b653-cd8a5591d4b7'
) RETURNING id;
```

### Step 2: Execute from UI
Open the browser to `/actions`, filter to "scheduled", and click the Play button on the `test_ui_execute` action.

### Step 3: Verify action row
Query the actions table and confirm:
- `status` = `completed`
- `claimed_by` = logged-in user's UUID (not null)
- `source` = `ui`
- `executed_at` is set
- `result_json` contains `mock: true`

### Step 4: Verify timeline event
Query `timeline_events` for a row with summary containing `test_ui_execute`, confirming `direction = 'outbound'` and `channel = 'system'`.

### Step 5: Clean up
If all checks pass, delete test actions:
```sql
DELETE FROM actions WHERE type IN ('test_scheduler', 'test_scheduler_auto', 'test_ui_execute');
DELETE FROM timeline_events WHERE summary LIKE '%test_scheduler%' OR summary LIKE '%test_ui_execute%';
```

### Report
Print the full action row and timeline event row for confirmation before cleanup.

