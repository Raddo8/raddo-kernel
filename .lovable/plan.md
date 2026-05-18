## Goal

Replace the static `/setup.html` mailto-form with a proper `/consult` route in the Vite runtime, backed by a Supabase edge function + table + Resend notification. Preserve v1.0 form fidelity (same 100 current-state words, 100 aspiration words, 10-category app inventory, 15-row DISC). Wire the hero "Begin the consult" CTA to it.

## Files to create

- `src/pages/Consult.tsx` — page shell (intro + mounts the form). Light-dominant cream/paper, Fraunces headline, Inter body, brand triple overline.
- `src/pages/ConsultForm.tsx` — the four-part form, ported from PR #3 `app/consult/consult-form.tsx` (React, drop the Next "use client" pragma, swap `fetch('/api/consult')` for `supabase.functions.invoke('submit-consult', ...)`).
- `src/pages/ConsultThankYou.tsx` — editorial confirmation page, footer link home.
- `src/lib/consult-data.ts` — the locked v1.0 word lists, app inventory categories, DISC matrix. Ported verbatim from PR #3.
- `src/lib/consult-scoring.ts` — DISC scoring + theme gap analysis + persona name candidates. Ported from PR #3 server route.
- `supabase/functions/submit-consult/index.ts` — validates payload (zod), recomputes scoring server-side (never trust client), inserts row with service role, sends Resend notification to `cob.brahan@gmail.com`. CORS headers, rate-limited via existing `_shared/rate-limit.ts` (10/min/IP).

## Files to edit

- `src/App.tsx` — add public routes `/consult`, `/consult/thank-you` (outside AuthGate, same pattern as `/`).
- `src/components/Hero.tsx` lines 487 and 902 — wrap the two "Begin the consult" / "Begin your 5-minute consult" buttons in `<Link to="/consult">` (or `onClick={() => navigate('/consult')}` matching surrounding pattern).
- `public/setup.html` — replace body with a minimal HTML redirect (`<meta http-equiv="refresh" content="0;url=/consult">` + JS `location.replace`), keeps the legacy URL alive.

## Backend (Supabase)

Migration (single):
- Table `public.consult_submissions`
  - `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`
  - `email text not null`, `name text`
  - `current_state_words jsonb not null`, `aspiration_state_words jsonb not null`
  - `theme_gap_analysis jsonb not null`
  - `app_inventory jsonb not null`, `other_apps_text text`
  - `disc_responses jsonb not null`, `disc_scores jsonb not null`
  - `primary_style text`, `secondary_style text`, `is_hybrid boolean`
  - `persona_name_candidates text[]`
  - `user_agent text`, `ip_hash text` (defence audit fields)
- RLS enabled. Policies:
  - Deny SELECT/UPDATE/DELETE for anon + authenticated (service role bypasses RLS).
  - Allow INSERT for anon — but real path is edge function using service role, so we can also keep insert closed and rely on edge function. **Chosen:** keep all writes closed to anon, edge function performs insert with service role. Safer and matches existing `message_events` / `usage_events` defensive pattern in this project.

Edge function `submit-consult` (`verify_jwt = false` in `supabase/config.toml`):
- POST only, CORS preflight, IP rate limit 10/60s via `checkRateLimitDb`.
- Zod-validate payload shape.
- Recompute `theme_gap_analysis`, `disc_scores`, `primary_style`, `secondary_style`, `is_hybrid`, `persona_name_candidates` server-side from raw inputs (do not trust client computations — client only sends `current_state_words[]`, `aspiration_state_words[]`, `app_inventory{}`, `other_apps_text`, `disc_responses[]`, `email`, `name`).
- Insert row.
- Send Resend email to `cob.brahan@gmail.com` via existing `RESEND_API_KEY` secret, from a verified Raddo sender (use existing project from-address pattern; if no verified Raddo domain yet, fall back to `onboarding@resend.dev` and flag in summary).
- Return `{ ok: true, id }` or 4xx/5xx with safe error.

## Hero CTA wiring

The two consult CTAs in `src/components/Hero.tsx` (lines 487, 902) currently render as buttons with no nav. Convert to `<Link>` from `react-router-dom` preserving exact classes/visuals — no style drift.

## Brand / doctrine compliance

- Light-dominant cream/paper surfaces on `/consult` and `/consult/thank-you`. Brass only for the submit CTA.
- Voice: "Submit your consult.", "Expect a response within 2 business days." — no "AI", no "magic", no time-saving claims.
- Motion: 220ms fade-in on form mount; skeleton (not spinner) during submit; honour `prefers-reduced-motion`.
- No tier language, no internal mechanics surfaced.

## What's reused from PR #3 vs new

- **Reused verbatim:** word lists, app inventory taxonomy, DISC matrix, scoring algorithm, theme gap analysis, persona name candidate generator.
- **New authorship:** Vite/React Router page shells, Supabase client `functions.invoke` wiring, edge function (PR #3 uses a Next.js route handler — port the inner logic, replace the request/response shell), migration + RLS, Resend send block, redirect shim for `setup.html`, hero CTA wiring.

## Acceptance check (post-build)

- Visit `/consult` → form renders, words shuffled per load.
- Submit → row in `consult_submissions`, Resend email at `cob.brahan@gmail.com` within 60s, redirect to `/consult/thank-you`.
- Visit `/setup.html` → lands on `/consult`.
- Hero "Begin the consult" → `/consult`.
- `md5sum` of `public/setup.html` will change (it becomes a redirect shim) — v1.0 fidelity is preserved inside the new React form, not the static file.

## Open question before I build

The brief says "Source of truth lives at raddo.lovable.app/setup.html (md5 1491132741cc012c1e41a1f0b0ba24a1)" and the local `public/setup.html` matches that md5 exactly — so I'll port the form content from the local copy. Confirm: should the new React `/consult` page also keep the **prose intro copy** from `setup.html` (the framing paragraphs above each part), or rewrite intros in the tightened editorial voice we just shipped to the hero? Default if no answer: keep v1.0 intros verbatim — fidelity wins.
