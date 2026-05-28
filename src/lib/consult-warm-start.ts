// Warm-start payload builder for the consult → primed COB chat handoff.
//
// Sources of truth (no guessed lists):
// · Valence per chip → CURRENT_STATE_WORDS[*].sentiment (from consult-data.ts)
// · DISC tally       → option.style (consult-analysis.ts)
// · Emotion cluster  → derived from theme + valence, not a word lookup
//
// What this file does NOT do: name DISC types or emotional states out loud.
// That guardrail is baked into the prompt block emitted by
// formatWarmStartForPrompt() and re-stated here so future edits respect it.

import {
  ASPIRATION_WORDS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  CURRENT_STATE_WORDS,
  type Category,
  type ThemeId,
} from "./consult-data";
import { INTEGRATION_CAPABILITIES, type ToolCapability } from "./integration-capabilities";

import { ALL_ROLES } from "@/components/hero/cob-featured";
import {
  analyzeConsult,
  type ConsultSubmissionPayload,
  type DiscScores,
} from "./consult-analysis";

export type EmotionSentiment = "negative" | "positive" | "neutral";
export type EmotionCluster =
  | "overwhelm"
  | "discouragement"
  | "steady"
  | "confident"
  | "neutral";

// Theme partition rules (final · v5 16-theme architecture):
//   Negative · Overwhelm      · cash, capacity, leadership, people, self, culture
//   Negative · Discouragement · clarity, sales, strategy, visibility, delivery, systems, marketing, ai, customers, risk
//   Positive · Confident      · cash, sales, strategy, clarity, marketing, ai, risk
//   Positive · Steady         · capacity, people, systems, visibility, delivery, leadership, self, customers, culture
const OVERWHELM_NEG_THEMES = new Set<ThemeId>([
  "cash",
  "capacity",
  "leadership",
  "people",
  "self",
  "culture",
]);
const CONFIDENT_POS_THEMES = new Set<ThemeId>([
  "cash",
  "sales",
  "strategy",
  "clarity",
  "marketing",
  "ai",
  "risk",
]);


const wordIndex = new Map(CURRENT_STATE_WORDS.map((w) => [w.id, w]));
const aspirationIndex = new Map(ASPIRATION_WORDS.map((w) => [w.id, w]));

export type FocusSignal = {
  heaviestPainBucket: Category | null;
  topPainBuckets: Array<{ bucket: Category; negativeCount: number }>;
  biggestGapBucket: Category | null;
  lightSignalBuckets: Category[];
};

// Tally each of the 9 categories across selected current + desired chips,
// then derive: heaviest pain (argmax neg), top 3 pain buckets (drop zeros),
// biggest gap (neg>=3 AND desired>=2, argmax of sum), light-signal buckets
// (neg+pos+desired <= 1 · stays in context but skipped in opening).
export function computeFocusSignal(
  currentStateWordIds: string[],
  aspirationWordIds: string[],
): FocusSignal {
  const counts = new Map<Category, { neg: number; pos: number; desired: number }>();
  for (const c of CATEGORY_ORDER) counts.set(c, { neg: 0, pos: 0, desired: 0 });

  for (const id of currentStateWordIds) {
    const w = wordIndex.get(id);
    if (!w) continue;
    const slot = counts.get(w.category)!;
    if (w.sentiment === "negative") slot.neg += 1;
    else slot.pos += 1;
  }
  for (const id of aspirationWordIds) {
    const w = aspirationIndex.get(id);
    if (!w) continue;
    counts.get(w.category)!.desired += 1;
  }

  const buckets = CATEGORY_ORDER.map((bucket) => ({ bucket, ...counts.get(bucket)! }));

  const heaviest = buckets.filter((b) => b.neg > 0).sort((a, b) => b.neg - a.neg)[0];
  const heaviestPainBucket: Category | null = heaviest ? heaviest.bucket : null;

  const topPainBuckets = buckets
    .filter((b) => b.neg > 0)
    .sort((a, b) => b.neg - a.neg)
    .slice(0, 3)
    .map((b) => ({ bucket: b.bucket, negativeCount: b.neg }));

  const gapCandidate = buckets
    .filter((b) => b.neg >= 3 && b.desired >= 2)
    .sort((a, b) => b.neg + b.desired - (a.neg + a.desired))[0];
  const biggestGapBucket: Category | null = gapCandidate ? gapCandidate.bucket : null;

  const lightSignalBuckets = buckets
    .filter((b) => b.neg + b.pos + b.desired <= 1)
    .map((b) => b.bucket);

  return { heaviestPainBucket, topPainBuckets, biggestGapBucket, lightSignalBuckets };
}

