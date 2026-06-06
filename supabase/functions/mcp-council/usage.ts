// supabase/functions/mcp-council/usage.ts
//
// Cost math + persistence for MCP Anthropic passes.
// Server-only. Writes to public.mcp_usage_events via service-role client.

export type AnthropicUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

export type Pass = { model: string; usage: AnthropicUsage };

// Per-million-token rates (USD). cache_creation billed at input rate
// (standard Anthropic billing).
const RATES: Record<string, { in: number; out: number; cache_read: number }> = {
  "claude-opus-4-5":   { in: 5, out: 25, cache_read: 0.5 },
  "claude-sonnet-4-5": { in: 3, out: 15, cache_read: 0.3 },
};

export function emptyUsage(): AnthropicUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
}

export function readUsage(raw: any): AnthropicUsage {
  const u = raw && typeof raw === "object" ? raw : {};
  const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    input_tokens: n(u.input_tokens),
    output_tokens: n(u.output_tokens),
    cache_read_input_tokens: n(u.cache_read_input_tokens),
    cache_creation_input_tokens: n(u.cache_creation_input_tokens),
  };
}

function costForPass(p: Pass): number {
  const r = RATES[p.model];
  if (!r) return 0;
  const u = p.usage;
  const billedInput = u.input_tokens + u.cache_creation_input_tokens;
  const inCost = (billedInput * r.in) / 1_000_000;
  const cacheReadCost = (u.cache_read_input_tokens * r.cache_read) / 1_000_000;
  const outCost = (u.output_tokens * r.out) / 1_000_000;
  return inCost + cacheReadCost + outCost;
}

export type ModelBreakdown = Record<string, {
  calls: number;
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
  cost_usd: number;
}>;

export function aggregate(passes: Pass[]): { total_cost_usd: number; model_breakdown: ModelBreakdown } {
  const mb: ModelBreakdown = {};
  let total = 0;
  for (const p of passes) {
    const bucket = mb[p.model] ?? {
      calls: 0, input: 0, output: 0, cache_read: 0, cache_creation: 0, cost_usd: 0,
    };
    const c = costForPass(p);
    bucket.calls += 1;
    bucket.input += p.usage.input_tokens;
    bucket.output += p.usage.output_tokens;
    bucket.cache_read += p.usage.cache_read_input_tokens;
    bucket.cache_creation += p.usage.cache_creation_input_tokens;
    bucket.cost_usd = +(bucket.cost_usd + c).toFixed(6);
    mb[p.model] = bucket;
    total += c;
  }
  return { total_cost_usd: +total.toFixed(6), model_breakdown: mb };
}

export async function recordMcpUsage(
  supabaseAdmin: any | null,
  args: {
    tenant: string;
    tool: string;
    agent_id: string | null;
    passes: Pass[];
  },
): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { total_cost_usd, model_breakdown } = aggregate(args.passes);
    const { error } = await supabaseAdmin.from("mcp_usage_events").insert({
      tenant: args.tenant,
      tool: args.tool,
      agent_id: args.agent_id,
      model_breakdown,
      total_cost_usd,
    });
    if (error) console.error("usage_write_failed", error.message);
  } catch (e) {
    console.error("usage_write_exception", e instanceof Error ? e.message : String(e));
  }
}
