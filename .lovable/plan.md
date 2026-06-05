
## What to build

A new `/debrief` page that looks and feels exactly like `/consult`, but ends in a "request more information" review-and-submit flow instead of launching into a COB chat. Lead-notification emails still fire on submit. Dossier's closing CTA is rewired to point at it.

## Pages and routes

1. **New page `src/pages/Debrief.tsx`** — thin wrapper, mirrors `Consult.tsx`.
2. **New page `src/pages/DebriefForm.tsx`** — copy of `ConsultForm.tsx` with these changes:
   - Headline: "5 minutes to request more information about your Chief of Business." (replaces the "quick sync" line)
   - Subhead and sidebar copy reworded toward "tell us about your business so we can prepare a tailored follow-up" (no "COB is waiting").
   - Overline: `CONSULT · 001` → `DEBRIEF · 001 · INFORMATION REQUEST`.
   - Submit button label: "Request information" (was "Submit consult").
   - Replace `ConfirmMeetDialog` with a new lightweight **review dialog** (`ConfirmDebriefDialog`) that lists what the user entered (name, email, phone, occupation, challenge, counts of selections) and asks them to confirm the information is correct before final submit.
   - Drop the `launched / MeetYourCobLaunch / chatOpen / DossierIntake` branch entirely. On successful submit, `navigate("/debrief/thank-you")`.
   - Invoke `submit-consult` with `mode: "request_info"` (warmStart omitted). Email notification path in the edge function continues to fire because it runs before the mode branch.
3. **New page `src/pages/DebriefThankYou.tsx`** — branded confirmation, "We will be in touch." Includes Back-to-home link at the top and a brass CTA at the bottom linking to `/`. SEO: `noindex,follow`.
4. **Router (`src/App.tsx`)**: add `<Route path="/debrief" element={<Debrief />} />` and `<Route path="/debrief/thank-you" element={<DebriefThankYou />} />` next to the existing `/consult` routes.

## Dossier CTA

In `src/pages/Dossier.tsx` (closing page, ~line 497):
- Change link text "Request your COB" → **"Request more information about COB"**.
- Change `href` from `/consult` to `/debrief`.

## Edge function

No schema changes. `submit-consult` is reused as-is; we just pass `mode: "request_info"` and skip the warm-start payload. The lead-notification email continues to send. If you'd like, I can also add a small subject-line tweak in the edge function so debrief leads show up distinctly in inbox — confirm and I'll include it.

## Out of scope

- No new tables, no auth changes, no new edge functions.
- No styling system changes — same Panel/Overline/Chip components, same brass/ink/paper palette.
- Consult page untouched.
