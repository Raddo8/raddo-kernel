
# Hero Dossier Intake — Confidential Chat Surface

A premium, single-purpose chat surface that lives on the Hero page directly under the headline + image, framed as a **confidential intake dossier** (not a "chatbot"). Built now as an aesthetic + interaction shell. The actual question protocol you're writing drops in later as a single typed script — no rebuild required.

## Placement

`src/components/Hero.tsx`, inserted between the headline block (closes line 985) and `BriefingComposition` (line 988). Sits in the same 1180px column, full-width within it.

```text
[ image + headline grid ]
       ↓
[ DOSSIER INTAKE — new chat surface ]   ← this build
       ↓
[ BriefingComposition ]
[ brass hairline ]
[ CTA row ]
```

Stagger: appears at ~2400ms reveal (between headline 900ms cascade and Briefing 2600ms) so the page settles in order: headline → intake invitation → briefing exhibit → CTA.

## Aesthetic — "The Intake Dossier"

Reads as a sealed manila folder / boardroom intake form, not a messaging app. References: classified dossier cover, private bank intake card, watchmaker's service ticket.

Frame
- Cream paper surface (`raddo-paper`), 1px `raddo-paper-edge` border, 8px radius
- Four brass corner brackets (matches the hero image frame at lines 951–954) — visual rhyme
- Top-left eyebrow: monospace-feeling Inter caps, brass-deep — `INTAKE · CONFIDENTIAL · SESSION 001`
- Top-right: tabular-num timestamp (Inter tnum), e.g. `26.05.21 · 14:32 UTC` — generated client-side
- Bottom-right fleuron `❦` in brass at 40% opacity
- Faint paper grain (inline SVG `feTurbulence`, multiply 6%) — same technique cited in plan.md

Header strip (inside frame, above transcript)
- Fraunces 22/28, ink-deep: *"What's the one thing keeping you up at night?"* (placeholder; replaced when your protocol arrives)
- Inter 13, ash, single line: *"Answer in your own words. Nothing leaves this page. No account required."*
- 1px brass hairline divider, 64px wide, left-aligned

Transcript area
- Left rail "asked by COB" turns: ink-deep Fraunces 18, no bubble, just a brass `▍` left tick and a hairline rule above
- Right rail "your reply" turns: paper-edge card, ink charcoal Inter 15, 4px radius, max-width 78%, right-aligned, subtle 4px shadow (≤8px per doctrine)
- Each turn timestamped in tnum ash 11 underneath
- Typing indicator on COB turns: three brass dots, 220ms stagger fade — no looping spinner

Composer
- Single-line growing textarea, Inter 16, ink-deep
- Placeholder: *"Type your answer · Enter to send · Shift+Enter for a new line"*
- Brass send chevron `→` (icon-only button, ARIA labelled)
- Below composer, ash 11: *"Encrypted in transit · stored only with your consent · withdraw anytime."*
- Character counter appears only past 280 chars, tnum

Empty / opening state
- Before user engages, transcript shows a single sealed-envelope mark and one Fraunces line: *"Open the dossier"* — clicking anywhere on the surface "unseals" it (220ms brass wax-seal fade, paper crease line draws across with `scaleX`), revealing the first COB question.

States (all 7 per doctrine)
- default · hover (composer border darkens to ink-soft) · focus (2px brass focus ring) · active (send button compresses 1px) · disabled (paper-edge 40%, no copy change) · loading (three brass dots) · error (single inline ink line, no red; brass underline on field)

Motion (brand curve `cubic-bezier(0.22, 1, 0.36, 1)`)
- Surface entrance: rise 16px + fade, 800ms at 2400ms delay
- Each new transcript turn: rise 8px + fade, 220ms
- Wax-seal unseal: 420ms
- `prefers-reduced-motion`: snap to final state, no seal animation, instant turn appearance

## Architecture

