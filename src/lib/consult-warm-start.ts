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
  };
  disc: {
    scores: DiscScores;
    primary: string;
    secondary: string;
    isHybrid: boolean;
  };
  emotion: {
    sentiment: EmotionSentiment;
    cluster: EmotionCluster;
  };
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
}): WarmStartPayload {
  const summary = analyzeConsult(opts.payload);
  const emotion = classifyEmotion(opts.payload.currentStateWordIds);

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
    },
    disc: {
      scores: summary.discScores,
      primary: summary.primaryStyle,
      secondary: summary.secondaryStyle,
      isHybrid: summary.isHybrid,
    },
    emotion,
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
  lines.push(
    `Tools in hand · ${w.tools.count} apps${w.tools.selectedLabels.length ? ` · ${w.tools.selectedLabels.slice(0, 12).join(", ")}` : ""}${w.tools.otherText ? ` · other: ${w.tools.otherText.slice(0, 200)}` : ""}`,
  );
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
