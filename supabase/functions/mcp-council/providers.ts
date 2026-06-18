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
export const ADVISOR_PROVIDER: Record<string, ProviderId> = {
  abe: "openai",
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
    const t = setTimeout(() => ctrl.abort(), 45_000);
    try {
      const r = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: opts.model,
          max_completion_tokens: opts.maxTokens,
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
        }),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(`openai_upstream_failed:${r.status}:${body.slice(0, 200)}`);
      }
      const json = await r.json();
      const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
      if (!text) throw new Error("openai_upstream_empty");
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
