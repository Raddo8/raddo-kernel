
## First-principles read

**Phase 1 · Assumption autopsy**
- That the image and the dossier are two separate problems. They are one composition.
- That "what does the dropdown do?" needs a new action. The dropdown already does the right thing (reveals the doctrine). The miss is that it dead-ends in italics instead of a decision.
- That the empty space under the image is a layout bug. It is a brief — the image is asking to be captioned and indexed, like every other exhibit in the hero.
- That a dark image violates the light-dominant hero rule. It does — *unless* it is treated as a framed exhibit (paper mat + brass corners) sitting on the cream surface. Then the darkness is contained, not ambient. That is the move museums use, and the move the brand bible's "vintage banking plate" language already implies.
- That two columns mean two equal blocks. They do not. The vault is the still object; the dossier is the live one that grows.

**Phase 2 · Irreducible truths**
1. The vault image *is* the six-source mandala rendered literally — vault door (the COB), six pedestals (email, docs, calendar, people, chat, financials), one plaque in the center (the briefing).
2. The dossier's job is to answer "what is COB?" The image's job is to show it. They belong adjacent.
3. The collapsed dossier has a fixed height. The expanded dossier is ~3× taller. A static image cannot match both.
4. Every artifact on this hero is labelled, sourced, and corner-marked. An unlabelled image breaks the grammar.
5. The expanded dossier currently ends on a rhetorical question with no next step. The hero's job is to land the user on the brass CTA.

**Phase 3 · The Aristotelian move**
Treat the vault not as decoration but as **Exhibit · 002** — a sibling artifact to Briefing · 001. Give it the same paper frame, brass corners, mono meta strip, and a numbered legend that maps the six pedestals to the six sources. The dropdown's "action" is no longer hidden inside the dossier — it surfaces in the exhibit column as a brass CTA the moment the dossier opens. One gesture resolves three problems: pairing, dropdown destination, and zero empty space.

---

## Build plan

### 1 · Asset
Copy `user-uploads://Vault-2.png` → `src/assets/raddo-vault-exhibit.png`. Import in `Hero.tsx`.

### 2 · New component: `VaultExhibit` (in `src/components/Hero.tsx`)
Same chassis as `BriefingDossier`:
- `bg-raddo-paper`, `border 1px raddo-paper-edge`, `radius 8`, four `<CornerMark>` corners, identical shadow tokens.
- Top meta strip (mono, 10px, 0.18em tracking): `EXHIBIT · 002`  ·  `THE SIX-SOURCE VAULT`.
- Image sits on a cream mat with ~16px inset, so the dark navy is contained by paper on all four sides (preserves light-dominant rule).
- Caption block under the image (always visible): small-caps brass overline "What you are seeing", one Inter sentence: *"Six sources resolve into one briefing. The vault is the operation. The plaque is the morning brief."*

### 3 · Resolve the "empty space" + "dropdown action" together
The exhibit column has a second slot below the caption that is conditionally rendered based on the dossier's `open` state. Lift `open` from `BriefingDossier` into the parent so both components share it (or use a small context).

- **When dossier is CLOSED** → exhibit column shows the **Exhibit Key**: a numbered 1–6 mono legend tying each pedestal in the image to a real source (Email · Documents · Calendar · People · Business chat · Financials). Tight type, brass numerals, paper-edge dividers. Fills the column to roughly match the closed dossier height. No empty space.
- **When dossier is OPEN** → the legend stays, and below it the **Decision panel** reveals (same 420ms expand as the dossier body): brass CTA "See your first brief →" (mirrors the hero's primary CTA, which is the canonical brand-bible CTA), plus a single ghost link "Read the Capability Brief". This is the dropdown's *action* — the doctrine ends in a decision, not a sentence. The two columns expand in lockstep, so the bottom edges stay aligned.

### 4 · Layout
Wrap the existing `<motion.section>` at line 662 in a 2-column CSS grid:
- Desktop (`md:`): `grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6`, dossier left, exhibit right. Raise `maxWidth` from 720px → 1100px on this wrapper.
- Mobile: single column, dossier first, exhibit second (image below the dossier, naturally).

### 5 · Doctrine guardrails honored
- **Light-dominant**: vault sits on a cream mat inside a paper frame · the surrounding hero stays paper.
- **Brass-only CTAs**: the new "See your first brief" uses `raddo-brass` per the locked palette.
- **Source integrity**: every pedestal in the image is named to a real source class, no fabricated labels.
- **Motion**: same `cubic-bezier(0.22,1,0.36,1)` curve, 420ms expand, honors `useReducedMotion`.
- **No banned phrases**, no AI orbs, no new colors, 8px radius, ≤8px shadow blur.
- **Customer principle**: image is captioned in customer language (sources, briefing) — no internal mechanics.

### 6 · Files touched
- `src/assets/raddo-vault-exhibit.png` (new)
- `src/components/Hero.tsx` (lift `open` state, add `VaultExhibit`, wrap section in 2-col grid)

No backend, no new routes, no token changes.

---

## What the dropdown does now

Before: expand reveals doctrine → ends on italic question → user has to scroll to find a CTA.
After: expand reveals doctrine → simultaneously surfaces the brass "See your first brief →" CTA in the exhibit column, anchored to the visible vault image. The doctrine and the decision land in the same eye-line.
