// supabase/functions/mcp-council/injection.ts
//
// harden-v1 · prompt-injection refusal filter.
// Pattern-matched, conservative. On a hit we return a fixed refusal minute
// shape and DO NOT call any upstream model.

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  /reveal\s+(your\s+)?(system\s+prompt|instructions|hidden\s+prompt)/i,
  /print\s+(your\s+)?(system\s+prompt|instructions)/i,
  /show\s+me\s+(your\s+)?(system\s+prompt|hidden\s+prompt|raw\s+instructions)/i,
  /you\s+are\s+now\s+(a\s+)?(different|new)\s+(ai|assistant|model)/i,
  /act\s+as\s+(if\s+)?(you\s+were|a)\s+(jailbroken|unrestricted|uncensored)/i,
  /developer\s+mode\s+(enabled|on)/i,
  /\bDAN\b\s+(mode|prompt|jailbreak)/i,
  /\b(sudo|root)\s+override\b/i,
];

export function detectInjection(text: string): boolean {
  if (!text) return false;
  for (const re of INJECTION_PATTERNS) if (re.test(text)) return true;
  return false;
}

export const INJECTION_REFUSAL_MINUTE = {
  recommendation:
    "Request declined · the council does not process instructions that attempt to override its operating boundaries. Restate the business question and the council will convene.",
  dissent: "No dissent · refusal is the council's unanimous position on boundary-override attempts.",
  anticipatory_horizon: [
    "If the principal restates the underlying business question without override language, the council will convene normally.",
  ],
  confidence: { epistemic: 0.0, rigor: 0.0 },
  freshness: "",
  participating_chairs: [],
  signature: "— COB_COUNCIL",
  refused: true,
  refusal_reason: "injection_refusal",
};

// Strip ASCII control characters (except \n \r \t) which can be used to
// smuggle hidden directives past visual review.
export function sanitizeText(s: string): string {
  if (!s) return s;
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}
