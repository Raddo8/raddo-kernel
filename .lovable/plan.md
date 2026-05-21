## Goal

Ship the five-axis Sample COB chat (Capabilities · Roles · Industries · Doctrine + Objections · Voice) on the hero. All decisions locked. Build on approval.

## Locked decisions

| # | Decision |
|---|---|
| Model | `google/gemini-2.5-pro` via Lovable AI Gateway, SSE streaming |
| Turn caps | COB 30 / Michael 15 hard; **Michael soft-nudge at turn 12** suggesting toggle back to COB, in character |
| Default voice | **COB** (hard); production register first |
| Voice persistence | `sessionStorage` only (per-tab); Variant B + `localStorage` deferred to Phase 2 |
| Michael web-deflection | **5–7 rotated variants**, never repeat in a single session |

## Featured chip strips (locked order)

**Roles (9)** — CFO · CEO · COO · Chief of Staff · General Counsel · CMO · Chief Revenue Officer · CHRO · CIO · `Browse all 150`

**Industries (8)** — Financial Services · Technology / SaaS · Healthcare · Manufacturing / Industrial · Professional Services · Retail / Consumer · Real Estate · Energy · `Browse all 30`

"Browse all" expands inline (brass keyword input + paper card list, 4px radius) — no shadcn `Dialog`.

## Architecture

```text
Hero
 └─ DossierIntake.tsx                          (aesthetic shell, unchanged)
      ├─ Role chip strip                       (9 featured + Browse all 150)
      ├─ Industry chip strip                   (8 featured + Browse all 30)
      ├─ Voice toggle                          (COB · Michael Scott, brass segmented)
      ├─ Active lens pill                      (VOICE · COB · LENS · CFO · Financial Services · change)
      ├─ Research-trace line                   (RESEARCHED · acme.com)
      └─ useCobChat({ voice })
            └─ POST /functions/v1/cob-chat     (SSE)
                  ├─ catalog/  (core, doctrine, web-policy, capabilities, voice-integration,
                  │             role/industry/objection indexes, roles/, industries/,
                  │             objections/, voices/cob.md, voices/michael-scott.md)
                  ├─ tool: research_web                  (gated; COB-only)
                  └─ Lovable AI Gateway → google/gemini-2.5-pro (stream)
```

## Catalog packaging

`scripts/build-cob-catalog.ts` (Bun) reads the eight source docs from `docs/cob/` and emits everything under `supabase/functions/cob-chat/catalog/`:

- `core.md`, `doctrine.md`, `web-policy.md`, `capabilities.md`, `voice-integration.md`
- `role-index.json` (150), `industry-index.json` (30), `objection-index.json`
- `roles/<id>.md` × 150 · `industries/<id>.md` × 30 · `objections/<cat>.md`
- `voices/cob.md`, `voices/michael-scott.md`
- `public/cob/role-index.json` + `public/cob/industry-index.json` (for in-UI Browse-all)

Each voice file ≤ 4k tokens; total system prompt budget ≤ ~25k on Pro.

## Edge function — `supabase/functions/cob-chat/index.ts`

- Public, no JWT. `verify_jwt = false` added to `supabase/config.toml`.
- CORS preflight per project convention.
- Postgres-backed rate limit (`check_rate_limit` RPC pattern): 20 req / 60 s per IP, 60 / hour.
- Request body:
  ```ts
  {
    session_id: string;
    role_id?: string;
    industry_id?: string;
    voice: "cob" | "michael";        // server default "cob"
    messages: { role: "user"|"assistant"; content: string }[];
  }
  ```
