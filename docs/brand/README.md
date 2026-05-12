# RADDO Brand Reference Assets

Canonical visual + voice doctrine sources. Read before any customer-facing build.

## Files

- `RADDO_Image_Design_PDF.pdf` — RAD-18 Phase A · BUDDY deliverable.
  The aesthetic + design bible. Covers:
  1. Identity essence (Watchmaker / Archivist / Surgical Consultant; anti-archetypes)
  2. Voice doctrine + banned phrases
  3. Positioning (vs Notion AI, Copilot, Vertex, ChatGPT Enterprise)
  4. Emotional anchor + register
  5. Typography classification (Fraunces + Inter; tabular numerals; no third family)
  6. Imagery system (6 categories, IMG-W1..W6 reference plates, IMG-1..24 surface plates)
  7. Component grammar (12 components × 7 states: default/hover/focus/active/disabled/loading/error)
  8. Page-level grammar (Hero, How, Pricing, About, Security, Consult)
  9. Anti-patterns (AI orbs, rainbow gradients, glassmorphism, generic stock, etc.)

## Authority order

1. `docs/BRAND_BIBLE.md` (repo canonical bible — if/when present)
2. `docs/brand/RADDO_Image_Design_PDF.pdf` (this Phase A deliverable)
3. `docs/BRAND_QUICK_REFERENCE.md` (at-a-glance)
4. Workspace + project knowledge in Lovable

If any source conflicts with the bible, flag and halt — do not silently override.

## Asset rules

- Use only assets in `public/brand/` for customer-facing imagery.
- Never use AI orbs, robot heads, rainbow gradients, glassmorphism, or generic stock.
- CTAs are brass-only (`#EF9F27` / `#854F0B`). Never blue.
- Two type families only: Fraunces (display) + Inter (body, tabular nums for data).
- Border radii: 4px (small) or 8px (large). No other values.
- Drop shadows ≤ 8px blur.
- Motion curve `cubic-bezier(0.22, 1, 0.36, 1)`; durations 120/220/420/800/1200ms max.

## Customer principle (binding)

Never expose internal mechanics (Brahan, Foundry, BUDDY, TERMINAL, Burnham,
Linear, codex, Claude Code, MCP, doctrine, protocol, dispatch) in customer
surfaces. The customer sees their COB by name. "AI" → "COB read" or
"briefing engine."

Deployment modes (external naming locked): Private · Assisted · Integrated · Dedicated.
Never use T0/T1/T2/T3 externally.