// ─── INTEGRATION PLAYS · Layer 2 of Integration Sell ──────────────────────────
// Keyword map per category bucket · used to score moves against pain context.
// Lowercased substring match against the move text.
const BUCKET_KEYWORDS: Record<Category, string[]> = {
  money: ["money", "cash", "finance", "revenue", "mrr", "arr", "p&l", "a/r", "ar ", "invoice", "payment", "payroll", "cost", "spend", "budget", "burn", "runway", "cac", "ltv", "churn", "billing", "expense"],
  market_position: ["market", "brand", "competitor", "positioning", "differentiation", "messaging", "category"],
  operations: ["operation", "workflow", "process", "delivery", "throughput", "ops ", "fulfillment", "execution"],
  systems: ["system", "integration", "automation", "infrastructure", "tool", "stack", "access", "data source", "audit", "permission"],
  customers: ["customer", "client", "ticket", "csat", "support", "account", "churn", "renewal", "onboarding"],
  people: ["people", "team", "employee", "headcount", "talent", "hiring", "hr ", "payroll", "comp", "contractor"],
  culture: ["culture", "engagement", "morale", "values", "review"],
  risk: ["risk", "compliance", "audit", "security", "legal", "liability", "deprovision"],
  you: ["focus", "attention", "calendar", "meeting", "inbox", "brief", "priority", "1:1", "agenda"],
};

function matchesAnyKeyword(move: string, bucket: Category | null): boolean {
  if (!bucket) return false;
  const m = move.toLowerCase();
  return BUCKET_KEYWORDS[bucket].some((k) => m.includes(k));
}

// Score moves drawn from the catalog entries for the prospect's selected tool
// slugs. Higher = more relevant. Returns top 3 move strings. Stub entries
// contribute their generic moves; rich entries dominate when scoring ties.
export function computeIntegrationPlays(
  selectedSlugs: string[],
  focus: FocusSignal,
): string[] {
  const uniqueSlugs = Array.from(new Set(selectedSlugs));
  const hits: Array<{ slug: string; cap: ToolCapability }> = [];
  for (const slug of uniqueSlugs) {
    const cap = INTEGRATION_CAPABILITIES[slug];
    if (cap) hits.push({ slug, cap });
  }
  if (hits.length === 0) return [];

  // Build lowercased name set of all SELECTED catalog entries for bridge detection.
  const selectedNamesLower = hits.map((h) => h.cap.name.toLowerCase());

  type Scored = { move: string; score: number; order: number };
  const scored: Scored[] = [];
  let order = 0;
  const topPainBucketsSet = new Set<Category>(
    focus.topPainBuckets.map((p) => p.bucket),
  );

  for (const { cap } of hits) {
    for (const move of cap.moves) {
      let score = 0;
      const lower = move.toLowerCase();
      // +2 heaviest pain keyword
      if (matchesAnyKeyword(move, focus.heaviestPainBucket)) score += 2;
      // +1 starts with "Bridge"
      const isBridge = lower.startsWith("bridge ");
      if (isBridge) score += 1;
      // +1 bridge tool is also in selection (parse "Bridge X plus Y")
      if (isBridge) {
        // Both X and Y must be selected. Cheap check: count selected names that
        // appear in the move text · need 2+ matches (the bridging tool itself
        // plus at least one partner).
        const matches = selectedNamesLower.filter((n) => lower.includes(n)).length;
        if (matches >= 2) score += 1;
      }
      // +1 mentions a topPainBuckets category
      for (const bucket of topPainBucketsSet) {
        if (bucket === focus.heaviestPainBucket) continue;
        if (matchesAnyKeyword(move, bucket)) {
          score += 1;
          break;
        }
      }
      scored.push({ move, score, order: order++ });
    }
  }

  scored.sort((a, b) => (b.score - a.score) || (a.order - b.order));
  const top = scored.filter((s) => s.score > 0).slice(0, 3).map((s) => s.move);
  if (top.length >= 3) return top;

  // Fallback · first 3 moves in catalog order from the prospect's tools.
  const fallback: string[] = [];
  for (const { cap } of hits) {
    for (const move of cap.moves) {
      if (fallback.length >= 3) break;
      if (!fallback.includes(move)) fallback.push(move);
    }
    if (fallback.length >= 3) break;
  }
  return fallback;
}

