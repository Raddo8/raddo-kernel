// supabase/functions/_shared/embed.ts
//
// MEANING VECTORS · one embedding path for the whole world graph.
//
// Law:
//  · 1536 dimensions, because that is the width of every embedding column in
//    this database (memory_entries, world_claims, storyline).
//  · The provider already configured for the project wins (OPENAI_API_KEY).
//    When there is none, the Lovable AI gateway is used with the same model.
//  · Nothing here throws at the caller: a failure returns null vectors so the
//    surface degrades to word search instead of erroring.

export const EMBED_DIMS = 1536;
export const EMBED_MODEL = "text-embedding-3-small";

const OPENAI_URL = "https://api.openai.com/v1/embeddings";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/embeddings";

type Provider = { url: string; key: string; model: string; header: "openai" | "lovable" };

export function embedProvider(): Provider | null {
  const openai = Deno.env.get("OPENAI_API_KEY");
  if (openai) return { url: OPENAI_URL, key: openai, model: EMBED_MODEL, header: "openai" };
  const lovable = Deno.env.get("LOVABLE_API_KEY");
  if (lovable) return { url: GATEWAY_URL, key: lovable, model: `openai/${EMBED_MODEL}`, header: "lovable" };
  return null;
}

/** Embed a batch of strings. Returns one vector per input, or null for the
 *  whole batch when no provider is configured or the call fails. */
export async function embedBatch(inputs: string[]): Promise<number[][] | null> {
  const p = embedProvider();
  if (!p || inputs.length === 0) return null;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (p.header === "openai") headers["Authorization"] = `Bearer ${p.key}`;
  else headers["Lovable-API-Key"] = p.key;

  try {
    const res = await fetch(p.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: p.model, input: inputs, dimensions: EMBED_DIMS }),
    });
    if (!res.ok) {
      console.error("embed_failed", res.status, (await res.text()).slice(0, 400));
      return null;
    }
    const data = await res.json();
    const rows: Array<{ index: number; embedding: number[] }> = data?.data ?? [];
    if (rows.length !== inputs.length) return null;
    const out: number[][] = new Array(inputs.length);
    for (const r of rows) out[r.index ?? 0] = r.embedding;
    return out.every((v) => Array.isArray(v) && v.length === EMBED_DIMS) ? out : null;
  } catch (e) {
    console.error("embed_exception", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** One vector, or null. Used by search to ask the meaning tier. */
export async function embedOne(text: string): Promise<number[] | null> {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  const out = await embedBatch([trimmed.slice(0, 8000)]);
  return out ? out[0] : null;
}

/** pgvector literal form. */
export const toVectorLiteral = (v: number[]): string => `[${v.join(",")}]`;
