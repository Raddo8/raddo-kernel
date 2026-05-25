## Diagnosis

The COB chat is rendering message text as raw strings inside `<p>` / `<div>` with `white-space: pre-wrap`. There is no markdown parser anywhere in the chat surface. The model is correctly emitting doctrine-shaped `**bold**`, `·` bullets, and em-dash asides, but the UI shows the literal `**` characters around words.

This is a UI bug, not a voice/doctrine issue. The voice profile and source documents stay untouched.

**File:** `src/components/hero/DossierIntake.tsx`
- Line ~1034: assistant message body renders `{entry.text}` as raw text
- Line ~1081: user message body renders `{entry.text}` as raw text (no markdown emitted here, but keep consistent)

## Plan

### 1. Add a minimal, scoped markdown renderer for COB messages

Install `react-markdown` (and nothing else — no remark-gfm, no rehype-raw, no syntax-highlighter). Doctrine-shaped output only needs: `**bold**`, `*italic*`, paragraphs, soft line breaks, and the occasional list. `react-markdown` core handles all of that. No HTML passthrough, no tables, no code highlighting — keeps the attack surface and visual surface clean.

### 2. Build a small `CobMarkdown` component co-located in DossierIntake

A tiny wrapper that:
- Passes `entry.text` through `react-markdown`
- Maps `p`, `strong`, `em`, `ul`, `ol`, `li` to elements that inherit the surrounding Fraunces/Inter typography already set on the message container
- Strips the default browser margins on `p` so streaming text doesn't reflow into block paragraphs (use `margin: 0` on `p`, with a small `marginTop` on every `p` after the first to preserve paragraph breaks the model emits)
- `strong` uses `fontWeight: 700` (Fraunces 600 base → 700 bold reads as proper emphasis without becoming heavy)
- Leaves `whiteSpace: "pre-wrap"` off (markdown handles line breaks); single `\n` in source becomes a soft break, double `\n` becomes a paragraph

### 3. Wire it into the COB message branch only

- Line 1034 (assistant `<p>`): replace `{entry.text}` with `<CobMarkdown text={entry.text} />` and change the wrapping `<p>` to a `<div>` (can't nest block markdown inside `<p>`). Keep all existing inline styles on the wrapper.
- Line 1081 (user message): leave as raw `{entry.text}` — users don't type markdown and we don't want their literal `**` interpreted.

### 4. Streaming behavior

`react-markdown` re-parses on every render, which is fine at the token rates we stream (Lovable AI gateway chunks are small and infrequent enough). No memoization needed; the message list is short.

### 5. Verify, then re-evaluate density

After this ships:
1. Send a fresh COB message and confirm `**bold**` renders as visual bold (not literal asterisks).
2. Confirm `·` bullets, em-dashes, and confidence numerics still render cleanly.
3. Confirm user messages still show their text literally (no markdown interpretation).
4. Confirm streaming doesn't flicker or double-render.

**Then** judge whether bold density still reads as too much. If it does, the next step is a voice-profile calibration line (e.g. "Use bold sparingly — for the recommendation verb and the confidence numeric only") added to `COB_VOICE_DIGEST.md` and mirrored in the `cob-chat/index.ts` preamble. We do not touch the doctrine source files (`COB_CAPABILITIES_REFERENCE.md`, etc.) under any branch of this plan.

## Files changed

- `package.json` — add `react-markdown` dependency
- `src/components/hero/DossierIntake.tsx` — add `CobMarkdown` component, swap assistant render path, change wrapping `<p>` to `<div>`

## What is explicitly NOT changing

- No edits to any file under `docs/cob/` or `supabase/functions/cob-chat/catalog/`
- No edits to `supabase/functions/cob-chat/index.ts` system prompt
- No edits to `COB_VOICE_DIGEST.md` (yet — only if post-render review confirms density is still wrong)