New files
- `src/components/hero/DossierIntake.tsx` — the surface (default-exported component, no props)
- `src/components/hero/intake-protocol.ts` — the conversation script (typed, single export). Stubbed with 2 placeholder turns now; you paste your real protocol in here later — no other file changes needed.

Edited
- `src/components/Hero.tsx` — one import, one `<DossierIntake />` insert after line 985, wrapped in the same `motion.section` rise pattern used by `BriefingComposition`.

### Protocol shape (so your script slots in cleanly)

```ts
// src/components/hero/intake-protocol.ts
export type IntakeTurn =
  | { kind: "ask"; id: string; prompt: string; hint?: string }
  | { kind: "branch"; id: string; on: (reply: string) => string /* next id */ }
  | { kind: "close"; id: string; message: string; cta?: { label: string; href: string } };

export const INTAKE_PROTOCOL: IntakeTurn[] = [
  { kind: "ask", id: "q1", prompt: "What's the one thing keeping you up at night?" },
  { kind: "ask", id: "q2", prompt: "And what's taking up most of your day?" },
  // ← your real protocol drops in here
];
```

The component reads this array sequentially, advancing on each user submit. Branching is supported (your `on(reply)` returns the next turn id) so when your protocol arrives, decision trees work without refactor.

### Local state only (no backend in this build)

- Transcript held in `useState<IntakeTurn[]>` — ephemeral, page-local
- No Supabase write in this phase (per backend phasing doctrine — Phase 1, no customer data). When you're ready to capture answers, we add a single `submit-intake` edge function and a `dossier_intakes` table behind it. Out of scope for this build.

### Voice + doctrine compliance

- No banned phrases. No "AI," no "assistant," no "magic."
- COB never called "chatbot." Header reads *"Your COB is listening."* (or your replacement copy.)
- Source-integrity tone preserved: confirmation lines like *"Recorded. Continue when ready."*
- Brass used only for: eyebrow, hairlines, corner brackets, send chevron, focus ring, fleuron. Never on body copy.
- Border radii: 4px (composer, reply cards) / 8px (outer frame). Shadows ≤ 8px.
- Two type families only (Fraunces · Inter, tnum for timestamps).

### Accessibility

- `<section aria-labelledby="dossier-intake-heading">` with real `<h2>` (visually styled as the header line)
- Transcript is a live region: `role="log" aria-live="polite" aria-relevant="additions"`
- Composer is a real `<form>` with `<label className="sr-only">` for the textarea
- Send button has explicit `aria-label="Send your answer"`
- Full keyboard flow: Tab into composer → type → Enter to send → focus returns to composer
- Honors `prefers-reduced-motion` (snap to final, no seal)

### Responsive

- Desktop ≥ 768px: 1180px column, transcript and composer share full width
- Mobile < 768px: 88% width, reply cards max-width 92%, header stacks (eyebrow → timestamp on second row), composer chevron stays inline
- Min surface height: 420px so the empty state doesn't feel thin; grows with transcript

## Out of scope (this build)

- Backend persistence of answers (Phase 2 work)
- Real-time streaming COB replies (current build advances script turn-by-turn)
- Telemetry / Plausible events (add when intake goes live)
- Multi-session resume — each page load is a fresh intake

## Acceptance check (post-build, manual)

1. Surface appears under headline, above BriefingComposition, in the same 1180px column
2. Sealed empty state renders; clicking anywhere unseals with brass wax fade (420ms)
3. First COB prompt appears, composer focuses
4. Typing + Enter posts a right-rail reply card, next COB prompt fades in after 600ms
5. Shift+Enter inserts newline, doesn't send
6. `prefers-reduced-motion: reduce` → no seal animation, turns snap in
7. Tab order: send button reachable; Enter on focused send works
8. Mobile (375px): surface at 88% width, no overflow, composer chevron stays right-aligned
9. Replacing `INTAKE_PROTOCOL` with a longer array requires zero other edits
10. No banned phrase, no blue CTA, no extra type family, no shadow > 8px

When you send your protocol, I paste it into `intake-protocol.ts` and we're live.
