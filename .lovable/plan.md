## Replace dossier panels with new 8-card doctrine

**File:** `src/components/IntroducingCob.tsx`

Replace the `PANELS` array with the 8 new entries using the labels, slugs, and full scenario copy provided (em dashes → middot `·` per no-dash rule):

| # | Label | Slug | Tone |
|---|---|---|---|
| 01 | BUILT FOR YOU | `built-for-you` | lamp |
| 02 | PERSONALITY | `personality` | dawn |
| 03 | ALIGNMENT | `alignment` | dusk |
| 04 | STRATEGY | `strategy` | atrium |
| 05 | TRUTH | `truth` | lamp |
| 06 | LOYALTY | `loyalty` | dusk |
| 07 | ANTICIPATION | `anticipation` | dawn |
| 08 | COMPOUNDING | `compounding` | atrium |

**Supporting changes:**
- `src/lib/panel-telemetry.ts` — widen `HeroArchetype` to include the 8 new slugs so telemetry + types stay clean.
- `PlaceholderFigure` image map — drop the old slug keys (professional/executive/owner/enterprise). All 8 panels fall through to the tone-block placeholder with their `imageAlt` caption until you supply the new visuals.
- `imageAlt` set to short placeholder strings ("Dossier 01 · Built for you · figure pending") — to be replaced when you drop in the new images next turn.

**Out of scope:** Hero, new image wiring, tab/folder layout, carousel behavior, CTA. Only copy + types change.
