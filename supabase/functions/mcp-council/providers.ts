// Per-advisor provider routing for Stage-1 chair calls.
//
// Goal: route specific chairs (today: Abe, the dissent seat) to a non-
// Anthropic model family so the Council's dissent is genuinely model-
// independent. All other chairs continue to call Anthropic via the
// existing callAnthropic path · this module is additive.
//
// Contract: callChair(...) returns the SAME shape as callAnthropic
// ({ text, usage, model }) so downstream stage1 assembly is unchanged.
// If the OpenAI path is unavailable or errors, we fall back to
// Anthropic so a convene never fails because of provider routing.

import { readUsage, type AnthropicUsage } from "./usage.ts";
import { withRetry } from "./retry.ts";

export type ProviderId = "anthropic" | "openai";

// Advisor → provider map. Default for any chair not listed is "anthropic".
// Move chairs here to re-route them; no call-site changes required.
// TEMPORARY: Abe routed to Anthropic while we diagnose the OpenAI
// empty-content bug (see callOpenAI raw-body logging below). Re-enable
// "openai" once a successful non-empty test response is observed.
export const ADVISOR_PROVIDER: Record<string, ProviderId> = {
  abe: "anthropic",
};

// Single-source model name for Abe-on-OpenAI. Change here, applies
// everywhere. Use a GA chat-completions model that reliably returns
// non-empty content (reasoning models like gpt-5 burn the token
// budget on hidden reasoning and return empty `message.content`).
export const ABE_OPENAI_MODEL = "gpt-4o";

export function providerFor(chairId: string): ProviderId {
  return ADVISOR_PROVIDER[chairId] ?? "anthropic";
}

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// Map Abe's existing {system, user} into OpenAI chat-completions and
// back to the {text, usage, model} shape the pipeline expects.
async function callOpenAI(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}): Promise<{ text: string; usage: AnthropicUsage; model: string }> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("openai_key_missing");

  const doCall = async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const requestBody = {
        model: opts.model,
        max_completion_tokens: opts.maxTokens,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      };
      const r = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        signal: ctrl.signal,
        body: JSON.stringify(requestBody),
      });
      const rawBody = await r.text();
      if (!r.ok) {
        throw new Error(`openai_upstream_failed:${r.status}:${rawBody.slice(0, 200)}`);
      }
      let json: any;
      try { json = JSON.parse(rawBody); }
      catch { throw new Error(`openai_upstream_unparseable:${rawBody.slice(0, 200)}`); }
      const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
      if (!text) {
        // Root-cause diagnostic dump · log FULL raw response, headers,
        // finish_reason, usage, and the exact request payload (token
        // param + message shape). Truncated only to satisfy log limits.
        const headerDump: Record<string, string> = {};
        r.headers.forEach((v, k) => { headerDump[k] = v; });
        console.error("openai_empty_content_diagnostic", JSON.stringify({
          status: r.status,
          headers: headerDump,
          finish_reason: json?.choices?.[0]?.finish_reason,
          choice0: json?.choices?.[0],
          usage: json?.usage,
          raw_body: rawBody.slice(0, 4000),
          request: {
            model: requestBody.model,
            token_param: "max_completion_tokens",
            max_completion_tokens: requestBody.max_completion_tokens,
            messages_shape: requestBody.messages.map(m => ({
              role: m.role,
              content_len: (m.content ?? "").length,
              content_preview: (m.content ?? "").slice(0, 120),
            })),
          },
        }));
        throw new Error("openai_upstream_empty");
      }
      // Adapt OpenAI usage into AnthropicUsage shape for downstream
      // aggregation; cost math will be zero for unknown model rates,
      // which is fine · this is observability, not billing.
      const u = json?.usage ?? {};
      const usage = readUsage({
        input_tokens: u.prompt_tokens,
        output_tokens: u.completion_tokens,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      });
      return { text, usage, model: opts.model };
    } finally {
      clearTimeout(t);
    }
  };

  return await withRetry(doCall);
}