export type WarmStartPayload = {
  identity: {
    name?: string;
    email: string;
    phone?: string;
    occupation?: string;
  };
  roleLensSuggested?: string;
  currentState: {
    positiveCount: number;
    negativeCount: number;
    topThemes: string[];
  };
  desiredState: {
    aspirationCount: number;
    topThemes: string[];
  };
  tools: {
    count: number;
    selectedLabels: string[];
    otherText?: string;
    byCategory?: Array<{ label: string; items: string[] }>;
  };
  disc: {
    scores: DiscScores;
    primary: string;
    secondary: string;
    isHybrid: boolean;
  };
  integrationPlays: string[];
  emotion: {
    sentiment: EmotionSentiment;
    cluster: EmotionCluster;
  };
  focus: FocusSignal;
};

export function classifyEmotion(currentStateWordIds: string[]): {
  sentiment: EmotionSentiment;
  cluster: EmotionCluster;
} {
  let pos = 0;
  let neg = 0;
  let overwhelmNeg = 0;
  let discouragementNeg = 0;
  let confidentPos = 0;
  let steadyPos = 0;

  for (const id of currentStateWordIds) {
    const w = wordIndex.get(id);
    if (!w) continue;
    if (w.sentiment === "negative") {
      neg += 1;
      if (OVERWHELM_NEG_THEMES.has(w.theme)) overwhelmNeg += 1;
      else discouragementNeg += 1;
    } else {
      pos += 1;
      if (CONFIDENT_POS_THEMES.has(w.theme)) confidentPos += 1;
      else steadyPos += 1;
    }
  }

  if (pos === 0 && neg === 0) return { sentiment: "neutral", cluster: "neutral" };

  if (neg > pos) {
    if (overwhelmNeg === discouragementNeg) {
      return { sentiment: "negative", cluster: "neutral" };
    }
    return {
      sentiment: "negative",
      cluster: overwhelmNeg > discouragementNeg ? "overwhelm" : "discouragement",
    };
  }

  if (pos > neg) {
    if (confidentPos === steadyPos) {
      return { sentiment: "positive", cluster: "neutral" };
    }
    return {
      sentiment: "positive",
      cluster: confidentPos > steadyPos ? "confident" : "steady",
    };
  }

  return { sentiment: "neutral", cluster: "neutral" };
}

// Substring match the occupation against ALL_ROLES. Longest label first so
// "Chief Revenue Officer" wins over "CEO" if both substrings appear.
export function suggestRoleLens(occupation?: string): string | undefined {
  const q = (occupation || "").trim().toLowerCase();
  if (!q) return undefined;
  const sorted = Array.from(new Set(ALL_ROLES)).sort(
    (a, b) => b.length - a.length,
  );
  for (const role of sorted) {
    if (q.includes(role.toLowerCase())) return role;
  }
  return undefined;
}

