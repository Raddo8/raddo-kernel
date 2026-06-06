# Phase 2A · Notion write-back + cost instrumentation

Scope: extend `supabase/functions/mcp-council/index.ts` only. Reuse all existing machinery: bearer auth, rate limit, narrow boundary scrub (`hasBoundaryViolation`), `loadAgent`, `runCouncil`, `runSingleAgent`, `validateSingleMinute`, `extractJson`. No change to chair logic or seeds.

## Part 1 · Notion write-back

New module `supabase/functions/mcp-council/notion.ts` (server-only):
- `writeMinuteToNotion(minute, question)` → POST `https://api.notion.com/v1/pages` with `Notion-Version: 2022-06-28`, bearer `SPINNEY_NOTION_TOKEN`, parent `database_id = SPINNEY_BOARDROOM_DB`.
- Page title `[YYMMDD] <truncated question, 60 chars>`.
- Properties (corrected per COB):
  - **`Title`** (title) — NOT `Name`.
  - `Date` (date = freshness).
  - `Recommendation` (rich_text).
  - `Dissent (Spock)` (rich_text).
  - `Anticipatory Horizon` (rich_text, joined `· `-separated).
  - `Participating Chairs` (multi_select).
  - `Confidence Epistemic` (number).
  - `Confidence Rigor` (number).
  - `Council Status` (select = `"Proposed"`).
  - **`Source Tool`** (rich_text = `"cob_council_to_notion"`) — NOT select.
- Body children blocks: H2 "Recommendation" → paragraph; H2 "Anticipatory Horizon" → bulleted list; H2 "Dissent" → paragraph; H2 "Confidence" → paragraph (`epistemic · rigor`); H2 "Participating Chairs" → paragraph.
- Returns `{ url, id }`. On non-2xx: parse Notion error; if it's a `validation_error` mentioning a missing property, retry once with title-only + body (so a bare DB still works). Otherwise throw `notion_write_failed`.

New MCP tool `cob_council_to_notion`:
- Input: `{ question, context? }` (same validation as `cob_run_council`).
- Flow: `runCouncil` → serialize the full Notion payload text → run `hasBoundaryViolation` on it. On hit → throw `boundary_violation` (no retry, no write). Otherwise → `writeMinuteToNotion` → return `{ content:[{type:"text", text: JSON.stringify({minute, notion_url})}], structuredContent:{minute, notion_url}, isError:false }`.
- Listed in `TOOLS` alongside the existing three.

Binding boundary: only the minute's output fields + the user question are ever sent to Notion. Never seeds, preamble, model names, principle text.

## Part 2 · Cost instrumentation

Modify `callAnthropic` to return `{ text, usage, model }`. Pull `usage` from `json.usage` (input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens; default 0). Update `runCouncil` and `runSingleAgent` to collect `passes: Array<{model, usage}>` across every Anthropic call.

Rate map (per million tokens, USD):
```
claude-opus-4-5:   in=5,  out=25, cache_read=0.5
claude-sonnet-4-5: in=3,  out=15, cache_read=0.3
```
Cost = `(input + cache_creation) * in/1e6 + cache_read * cache_read_rate/1e6 + output * out/1e6`.

Aggregated row: `{ total_cost_usd, model_breakdown: { [model]: { calls, input, output, cache_read, cache_creation, cost_usd } } }`.

### Usage persistence — new table `public.mcp_usage_events`

Confirmed by COB: clean separate table, service-role only. Schema:
```
id uuid pk default gen_random_uuid()
tenant text not null              -- 'SPINNEY'
tool text not null                -- 'cob_run_council' | 'cob_ask_agent' | 'cob_council_to_notion'
agent_id text                     -- null for council/notion, else 'knox'|'lucius'|...
model_breakdown jsonb not null
total_cost_usd numeric(12,6) not null
created_at timestamptz not null default now()
```
RLS enabled, no policies (service-role only). GRANT ALL to `service_role`.

One row per MCP tool call. `cob_council_to_notion` writes a single row tagged with that tool name — the inner council passes are folded into its `model_breakdown`. Failures to write usage are logged (`console.error("usage_write_failed", ...)`) but never block the tool response.

### Prompt caching

Send `system` as the structured array form with `cache_control: { type: "ephemeral" }` on the static prefix (chair system / lead-synthesis / single-agent prefix). Add `anthropic-beta: prompt-caching-2024-07-31` header. `cache_read_input_tokens` will populate on repeats; cost math benefits automatically.

## Files

- MIGRATION — create `public.mcp_usage_events` + RLS + grants. (already done)
- NEW    `supabase/functions/mcp-council/notion.ts` — Notion client + page renderer.
- NEW    `supabase/functions/mcp-council/usage.ts` — rate map, cost math, `recordMcpUsage()` helper.
- MODIFY `supabase/functions/mcp-council/index.ts` — new tool, modified `callAnthropic`, usage aggregation/write, caching headers.

## Secrets

`SPINNEY_NOTION_TOKEN` and `SPINNEY_BOARDROOM_DB` — already provided.

## Validation (post-deploy curl)

- `cob_council_to_notion` returns `{minute, notion_url}`; Notion page renders styled minute.
- Boundary probe → `-32000 boundary_violation`, no Notion page created.
- `select * from mcp_usage_events order by created_at desc limit 5` shows rows with token counts and `total_cost_usd > 0`.
- Regression: `cob_run_council`, `cob_ask_agent` (knox/lucius/leo/alfred/iroh), `cob_list_my_agents` unchanged.
- Bearer omitted → 401; flood >30/min → `-32002`.

## Out of scope

OAuth, `mcp.chiefofbusiness.ai` proxy, per-tenant Notion mapping, real customer data, wiring `billing-usage` to `mcp_usage_events`.
