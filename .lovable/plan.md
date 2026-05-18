# Cinematic briefing reveal · opened dossier

When the dossier opens, the body paragraphs and the closing italic couplet animate in like a classified brief being transmitted — characters streaming onto paper, ~4.5 seconds total, then stillness.

## Effect

- **Style:** monospace cursor·tail, paper·cream text, no sound. Subtle blinking caret rides the leading edge, vanishes when the line completes. Brass rules above and below the body wipe in left·to·right at the start (220ms each, staggered).
- **Pacing:** ~4.5s total budget across all six paragraphs + italic couplet. Variable speed — opens fast (≈45 chars/sec), gentle deceleration on the italic close (≈25 chars/sec) so the last two lines land with weight.
- **Sequencing:** paragraphs reveal sequentially, not in parallel. A 120ms beat between paragraphs (the carriage·return pause). Bold spans (intelligence, strategy, competence · portable · permanent) ink in slightly heavier as their characters land.
- **Re·trigger:** runs every time the dossier transitions from closed → open. Closing and reopening replays it. Subsequent re·opens within the same session use a faster 2.5s budget so it doesn't feel repetitive.
- **Reduced motion:** honors `prefers-reduced-motion`. Snaps to final state, no streaming, no caret. (Already wired via `useReducedMotion` in Hero.tsx.)
- **Performance:** single rAF loop driving a character·index per paragraph. No per·character DOM nodes — uses `<span>` with sliced text content updated in place. Cursor is one absolutely·positioned element that follows the active paragraph.

## Where it applies

- The six body paragraphs inside the expanded dossier (lines ~308–347 of `src/components/Hero.tsx`).
- The two italic Fraunces lines that close the brief.
- The Vault exhibit panel on the right stays as·is — no typing there. It's a visual exhibit, not a transmission.

## Technical notes

- New small component `BriefingTypewriter` co·located in `Hero.tsx` (keeps the dossier self·contained).
- Accepts an array of `{ text, html?, weight?, italic?, fontFamily? }` segments and a `play` boolean keyed to the dossier's `open` state.
- Uses `framer-motion`'s `useReducedMotion` + a `useEffect` driving a `requestAnimationFrame` loop. No new dependencies.
- Bold spans handled via a lightweight token format (split text into runs with optional `bold: true`) so the existing `<strong>` styling survives.
- Caret is a 2px brass·deep vertical bar with a 600ms blink only while idle between paragraphs; hidden once the whole brief completes.

## What stays unchanged

- The accordion height animation on open (still 420ms ease·out).
- The brass dividers' positions and the italic closing couplet copy.
- The closed·state envelope plate, header grid (Subject / Format / Read / Status), and Vault exhibit.

## Acceptance

- Open dossier → six paragraphs and italic close stream in, finishing in ~4.5s on first open.
- Reopen within session → ~2.5s replay.
- Reduced·motion users → instant final state, no caret.
- No layout shift while typing (container reserves full height immediately).