export function buildWarmStartPayload(opts: {
  payload: ConsultSubmissionPayload;
  phone?: string;
  occupation?: string;
  appLabels: string[];
  toolsByCategory?: Array<{ label: string; items: string[] }>;
}): WarmStartPayload {
  const summary = analyzeConsult(opts.payload);
  const emotion = classifyEmotion(opts.payload.currentStateWordIds);
  const focus = computeFocusSignal(
    opts.payload.currentStateWordIds,
    opts.payload.aspirationWordIds,
  );


  const topThemesCurrent = summary.themeGapAnalysis
    .filter((t) => t.currentNegative > 0)
    .sort((a, b) => b.currentNegative - a.currentNegative)
    .slice(0, 3)
    .map((t) => t.label);

  const topThemesDesired = summary.themeGapAnalysis
    .filter((t) => t.aspiration > 0)
    .sort((a, b) => b.aspiration - a.aspiration)
    .slice(0, 3)
    .map((t) => t.label);

  const positiveCount = opts.payload.currentStateWordIds.filter(
    (id) => wordIndex.get(id)?.sentiment === "positive",
  ).length;
  const negativeCount = opts.payload.currentStateWordIds.filter(
    (id) => wordIndex.get(id)?.sentiment === "negative",
  ).length;

  return {
    identity: {
      name: opts.payload.name?.trim() || undefined,
      email: opts.payload.email,
      phone: opts.phone?.trim() || undefined,
      occupation: opts.occupation?.trim() || undefined,
    },
    roleLensSuggested: suggestRoleLens(opts.occupation),
    currentState: {
      positiveCount,
      negativeCount,
      topThemes: topThemesCurrent,
    },
    desiredState: {
      aspirationCount: opts.payload.aspirationWordIds.length,
      topThemes: topThemesDesired,
    },
    tools: {
      count: opts.payload.appSelections.length,
      selectedLabels: opts.appLabels,
      otherText: opts.payload.otherAppsText?.trim() || undefined,
      byCategory: opts.toolsByCategory,
    },
    disc: {
      scores: summary.discScores,
      primary: summary.primaryStyle,
      secondary: summary.secondaryStyle,
      isHybrid: summary.isHybrid,
    },
    emotion,
    focus,
  };
}

