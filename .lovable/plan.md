# /consult redesign · Hero dossier aesthetic

Bring the consult page into the same visual language as the Hero: cream paper surfaces, brass corner registration marks, JetBrains Mono overlines, Fraunces display headlines, ink-blue accents, brass-only CTAs. Strip every DISC reference and the negative/positive color split.

## Scope (frontend only)

Edit: `src/pages/ConsultForm.tsx`, `src/pages/Consult.tsx`.
No backend, no data-model, no edge-function changes. Server still receives the same payload shape (`discResponses` stays as the wire field name internally; user never sees it).

## Visual system changes

**Hero (top band)**
- Replace dark `bg-raddo-night` band with light cream (`bg-raddo-paper`) panel + brass corner marks (port `CornerMark` pattern from Hero).
- Mono overline `CONSULT · 001` in `raddo-ash`, brass dot separator.
- Fraunces display headline in `raddo-ink-deep`, Inter subhead in `raddo-charcoal`.
- "Back home" becomes a small mono-cased text link in `raddo-ink`, not a pill.

**Form sections**
- Section panels: `bg-raddo-paper` (not white), 1px `raddo-paper-edge` border, 8px radius (Hero standard, not 32px).
- Add brass `CornerMark` to each section panel.
- Section overline: mono `PART I · CURRENT STATE` style (roman numerals to match Hero INDEX), brass dot.
- Headline: Fraunces, smaller scale than hero.

**Word chips (Parts 1 & 2)**
- Remove negative/positive sentiment color logic entirely — every chip uses identical styling regardless of word.sentiment.
- Unselected: `bg-raddo-paper` (or white), `border-raddo-paper-edge`, text `raddo-charcoal`.
- Selected: `bg-raddo-ink-deep`, text `raddo-paper`, brass-tinted border.
- Hover: border shifts to `raddo-ink-soft`.
- No brown (`raddo-brass-deep` removed from chip palette).

**App footprint cards**
- Same chip treatment, same single color family.
- Category card border + radius normalized to 8px.

**"DISC" section → "Part 4 · How you operate"**
- Remove every literal "DISC" string from the UI (overline, headings, helper text, sidebar label).
- Section overline: `PART IV · OPERATING STYLE`.
- Headline: "Mark every option that fits how you naturally work."
- Helper text: "Select as many as feel true on each row. There is no wrong count."
- Remove the "Allow two selections per row" checkbox entirely.
- Behavior: every row is free multi-select (unlimited). `discAllowMultiSelect` becomes always-true internally; cap of 2 is removed.
- Option button removes the `DISC_STYLE_LABELS[option.style]` overline (that was the D/I/S/C tag) — show only `option.label`.
- Row label: "Row 01" stays (neutral); prompt unchanged.
- The running tally on submit still happens server-side via the same payload — no UI exposure.

**Left sidebar**
- Remove all per-part selection counts ("3 selected", "5 tagged", "12/15 answered").
- Remove the "Theme spread" panel entirely.
- Keep: mono overline ("FIVE-MINUTE CONSULT"), a single short editorial paragraph, the submit CTA, and the error toast slot.
- Submit CTA restyled to brass: `bg-raddo-brass`, text `raddo-ink-deep`, hover `bg-raddo-brass` with subtle shadow. Matches hero "Begin the consult".

**Inline section counters**
- Remove the `{n} selected` / `{n} tagged` counters in the section headers too. The user sees their selections directly; no scoreboard.

## Color discipline

- Only tokens used: `raddo-paper`, `raddo-paper-edge`, `raddo-ink`, `raddo-ink-deep`, `raddo-ink-soft`, `raddo-charcoal`, `raddo-ash`, `raddo-brass`, white.
- `raddo-brass-deep` (the brown) is eliminated from this page.
- CTA is brass-only (doctrine).
- Selected state uses ink, not brass (brass reserved for accents, corner marks, CTA).

## Motion

- Section panels fade+rise on mount with 80ms stagger, EASE_OUT curve, 420ms duration (matches Hero dossier reveal). Honor `prefers-reduced-motion`.
- Chip selection: 120ms color transition only.

## Files touched

- `src/pages/ConsultForm.tsx` — full rewrite of presentation; preserves state shape, submit payload, and validation. Extracts a local `CornerMark` (or imports a shared one if extracted).
- `src/pages/Consult.tsx` — no change beyond title.

## Non-goals

- No change to `consult-data.ts` (DISC data structure stays; only its presentation is renamed).
- No change to `submit-consult` edge function.
- No change to scoring/analysis logic.
- Thank-you page untouched (separate pass if needed).