- Validation: ≤ 2,000 chars/message, ≤ 16k chars total. Turn caps **COB 30 / Michael 15**. On cap, server returns a graceful close payload **in the active voice** (no error toast). At **Michael turn 12** the server appends a soft-nudge directive to that turn's system prompt instructing the model to suggest toggling back to COB in character.
- **Objection classifier** — pre-pass with `google/gemini-2.5-flash-lite` against `objection-index.json` returning ≤ 1 `category_id` or null. Budget ≤ 400 ms. On timeout/failure: no match. If matched, loads `objections/<category>.md` for the turn.
- **System prompt assembly order** (preamble + doctrine sit *above* voice — voice cannot override):
  1. Hard preamble — voice non-negotiables, banned phrases, no-disclosure rule, no internal mechanics, no pricing, no competitor claims.
  2. `core.md`
  3. `doctrine.md` (always)
  4. `capabilities.md`
  5. `role-index.json` + `industry-index.json` as compact tables
  6. If `role_id`: `roles/<id>.md` + "stand in as this lens, never claim to be it."
  7. If `industry_id`: `industries/<id>.md` + "demonstrate native fluency."
  8. If objection matched: `objections/<category>.md`.
  9. `voice-integration.md` (always)
  10. `voices/cob.md` **or** `voices/michael-scott.md` based on `voice`, with binding directive:
      - COB: *"Speak in this voice. ABC Protocol applies. Substance and discipline are non-negotiable."*
      - Michael: *"Speak in this voice. Substance about RADDO remains accurate — Michael may be miscalibrated in tone but never invents capabilities, never misstates what RADDO does, never breaks the no-disclosure rule, never names internal mechanics, never quotes pricing. Comedy comes from register, not hallucination."*
  11. `web-policy.md` + tool list (tool exposed only when `voice === "cob"`).
- Model: `google/gemini-2.5-pro`. SSE stream to client.
- 429 / 402 → friendly toast layer.
- No DB writes in Phase 1.

## Selective web access — Firecrawl (COB only)

Single tool `research_web`, exposed only in COB voice. In Michael voice the tool is absent; the system prompt instructs Michael to **deflect using one of 5–7 baked-in variants, rotated, never repeat in a single session.**

Variants baked into `voices/michael-scott.md`:
1. *"Oh, I would totally Google that for you, but Toby took away my internet privileges after the incident. Let me just tell you what I know — which is a lot. I'm a knower."*
2. *"You know what? Looking things up is what assistants do. I am not an assistant. I'm a partner. A partnership. We don't look things up — we know things together."*
3. *"Pam usually handles the Googling. I do the big picture. The big-picture-handler. Let me big-picture this for you."*
4. *"I could look that up, but then I'd have to read it, and reading is something I do in private. With my glasses. So instead — here's what I think."*
5. *"Internet research is for interns. I'm a regional manager. I manage regions. Of knowledge. Already inside my head. Let me share."*
6. *"That's a research question. I'm more of a hunches guy. World-class hunches. Let me hunch at you."*
7. *"I'd Google it, but the COB version of me is way better at that and you can toggle to him whenever. He's boring but he Googles. Anyway, here's what I know."*

Rotation directive: *"Rotate through these variants. Never repeat one in a session. Always pivot to your best in-character answer from doctrine. If the question genuinely needs fresh web data, end with: '…and seriously, COB-me would crush this if you want to flip the switch.'"*

COB-side web access governed by `web-policy.md`:
- Hard intents: `user_supplied_url` · `company_research` · `named_entity` · `explicit_lookup`.
- Server gates: per-session cap **3 web calls**, 6s timeout, `target` ≤ 200 chars, URL/host sanitization, junk blocklist.
- Firecrawl: `firecrawl/scrape` for URL + company root, `firecrawl/search` (limit 2–3) for entities. Result returned as `tool` message. Post-tool reminder reasserts voice + no-disclosure rules.
- UI: brass-hairline `RESEARCHED · {target}` line under the assistant turn. No raw quotes, no logos, no link previews (citations are Phase 2).

## Frontend

### `src/components/hero/DossierIntake.tsx`

Visual shell unchanged. Engine swapped. New surfaces inside the same dossier:

1. **Role chip strip** — 9 featured (order locked above) + `Browse all 150` inline filter list.
2. **Industry chip strip** — 8 featured (order locked above) + `Browse all 30`.
3. **Voice toggle** — brass segmented control between header rule and chip strips:
   - Two segments, brass hairline border, 4px radius, Inter 12 caps, tabular-num.
   - Active: ink-deep fill + paper text + 1px brass underline. Inactive: paper + ink-deep + brass hover.
   - Caption ash 11: *"Same brain. Different voice. Toggle anytime."*
   - Default **COB**. State in `sessionStorage["cob-chat-voice"]` (per-tab).
   - Mid-conversation toggle allowed; no transcript wipe. Inserts a `── VOICE · MICHAEL SCOTT ──` (or `COB`) separator row: brass hairline, ash 11 caps, centered, no bubble, no timestamp. Next assistant turn lands in new voice.
   - Keyboard: `←` / `→` switches. Tab order: role chips → industry chips → voice toggle → composer.
   - `role="radiogroup"`, each segment `role="radio" aria-checked`, `aria-label="Voice"`.
   - Motion: 120ms fill swap. Honors `prefers-reduced-motion`.