// Server-side · format the payload into the per-request system prompt tail.
// Mirrored verbatim in supabase/functions/cob-chat — keep in sync if edited.
export function formatWarmStartForPrompt(w: WarmStartPayload): string {
  const lines: string[] = [];
  lines.push("# WHAT YOUR COB ALREADY KNOWS (from the consult · BINDING USE)");
  lines.push("Guardrail (binding):");
  lines.push(
    "· NEVER recite this block back. Never read identity, counts, themes, tools, DISC, or emotion fields aloud.",
  );
  lines.push(
    "· NEVER name a DISC style ('you're a D / High-I / Conscientious type') or an emotional state ('you sound overwhelmed').",
  );
  lines.push(
    "· USE this to modulate voice (pace, register, bluntness vs warmth) and to SKIP discovery you already have.",
  );
  lines.push(
    "· Skip the 'walk me through it / tell me your situation' opener · they already told you in the consult.",
  );
  lines.push("");

  // POSITIONING RULES · injected ABOVE the data dump · teaches WHAT to focus on.
  // Complements the Adaptive Voice Doctrine (HOW to speak).
  lines.push("POSITIONING RULES — how to use this intel:");
  lines.push("");
  lines.push(
    "1. LEAD WITH THE HEAVIEST PAIN. Open on the area where they have the most negative selections (see \"Heaviest pain area\" below). That's where they feel it most. Reference the area naturally — never recite their chip selections.",
  );
  lines.push("");
  lines.push(
    "2. FOCUS ON 2-3 AREAS MAX. The top pain areas drive the conversation. Buckets in \"Light signal\" stay in your context but don't get airtime in the opening — only revisit them if directly relevant to a deliverable.",
  );
  lines.push("");
  lines.push(
    "3. CONNECT EVERY DELIVERABLE TO A DESIRED-STATE CHIP. They told you where they want to be in 12 months. Every recommendation, plan, or move you offer should bridge their current state to one of those chosen aspirations. Move them from where they are to where they said they want to go.",
  );
  lines.push("");
  lines.push(
    "4. THE BIGGEST GAP IS THE STRONGEST PULL. The bucket flagged \"Biggest gap\" has both heavy current pain AND clear desired state — that's where the motivational pull is highest. Lead toward closing that gap.",
  );
  lines.push("");
  lines.push(
    "5. SKIP DISCOVERY ON COVERED GROUND. The consult IS the diagnosis. Do not ask what's hard, what they want, or what tools they use — you already know. Move directly into recommendation, abundance, action.",
  );
  lines.push("");
  lines.push(
    "6. REFERENCE BY AREA, NEVER BY RECITATION. Speak in terms of \"on the money side\", \"operationally\", \"your team situation\", \"the cash pressure\" — never read back the actual chip labels they selected.",
  );
  lines.push("");
  lines.push(
    "7. SILENT ATTUNEMENT. Per the Adaptive Voice Doctrine: never name DISC types, emotional states, or this intel out loud. The adaptation is felt, not announced.",
  );
  lines.push("");
  const labelOf = (c: Category | null) => (c ? CATEGORY_LABELS[c] : "none");
  const topPainStr = w.focus.topPainBuckets.length
    ? w.focus.topPainBuckets.map((p) => `${CATEGORY_LABELS[p.bucket]} (${p.negativeCount})`).join(", ")
    : "none";
  const lightStr = w.focus.lightSignalBuckets.length
    ? w.focus.lightSignalBuckets.map((c) => CATEGORY_LABELS[c]).join(", ")
    : "none";
  lines.push(`Heaviest pain area: ${labelOf(w.focus.heaviestPainBucket)}`);
  lines.push(`Top pain areas: ${topPainStr}`);
  lines.push(`Biggest gap: ${labelOf(w.focus.biggestGapBucket)}`);
  lines.push(`Light signal (skip in opening): ${lightStr}`);
  lines.push("");

  lines.push(
    `Identity · ${w.identity.name || "(unnamed)"} · ${w.identity.occupation || "(role unspecified)"} · ${w.identity.email}`,
  );
  if (w.roleLensSuggested) {
    lines.push(`Suggested role lens · ${w.roleLensSuggested}`);
  }
  lines.push(
    `Current state · ${w.currentState.negativeCount} negative / ${w.currentState.positiveCount} positive · top friction themes: ${w.currentState.topThemes.join(", ") || "none"}`,
  );
  lines.push(
    `Desired state · ${w.desiredState.aspirationCount} aspirations · top desired themes: ${w.desiredState.topThemes.join(", ") || "none"}`,
  );
  if (w.tools.byCategory && w.tools.byCategory.length) {
    lines.push(`Tools in hand · ${w.tools.count} apps · by category:`);
    for (const group of w.tools.byCategory) {
      lines.push(`  · ${group.label}: ${group.items.join(", ")}`);
    }
  } else {
    lines.push(
      `Tools in hand · ${w.tools.count} apps${w.tools.selectedLabels.length ? ` · ${w.tools.selectedLabels.slice(0, 12).join(", ")}` : ""}${w.tools.otherText ? ` · other: ${w.tools.otherText.slice(0, 200)}` : ""}`,
    );
  }
  lines.push(
    `DISC tally · D=${w.disc.scores.D} I=${w.disc.scores.I} S=${w.disc.scores.S} C=${w.disc.scores.C} · primary ${w.disc.primary}${w.disc.isHybrid ? `/${w.disc.secondary}` : ""}`,
  );
  lines.push(
    `Emotion read · ${w.emotion.sentiment}${w.emotion.cluster !== "neutral" ? ` · ${w.emotion.cluster}` : ""}`,
  );
  lines.push("");
  lines.push("Modulation rules (apply silently · never name them):");
  lines.push("· Primary D · terse, lead with the call, skip warmth filler.");
  lines.push("· Primary I · warm energy ok, still drive to a decision.");
  lines.push("· Primary S · gentler pacing, name the steady path, less force.");
  lines.push("· Primary C · evidence-first, name confidence and the gap, no theatrics.");
  lines.push("· Emotion overwhelm · ONE next move, not three. Reduce load before adding any.");
  lines.push("· Emotion discouragement · name one credible near-term win before the bigger arc.");
  lines.push("· Emotion steady · build on momentum, raise the bar.");
  lines.push("· Emotion confident · stress-test, don't flatter.");
  lines.push(
    "First turn · address by first name, prove you read the consult by referencing the dominant friction theme without quoting words back, recommend, name the next move. No 'walk me through it.'",
  );
  return lines.join("\n");
}
