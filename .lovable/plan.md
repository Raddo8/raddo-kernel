## Part 1 — Doctrine replacement

Overwrite `supabase/functions/cob-chat/catalog/COB_CONVICTION_FUNNEL_DOCTRINE.md` with the contents of `user-uploads://COB_CONVICTION_FUNNEL_DOCTRINE-2.md`. No catalog/system-prompt assembly changes needed — the slot is already wired.

## Part 2 — Implementation

### 2.1 · Phase-aware trigger logic (replaces current `cobUserTurns >= 12` gate)

In `src/components/hero/use-cob-chat.ts`, add detector state derived from the message stream:

- `phase3PivotFired` · regex over assistant messages for: `want to talk about (what )?deployment`, `here'?s what (changes|happens) when (i'?m|cob is) deployed`, `deployed across your operation`, `at deployment scale`.
- `phase4GateFired` · regex over assistant messages for: `that'?s deployment[- ]scope`, `here'?s the structure i'?d use`, `no\b[^.]{0,40}but i'?ll give you the structure`, or a message that is mostly a 4–6 bullet outline (>=4 lines starting with `- ` / `* ` / `• `) and contains the word "deployment" or "deployed".
- `prospectContinuedEngagement` · at least one visitor message after the turn index where `phase3PivotFired` first became true, with `text.trim().length >= 12`.
- `cobAssistantTurns` · count of `role==="cob"` non-empty messages.

Expose `deploymentFormShouldOpen` computed as:

```
BLOCK_A = phase3PivotFired && prospectContinuedEngagement && phase4GateFired
         && cobAssistantTurns >= 12 && cobAssistantTurns <= 15
BLOCK_B = cobAssistantTurns >= 15   // hard cap
shouldOpen = !deploymentInquirySent && voice === "cob" && (BLOCK_A || BLOCK_B)
```

Also expose `chatLocked = shouldOpen || deploymentInquirySent` so the composer can disable.

### 2.2 · Disarming pre-form message

When `shouldOpen` flips true for the first time, push a synthetic `cob` message (role `cob`, voice `cob`, `synthetic: true` flag) with the five-part disarming copy from doctrine Section 8. Guard with a ref so it appears exactly once per session.

### 2.3 · DossierIntake wiring

In `src/components/hero/DossierIntake.tsx`:

- Replace the current `cobUserTurns >= 12` condition with `deploymentFormShouldOpen` from the hook.
- Keep `DeploymentCtaCard` (already brand-aligned) as the rendered form, fed by `submitDeploymentInquiry`.
- When `chatLocked`, disable the input/textarea and submit button in the composer and show muted helper text: "Chat closed · finish the form below to continue".
- On successful `submitDeploymentInquiry`, navigate (via `useNavigate`) to `/next-step`.

### 2.4 · `/next-step` confirmation page

Create `src/pages/NextStep.tsx` and register it in `src/App.tsx` as `<Route path="/next-step">`. Paper background, Fraunces heading "You're on the list.", Inter body with the locked copy from spec §2.2, brass button "Book a 30-min slot" (href = `VITE_CAL_BOOKING_URL` env, falls back to `https://cal.com/raddo`), text link "Back to home" → `/`. Honors `prefers-reduced-motion`; entrance is a 220ms fade-in-from-below per RADDO motion tokens. No celebration UI.

(`/consult` already serves the long-form diagnostic form — we use `/next-step` to avoid collision, which the spec explicitly permits.)

### 2.5 · Transcript + pipeline emails on submission

Update `supabase/functions/submit-chat-lead/index.ts` so that when `stage === "deployment_inquiry"` AND the insert succeeds, it fires two Resend emails in parallel (best-effort, never blocks the 200):

1. **Prospect transcript** — from `cob@raddo.ai` (fallback to current `FROM_ADDRESS` if `RADDO_FROM_EMAIL` env unset), to the prospect email, subject `Your COB conversation — <Month DD, YYYY>`, body per spec §2.3 with intro note + rendered HTML transcript + signoff + PS. Reply-to `deployment@raddo.ai`.
2. **Pipeline duplicate** — to `pipeline@raddo.ai` (env `RADDO_PIPELINE_EMAIL`, fallback to current internal recipient), subject `New deployment request: <Company> — <Email>`, body per spec §2.4 with timestamp, email, company, situation paragraph, full transcript, conversation ID (= `session_id`), referer.

The client must pass the transcript with the deployment-inquiry POST. Extend `submitDeploymentInquiry` in `use-cob-chat.ts` to include `messages: [{role, voice, text, at}]` (filtered to non-synthetic, non-empty), `lead: {name, email, company, title, challenge}` (gate-known), and `started_at`. The submit handler shares the HTML builder pattern from `send-chat-transcript/index.ts` (extracted into a small helper inside `submit-chat-lead`, or duplicated inline — duplicated inline is simpler and acceptable given scope).

Failures of either email are logged but do not flip the response from `ok: true` — pipeline reliability comes from logs/retry, not from blocking the user.

### 2.6 · max_tokens

Already at 8192 per prior turn — no change. (Verify the constant in `supabase/functions/cob-chat/index.ts` before shipping.)

## Files touched

- `supabase/functions/cob-chat/catalog/COB_CONVICTION_FUNNEL_DOCTRINE.md` (overwrite)
- `supabase/functions/submit-chat-lead/index.ts` (add transcript + pipeline email fan-out on `deployment_inquiry`)
- `src/components/hero/use-cob-chat.ts` (phase detectors, `deploymentFormShouldOpen`, `chatLocked`, synthetic disarming message, transcript payload on submit)
- `src/components/hero/DossierIntake.tsx` (replace trigger condition, lock composer, navigate to `/next-step` on success)
- `src/pages/NextStep.tsx` (new)
- `src/App.tsx` (register `/next-step` route)

## Open items / assumptions

- Production email addresses (`cob@raddo.ai`, `pipeline@raddo.ai`, `deployment@raddo.ai`) are not yet verified in Resend. I'll wire them via env vars (`RADDO_FROM_EMAIL`, `RADDO_PIPELINE_EMAIL`, `RADDO_REPLY_TO`) with the current `onboarding@resend.dev` + `cob.brahan@gmail.com` as safe fallbacks so staging keeps working.
- Calendar URL via `VITE_CAL_BOOKING_URL` (fallback `https://cal.com/raddo`).
- Existing `/consult` page (long-form diagnostic) is left untouched; new confirmation lives at `/next-step`.
- Phase detectors are regex-based heuristics; they are conservative by design (Block B hard-cap at turn 15 guarantees the form fires even if detectors miss).