4. **Active lens pill** (brass hairline, top-right of transcript) — `VOICE · COB · LENS · CFO · Financial Services · change`.
5. **Research-trace line** — under any assistant turn that called `research_web`, brass hairline + Inter 11 ash: `RESEARCHED · {target}`.

Existing sealed-cover unseal, motion, microcopy, accessibility — untouched.

### Hooks & data

- `src/components/hero/use-cob-chat.ts` — transcript + SSE reader + tool-trace plumbing; forwards `voice`; `setVoice(v)` persists to `sessionStorage`.
- `src/components/hero/cob-featured.ts` — typed featured role + industry lists (locked order above).
- `src/components/hero/cob-voices.ts`:
  ```ts
  export type VoiceId = "cob" | "michael";
  export const VOICES: { id: VoiceId; label: string; tagline: string }[] = [
    { id: "cob",     label: "COB",            tagline: "Your Chief of Business." },
    { id: "michael", label: "Michael Scott",  tagline: "World's Best Boss. Allegedly." },
  ];
  export const DEFAULT_VOICE: VoiceId = "cob";
  ```
- `public/cob/role-index.json` + `public/cob/industry-index.json` — lazy-loaded by "Browse all".

### Deleted

- `src/components/hero/intake-protocol.ts`

## Voice & doctrine enforcement (binding, voice-aware)

Asserted in preamble + `doctrine.md` + reasserted post-tool. Survives both voices.

- Never use banned phrases ("AI", "assistant", "bot", "powered by", "magic", etc.).
- Never name internal mechanics (Brahan, Foundry, BUDDY, TERMINAL, Burnham, Linear, MCP, Claude, GPT, LOVIE, model providers, doctrine/protocol names) — even when directly asked, even in Michael voice. Michael may deflect comedically; he cannot disclose.
- Never quote pricing, contract terms, named customers, competitor product claims.
- COB voice: "your COB" framing, recommendation-first, confidence 0.00–1.00 on substantive recs, frame → recommendation → confidence → gap, ABC Protocol.
- Michael voice: refers to himself as "Michael", to the product as "the COB thing" or "this whole RADDO situation"; cringey allowed, offensive forbidden; substance about RADDO accurate.
- Web content always synthesized, never quoted. Web tool COB-only.

## Out of scope (Phase 2)

- Variant B (returning-visitor opener) and `localStorage` voice persistence
- Yoda / Sherlock / Stark / Lasso voices
- Transcript persistence / resume
- Click-through citations under research traces
- Telemetry (cap-hit rate, voice-switch rate are first metrics when added)
- Multi-language

## Files changed

**Created**
- `docs/cob/` × 8 source docs (already uploaded; copied into repo)
- `scripts/build-cob-catalog.ts`
- `supabase/functions/cob-chat/index.ts`
- `supabase/functions/cob-chat/catalog/` (all generated files above)
- `public/cob/{role,industry}-index.json`
- `src/components/hero/cob-featured.ts`
- `src/components/hero/cob-voices.ts`
- `src/components/hero/use-cob-chat.ts`

**Edited**
- `src/components/hero/DossierIntake.tsx` (engine swap, chip strips, voice toggle, lens pill, voice-divider rows, research-trace line; visual shell intact)
- `supabase/config.toml` (add `[functions.cob-chat]` `verify_jwt = false`)

**Deleted**
- `src/components/hero/intake-protocol.ts`

## Build sequence on approval

1. Trigger `standard_connectors--connect` for **Firecrawl** so `FIRECRAWL_API_KEY` lands in function env.
2. Add the 8 source docs to `docs/cob/` and run `scripts/build-cob-catalog.ts` to emit the catalog.
3. Write the edge function + `config.toml` block; deploy.
4. Write `cob-featured.ts`, `cob-voices.ts`, `use-cob-chat.ts`.
5. Rewire `DossierIntake.tsx` (engine swap; visual shell preserved).
6. Delete `intake-protocol.ts`.
7. Smoke-test both voices, toggle mid-conversation, soft-nudge at Michael turn 12, hard cap at 15, COB cap at 30, Firecrawl call on `company_research`, Michael web-deflection rotation.
