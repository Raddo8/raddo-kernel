
# Update HANDOFF.md to be the single canonical paste target

## Problem

The HANDOFF PASTE the user has been carrying forward is stale (version 2026.0213, ~69% maturity). The current `docs/HANDOFF.md` (version 2026.0214.1829, ~79% maturity) contains everything needed but the user needs confidence that pasting the file contents directly into a new conversation will onboard the next agent completely.

## What needs to change

1. **Update `docs/SECURITY_POSTURE_REPORT.md`** -- Currently dated 2026-02-13 and missing metering verification evidence. Bump version using DB clock, add metering verification results (soft limit, trigger 1:1, billing UI), update confidence to 0.98.

2. **Add explicit paste instructions to HANDOFF.md** -- Add a section at the very top (after the version header) with a clear instruction block:
   - "To hand off: copy the ENTIRE contents of this file and paste into a new conversation."
   - "Do NOT use older HANDOFF PASTE documents. This file IS the canonical handoff."
   - "The next agent must read the Continuation Declaration and confirm compliance before proceeding."

3. **Update Verified Date format** -- Line 14 currently says `2026-02-14 (America/Chicago)`. Per the locked clock discipline rule, this should say `2026-02-14 (UTC)` since all institutional timestamps are UTC-sourced.

## Technical details

- Query `SELECT now() AT TIME ZONE 'UTC'` at edit time to get authoritative timestamp for the security report version bump.
- Security report version format: `2026.0214.HHMM` (UTC).
- No structural changes to HANDOFF.md beyond the paste instruction block and the timezone label fix.
- No changes to any edge functions, migrations, or application code.

## Outcome

After this update, the user can copy `docs/HANDOFF.md` verbatim into a new conversation and the receiving agent will have 100% of the institutional context — no stale fragments, no missing sections, no version drift.
