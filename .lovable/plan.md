
# Speed up the COB sandbox chat

Goal: cut perceived response latency from ~10–20 s to first token in ~1–2 s, full reply in ~3–5 s, without changing voice, doctrine, or behavior.

Three coordinated changes to `supabase/functions/cob-chat/index.ts` + the client hook + a one-time content pass on the catalog docs.

---

## A · Switch model to `google/gemini-2.5-flash`

- Change `MODEL` constant from `google/gemini-2.5-pro` → `google/gemini-2.5-flash`.
- Keep `temperature: 0.7`.
- The 2–3 sentence brevity binding is already in place, so Flash is more than capable for both COB and Michael registers.
- Pro stays available as a one-line flip if a future "deep mode" is added.

## B · Slim the system prompt (the biggest win)

Today every turn ships ~180–250 KB of markdown to Gemini. We replace the always-on full-doc dumps with compact operational digests, and only pull full-doc snippets when relevant.

### B.1 · Create digest files (one-time content authoring)

Add seven new short files under `supabase/functions/cob-chat/catalog/digests/`, each ≤ 2 KB, distilled from the corresponding full doc:

- `DOCTRINE_DIGEST.md` — the 6–8 doctrine lines that actually steer replies
- `OBJECTIONS_DIGEST.md` — the 8–10 highest-frequency objection patterns + the one-line reframe each
- `VOICE_INTEGRATION_DIGEST.md` — the assembly-order rules + escalation triggers
- `WEB_SPEC_DIGEST.md` — when to call `research_web` (the trigger list already in the tool description, condensed)
- `COB_VOICE_DIGEST.md` — fingerprint, banned phrases, signature patterns (5 bullets)
- `MICHAEL_VOICE_DIGEST.md` — fingerprint, deflection rule, never-cross lines
- `SAMPLE_OPENERS_DIGEST.md` — the opener intent paragraph only

Full files stay on disk for future RAG lookup but are no longer injected by default.

### B.2 · Rewrite `buildSystemPrompt`

- Always-on: HARD_PREAMBLE + DOCTRINE_DIGEST + OBJECTIONS_DIGEST + VOICE_INTEGRATION_DIGEST + SAMPLE_OPENERS_DIGEST + active voice digest (COB or Michael) + voice binding + (COB only) WEB_SPEC_DIGEST.
- Role lens: keep current `extractSection(CAPABILITIES, roleLabel)` but cap the extracted section at 4 KB (slice with note).
- Industry lens: same — `extractSection(INDUSTRIES, industryLabel)` capped at 4 KB.
- Target ceiling: total system prompt ≤ 25 KB (down from ~250 KB). That's a ~10× reduction in input tokens.

### B.3 · Cache assembled prompts in module scope

`const promptCache = new Map<string, string>()` keyed by `${voice}|${roleLabel||''}|${industryLabel||''}|${softNudge?1:0}`. First turn builds, subsequent turns in the same isolate reuse the string. Bounded to 32 entries with simple FIFO eviction.

### B.4 · Prune conversation history

Before sending to the gateway, keep only the last 12 messages (6 user / 6 assistant pairs). The brevity cap means there's no long-context value worth the token cost.

## C · Stream the response (SSE)

### C.1 · Edge function changes

- Replace the JSON return path with `stream: true` on the gateway call.
- Set `Content-Type: text/event-stream` and pipe `response.body` straight back to the client when **no tool calls** are detected mid-stream. Standard SSE relay pattern from the AI Gateway docs.
- For the tool-call path (COB + `research_web`): do a first **non-streaming** call to detect tool intent (already what the loop does). If tools fire, run them, then make a **streaming** second call for the synthesized reply. Tool-call sessions are <10% of traffic, so this hybrid keeps the common path fast and the tool path correct.
- Keep all current guardrails: rate limit, turn cap, validation, hard preamble assembly order, 429/402 handling, voice fallbacks.
- Trailer for `research_trace`: emit a final SSE event `event: trace\ndata: {"research_trace":"..."}\n\n` before `data: [DONE]` when a tool ran.

### C.2 · Client changes (`src/components/hero/use-cob-chat.ts`)

- Replace the current `supabase.functions.invoke('cob-chat', ...)` JSON call with a raw `fetch(${VITE_SUPABASE_URL}/functions/v1/cob-chat, ...)` using the standard SSE line-by-line parser from the AI Gateway streaming reference.
- Append tokens to the in-flight assistant message as they arrive (mutate the last assistant message, never push per token).
- Honor `prefers-reduced-motion`: still stream, just skip any cursor blink animation.
- Capture the `trace` SSE event into the existing `research_trace` state.
- Keep current error handling: surface 429/402/500 toasts in the existing in-character copy.

### C.3 · `DossierIntake.tsx`

- No structural changes — the component already reads from the hook.
- Replace the static "thinking" dots with a subtle skeleton-style placeholder that disappears as soon as the first token arrives (matches brand "no spinners" rule).

---

## Out of scope

- No RAG / vector store yet. Full docs stay on disk; we just stop shoving them all into every call. RAG can be a follow-up if the digests prove too thin.
- No change to turn caps (30 COB / 15 Michael / nudge at 12), the brevity binding, the catalog contents themselves, or the brass voice toggle UI.
- No change to rate limits, auth posture, or `verify_jwt`.

## Validation

- Curl two turns against the deployed function with `Accept: text/event-stream`; confirm first byte arrives within ~1 s and full stream completes within ~5 s for a typical COB turn.
- Run the preview, send "I need help" in COB voice, then toggle to Michael and send "tell me a Dunder Mifflin joke" — confirm streaming visible, replies stay 2–3 sentences, doctrine bindings honored, banned phrases absent.
- Spot-check that `research_web` still fires when a URL is pasted (e.g., "what does stripe.com do?") and the trace returns at the end of the stream.

## Files touched

- `supabase/functions/cob-chat/index.ts` — model swap, prompt slim, cache, history prune, SSE
- `supabase/functions/cob-chat/catalog/digests/*.md` — 7 new digest files
- `src/components/hero/use-cob-chat.ts` — SSE client
- `src/components/hero/DossierIntake.tsx` — streaming placeholder (minor)
