## Goal
Open up the rhythm of the hero headline so each of the three lines reads as its own beat instead of one tight block.

## Change
File: `src/components/Hero.tsx` (lines 852–866)

Add top margin to the second and third headline spans. Keep the `block` display, motion variants, italic/brass styling, and font sizing untouched.

- Line 1 — "Built for you day one." → unchanged
- Line 2 — "Sharpens with / every action." → add `mt-6 md:mt-8` (≈24–32px gap above)
- Line 3 — "Yours to wield anywhere." → add `mt-6 md:mt-8` (≈24–32px gap above)

That yields a measured, editorial cadence at all viewports without altering line-height inside each phrase or the overall hero geometry below.

## Out of scope
- No copy changes
- No color, font, or weight changes
- No layout/grid changes to the Briefing · Exhibit composition below
