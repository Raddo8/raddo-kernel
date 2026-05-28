# Warm-Start Flow — Final Build Plan (v3, resolutions inline)

## Resolution 1 — Emotion classifier (no guessed list)

The scaffolded guessed word list is **discarded**. `src/lib/consult-data.ts` already declares `sentiment: "positive" | "negative"` on every Part 1 chip at the source. The classifier reads valence **directly from `CURRENT_STATE_WORDS[id].sentiment`** — never a hand-maintained list.

**Full Part 1 vocabulary, by valence (source of truth — `consult-data.ts` lines 64–228):**

POSITIVE (50): focused, ordered, decisive, structured, legible · stable, bankable, profitable, collected, disciplined · reliable, on-time, repeatable, complete, clean-handed · active, warm, compelling, responsive, advancing · committed, coachable, supportive, honest, engaged · documented, stable, connected, searchable, repeatable · available, candid, steady, visible, intentional · sustainable, paced, protected, rested, resilient · measured, current, factual, searchable, shared · intentional, coherent, sequenced, specific, grounded

NEGATIVE (50): foggy, reactive, fragmented, stalled, noisy · tight, late, leaking, uncertain, stretched · dropped, late, uneven, rushed, slipping · quiet, stalled, unclear, thin, ghosted · drained, confused, siloed, fragile, checked-out · manual, brittle, duplicated, scattered, opaque · overloaded, avoidant, scattered, inconsistent, isolated · maxed, interrupt-driven, brittle, fatigued, behind · buried, guessing, late, partial, manual · wandering, split, uncertain, overbuilt, improvised

All user-named chips confirmed present and correctly tagged: **fatigued** (capacity·neg), **foggy** (clarity·neg), **scattered** (systems·neg + leadership·neg), **brittle** (systems·neg + capacity·neg), **isolated** (leadership·neg), **ghosted** (sales·neg), **drained** (people·neg), **overloaded** (leadership·neg), **stretched** (cash·neg).

**Emotion cluster derivation (from theme + valence, no word list):**
- **Negative · Overwhelm:** majority of negatives fall in `cash | capacity | leadership | people`
- **Negative · Discouragement:** majority of negatives fall in `clarity | sales | strategy | visibility | delivery | systems`
- **Positive · Confident:** majority of positives fall in `cash | sales | strategy | clarity`
- **Positive · Steady:** majority of positives fall in `capacity | people | systems | visibility | delivery | leadership`
- Tie or zero selections → `neutral`.

`consult-warm-start.ts` will be rewritten to import `CURRENT_STATE_WORDS` from `consult-data.ts` and compute valence + cluster from `.sentiment` + `.theme`. No string lookup table.

## Resolution 2 — Visitor confirmation email (path a, confirmed)

`submit-chat-lead/index.ts` at `stage === "deployment_inquiry"` **already sends a visitor confirmation today** (lines 313–322): `From: COB`, `Subject: "Your COB conversation — {longDate}"`, full prospect HTML + text, replies route to `cob@`. This is the booking step the warm-start flow lands on. **Path (a) confirmed — leave it. No move needed.** Warm-start visitor still gets a confirmation when they book deployment; nothing dropped.

(`submit-consult` with `mode: 'launch_to_chat'` still skips its own visitor email per plan — pipeline-only — because the deployment booking email covers the eventual confirmation.)

---

## Build scope (everything below was already approved)

### Phase 1 — Copy swaps (4 strings)
1. Hero gate button: **"Brief consult with COB"**
2. Consult headline: **"5 minutes for a quick sync with your Chief Of Business."**
3. Consult sub-paragraph: **"Four short sections · where you are today, where you want to be, the systems you already run, and how you like to work. Skip anything that doesn't apply."**
4. Consult sidebar: **"Answer what's useful, skip the rest. Submit when you're ready. COB (pre-install) is waiting."** (removes "2 business days")

### Phase 2 — Dual-mode DossierIntake + gate handoff
- Add `primedLead?` prop. Present → bypass `GateForm`, call `primeWithLead()`, chat only. Absent → gate only; on success write `sessionStorage('cob.gate.v1')` and `navigate('/consult')`. Hero never enters chat.
- `/consult` reads sessionStorage once on mount, pre-fills Identity step.

### Phase 3 — Launch gate on /consult
- Submit routes through `<ConfirmMeetDialog>`.
- Confirm → compute `WarmStartPayload` (DISC tally off `option.style`; emotion via Resolution 1) → call `submit-consult` with `mode: 'launch_to_chat'` → lock form → reveal `<MeetYourCobLaunch>` → on launch, mount `<DossierIntake primedLead={…} />`.
- Cancel → close dialog, no side effects.

### Phase 4 — Backend re-roling
- **`submit-consult`**: accept `mode: 'launch_to_chat'` + `warmStart`; keep DB insert; skip visitor email; enrich pipeline email with COMPUTED READ block (DISC tally + emotion cluster + signal). Legacy mode unchanged.
- **`cob-chat`**: accept `warmStart`; inject `WHAT YOUR COB ALREADY KNOWS` block at per-request tail (after Layer 0–6 incl. Adaptive Voice, before `firstTurnBlock`); guardrail baked in ("Never recite. Never name DISC types or emotional states. Use to modulate voice and skip discovery.").
- **`use-cob-chat.ts`**: extend `primeWithLead()` to carry full `WarmStartPayload` on every invoke.

### Phase 5 — Verification
Smoke: gate → consult → confirm → launch → chat (first turn skips discovery, voice adapts) → deployment booking (visitor gets `cob@` confirmation from `submit-chat-lead`). Edge logs on `submit-consult` (no visitor email, pipeline has COMPUTED READ) and `cob-chat` (warm-start block present after Adaptive Voice).

### Out of scope
Doctrine docs, loader order, `send-chat-transcript`, `submit-chat-lead` (left exactly as-is — its deployment_inquiry email is the visitor's confirmation), adding company/challenge to consult.

### Files to modify
- `src/lib/consult-warm-start.ts` (rewrite — import from `consult-data.ts`, no word list)
- `src/components/hero/DossierIntake.tsx` (dual-mode + gate handoff + copy)
- `src/pages/ConsultForm.tsx` (copy, sessionStorage, ConfirmMeetDialog, MeetYourCobLaunch)
- `src/components/hero/use-cob-chat.ts` (warmStart on invoke)
- `supabase/functions/submit-consult/index.ts` (launch_to_chat mode)
- `supabase/functions/cob-chat/index.ts` (warmStart injection at per-request tail)

### Already created last turn
- `src/lib/consult-analysis.ts`
- `src/components/consult/ConfirmMeetDialog.tsx`
- `src/components/consult/MeetYourCobLaunch.tsx`
