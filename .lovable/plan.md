

# Create Load Test Fixtures and Run k6

## What I Will Do (Once Approved)

Create three database records for the load test:

1. A workspace named `[LOAD-TEST] Capacity`
2. A workspace_member linking your user to it
3. An account named `[LOAD-TEST] Account` inside that workspace
4. An item named `[LOAD-TEST] Item` inside that account

## After That, Your Steps

Once the fixtures are created, I will give you the exact Terminal commands with all UUIDs filled in. You will:

1. **Get your auth token** from the browser:
   - In the app preview (right side), open browser Dev Tools (right-click > Inspect > Application tab)
   - Look in Local Storage for a key starting with `sb-`
   - Copy the `access_token` value from inside it

2. **Paste the export commands** I give you into Terminal (I will pre-fill all UUIDs)

3. **Run the test**:
   ```text
   k6 run load-tests/ramp.js
   ```

4. **Paste the output** back here so we can record the results

## Technical Details

- User ID: `760b2da9-f507-47f1-9dd3-e205446bd3da`
- All fixtures use `[LOAD-TEST]` prefix for easy identification and cleanup
- The workspace_member record is required so RLS policies allow the auth token to access test data
- The k6 script ramps from 1 to 50 virtual users over 3 minutes, auto-aborts if error rate exceeds 1%