// Route a chair call to the right provider. Fallback to the supplied
// anthropic call (passed in as a closure to avoid an import cycle with
// index.ts) whenever the OpenAI path is unavailable or fails. The
// fallback is logged but never propagated as an error.
export async function callChair(args: {
  chairId: string;
  system: string;
  user: string;
  maxTokens: number;
  anthropicFallback: () => Promise<{ text: string; usage: AnthropicUsage; model: string }>;
}): Promise<{ text: string; usage: AnthropicUsage; model: string }> {
  const provider = providerFor(args.chairId);
  if (provider !== "openai") return args.anthropicFallback();

  try {
    return await callOpenAI({
      model: ABE_OPENAI_MODEL,
      system: args.system,
      user: args.user,
      maxTokens: args.maxTokens,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn("chair_provider_fallback", JSON.stringify({
      chair_id: args.chairId,
      from: "openai",
      to: "anthropic",
      reason: reason.slice(0, 300),
      degraded: true,
    }));
    return args.anthropicFallback();
  }
}

// ── OpenAI Responses API (for the deferred loyal-dissent pass) ───────────
//
// The chat-completions path (callOpenAI above) burns the token budget on
// hidden reasoning tokens when called against gpt-5, returning empty
// message.content — that is the root cause of the convene-time empty bug.
// The Responses API exposes a separate `max_output_tokens` from the
// reasoning budget, so gpt-5 reliably returns visible text here.
//
// This call is intentionally non-trivial in wall-clock (high reasoning
// effort) and is used OUTSIDE the synchronous convene path · the
// `summon_dissent` tool calls this against the FINISHED minute.

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

// Single-source model for the deferred loyal-dissent pass. Use the
// strongest GA OpenAI reasoning model. Change here, applies everywhere.
export const ABE_DISSENT_OPENAI_MODEL = "gpt-5";

export async function callOpenAIResponses(opts: {
  system: string;
  user: string;
  maxOutputTokens: number;
  reasoningEffort?: "low" | "medium" | "high";
  timeoutMs?: number;
}): Promise<{ text: string; usage: AnthropicUsage; model: string }> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("openai_key_missing");

  const ctrl = new AbortController();
  const timeout = opts.timeoutMs ?? 120_000;
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const requestBody = {
      model: ABE_DISSENT_OPENAI_MODEL,
      input: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      reasoning: { effort: opts.reasoningEffort ?? "high" },
      max_output_tokens: opts.maxOutputTokens,
    };
    const r = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal: ctrl.signal,
      body: JSON.stringify(requestBody),
    });
    const rawBody = await r.text();
    if (!r.ok) {
      throw new Error(`openai_responses_upstream_failed:${r.status}:${rawBody.slice(0, 200)}`);
    }
    let json: any;
    try { json = JSON.parse(rawBody); }
    catch { throw new Error(`openai_responses_unparseable:${rawBody.slice(0, 200)}`); }

    // Extract visible text · prefer the convenience field, fall back to
    // walking `output[].content[].text` for type === "output_text".
    let text = typeof json?.output_text === "string" ? json.output_text.trim() : "";
    if (!text && Array.isArray(json?.output)) {
      const parts: string[] = [];
      for (const item of json.output) {
        if (item?.type !== "message") continue;
        const blocks = Array.isArray(item?.content) ? item.content : [];
        for (const b of blocks) {
          if (b?.type === "output_text" && typeof b?.text === "string") {
            parts.push(b.text);
          }
        }
      }
      text = parts.join("\n").trim();
    }
    if (!text) {
      const headerDump: Record<string, string> = {};
      r.headers.forEach((v, k) => { headerDump[k] = v; });
      console.error("openai_responses_empty_diagnostic", JSON.stringify({
        status: r.status,
        headers: headerDump,
        incomplete_details: json?.incomplete_details,
        status_field: json?.status,
        usage: json?.usage,
        raw_body: rawBody.slice(0, 4000),
        request: {
          model: requestBody.model,
          max_output_tokens: requestBody.max_output_tokens,
          reasoning_effort: requestBody.reasoning.effort,
        },
      }));
      throw new Error("openai_responses_upstream_empty");
    }

    const u = json?.usage ?? {};
    const usage = readUsage({
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_read_input_tokens: u.input_tokens_details?.cached_tokens ?? 0,
      cache_creation_input_tokens: 0,
    });
    return { text, usage, model: String(json?.model ?? ABE_DISSENT_OPENAI_MODEL) };
  } finally {
    clearTimeout(t);
  }
}

