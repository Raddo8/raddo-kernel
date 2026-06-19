## Goal
Ship A + C + D together so a full 6-force convene returns to the Cowork client without timing out. Abe stays untouched.

## A. Roster — standing synchronous convene = 6 chairs
In `supabase/functions/mcp-council/index.ts`:
- Replace `CHAIRS` array with **Aims, Leo, Lucius, Knox, Marcus, Alfred** (6). Drop Felix and Abe from the synchronous set.
- Felix moves to bench: keep the entry in `agents/manifest.ts` (Knox-style single agent, already there) and add `tags: ["growth"]` so future routing (queued task B) can summon him. He's still callable via `summon_best_advisor`, just not in the default fan-out.
- Abe is already absent from `CHAIRS`-as-synchronous via the deferred path (`abe_weighing_in`) — no change to Abe.
- Create `supabase/functions/mcp-council/council/knox.ts` (council-mode persona, same shape as `felix.ts` / `marcus.ts`): legal & risk lens, council-contribution mode (2–5 prose points, Leo synthesizes, no JSON).
- Guard the Felix-specific synth branches that already exist (`stage1ById.has("felix")` for `frameChoiceRuling` and `pricingCosign`) — they already short-circuit on absence, so they become no-ops on the default convene. No behavior regression.

## C. Safe fan-out — already parallel, raise the cap
In `index.ts` both convene paths (lines ~798 and ~1311):
- Raise per-chair `timeoutMs: 15_000` → **`35_000`** (Opus needs ~25–40s).
- Keep `Promise.allSettled` fan-out, keep DroppedChair naming on timeout, keep the existing degraded-board pathway (lowers ε/ρ, never hard-fails unless 0 chairs survive).
- Confirm no resynth in steady state (already removed; verify the deployed BUILD_ID reflects it — bump `BUILD_ID` to `"roster6_parallel35_progress_v1"` so the next log line proves the deploy landed).

## D. MCP progress notifications — keep the client alive past 60s
Per MCP Streamable HTTP spec, the server may upgrade a `tools/call` POST response to `text/event-stream` and emit `notifications/progress` frames before the final JSON-RPC result frame. Each frame resets the client's ~60s request timer.

Implementation in `index.ts`:
- When handling `tools/call` for `convene_council`, `summon_best_advisor`, `file_to_office`: read `params._meta.progressToken`. If present, build the response as a streamed SSE `Response` (`Content-Type: text/event-stream`) backed by a `ReadableStream`.
- Pass an `onProgress(stage, detail)` callback into `runCouncil` / the routed flow. Fire it:
  - After each chair settles (per-chair stage1 latency reported).
  - 10s heartbeats during stage1 (so even the slowest single chair doesn't go silent).
  - After horizon, after synth.
- Each callback writes one SSE frame: `data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":<token>,"progress":<n>,"total":<chairs+2>,"message":<stage>}}\n\n`.
- Final frame is the normal JSON-RPC result envelope (also as SSE `data:`), then close.
- If `_meta.progressToken` is absent (e.g. curl regression), fall through to the existing single-shot JSON response — unchanged.

## Acceptance / reporting (post-deploy)
- Fire a convene from Cowork. Read `mcp-council` logs and report:
  - `BUILD_ID` matches `roster6_parallel35_progress_v1` (confirms deploy landed).
  - `chairs_count: 6`, per-chair durations, `stage1_ms`, `horizon_ms`, `synth1_ms`, `total_ms`, `dropped_chairs`.
  - HTTP outcome (no 504, no client timeout); progress frame count.
- Expected envelope: `stage1_ms` ≤ ~35s, `total_ms` ~60–90s, full minute returned.

## Out of scope (queued, do NOT build now)
- **B**: triage routing with ≤6 hard cap.
- **E**: async escape hatch (write minute to OFFICE after the response cuts).
- **F**: governed decision-record fields in the minute.

## Files touched
- `supabase/functions/mcp-council/index.ts` — CHAIRS list, BUILD_ID, both `timeoutMs`, SSE response path + onProgress wiring in `runCouncil` and routed summon path.
- `supabase/functions/mcp-council/council/knox.ts` — **new**, council-mode Knox persona.
- `supabase/functions/mcp-council/agents/manifest.ts` — Felix gets `tags: ["growth"]` (no behavior change today; sets up B).
