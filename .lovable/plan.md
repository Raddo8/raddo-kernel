

# Fix: Billing Period Label Timezone Bug

## Problem

The `/billing` page shows "January 2026" instead of "February 2026" because `new Date("2026-02-01")` is parsed as UTC midnight, which rolls back to January 31 in US Central timezone. The `date-fns` `format()` function then outputs "January 2026".

## Fix

In `src/pages/BillingUsage.tsx`, line 66, change the date construction to force local-time parsing:

```text
// Before:
format(new Date(data.current_period + "-01"), "MMMM yyyy")

// After:
format(new Date(data.current_period + "-01T00:00:00"), "MMMM yyyy")
```

By appending `T00:00:00` (no `Z` suffix), the string is parsed as local time instead of UTC, preventing the off-by-one day rollback in negative-offset timezones.

## Files Changed

| File | Change |
|---|---|
| `src/pages/BillingUsage.tsx` | Line 66: append `T00:00:00` to date string |

## Verification After Fix

- `/billing` should display "February 2026" as the billing period
- No other behavior changes

## Still Pending (Requires DB Write Access)

To complete the soft-limit destructive test, the `monthly_action_limit` needs to be lowered to current usage level (17) and a create call issued. This requires a migration or direct DB access.
