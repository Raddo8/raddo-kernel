import {
  APP_CATEGORIES,
  ASPIRATION_WORDS,
  CURRENT_STATE_WORDS,
  DISC_ROWS,
  DISC_STYLE_LABELS,
  THEMES,
  type DiscStyle,
  type ThemeId,
} from "./consult-data";

export type DiscResponse = {
  rowId: string;
  selections: string[];
};

export type ConsultSubmissionPayload = {
  email: string;
  name?: string;
  currentStateWordIds: string[];
  aspirationWordIds: string[];
  appSelections: string[];
  otherAppsText?: string;
  discResponses: DiscResponse[];
  discAllowMultiSelect: boolean;
};

export type ThemeGapAnalysis = {
  theme: ThemeId;
  label: string;
  currentPositive: number;
  currentNegative: number;
  aspiration: number;
  growthGap: number;
  frictionLoad: number;
};

export type DiscScores = Record<DiscStyle, number>;

export type ConsultSummary = {
  themeGapAnalysis: ThemeGapAnalysis[];
  discScores: DiscScores;
  primaryStyle: DiscStyle;
  secondaryStyle: DiscStyle;
  isHybrid: boolean;
  personaNameCandidates: string[];
};

const currentWordIndex = new Map(CURRENT_STATE_WORDS.map((word) => [word.id, word]));
const aspirationWordIndex = new Map(ASPIRATION_WORDS.map((word) => [word.id, word]));
const discOptionIndex = new Map(
  DISC_ROWS.flatMap((row) => row.options.map((option) => [option.id, option] as const)),
);
const appOptionIndex = new Map(
  APP_CATEGORIES.flatMap((category) => category.options.map((option) => [option.id, option] as const)),
);

const PERSONA_MATRIX: Record<string, string[]> = {
  "D-D": ["The Operator", "The Closer", "The Decisive Builder"],
  "D-I": ["The Catalyst", "The Field General", "The Rainmaker"],
  "D-S": ["The Stabilizer", "The Turnaround Lead", "The Quiet Hammer"],
  "D-C": ["The Architect", "The Systems Captain", "The Precision Operator"],
  "I-D": ["The Frontline Voice", "The Mobilizer", "The Convener"],
  "I-I": ["The Signal Setter", "The Story Carrier", "The Connector"],
  "I-S": ["The Steward", "The Culture Builder", "The Team Glue"],
  "I-C": ["The Translator", "The Narrative Analyst", "The Sharp Diplomat"],
  "S-D": ["The Anchor", "The Calm Driver", "The Reliable Closer"],
  "S-I": ["The Team Host", "The Relationship Steward", "The Builder of Trust"],
  "S-S": ["The Custodian", "The Rhythm Keeper", "The Durable Operator"],
  "S-C": ["The Process Steward", "The Consistency Lead", "The Quiet Analyst"],
  "C-D": ["The Boardroom Analyst", "The Control Tower", "The Exacting Lead"],
  "C-I": ["The Insight Broker", "The Structured Communicator", "The Trusted Adviser"],
  "C-S": ["The Systems Steward", "The Quality Anchor", "The Method Operator"],
  "C-C": ["The Auditor", "The Strategy Mechanic", "The Evidence Keeper"],
};

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export function analyzeConsult(payload: ConsultSubmissionPayload): ConsultSummary {
  const themeGapAnalysis = THEMES.map(({ id, label }) => {
    const currentWords = payload.currentStateWordIds
      .map((wordId) => currentWordIndex.get(wordId))
      .filter(isDefined)
      .filter((word) => word.theme === id);
    const aspirationWords = payload.aspirationWordIds
      .map((wordId) => aspirationWordIndex.get(wordId))
      .filter(isDefined)
      .filter((word) => word.theme === id);

    const currentPositive = currentWords.filter((word) => word.sentiment === "positive").length;
    const currentNegative = currentWords.filter((word) => word.sentiment === "negative").length;
    const aspiration = aspirationWords.length;

    return {
      theme: id,
      label,
      currentPositive,
      currentNegative,
      aspiration,
      growthGap: aspiration - currentPositive,
      frictionLoad: currentNegative,
    };
  }).sort((a, b) => b.growthGap + b.frictionLoad - (a.growthGap + a.frictionLoad));

  const discScores: DiscScores = { D: 0, I: 0, S: 0, C: 0 };
  for (const response of payload.discResponses) {
    for (const selection of response.selections) {
      const option = discOptionIndex.get(selection);
      if (option) {
        discScores[option.style] += 1;
      }
    }
  }

  const rankedStyles = Object.entries(discScores)
    .sort((a, b) => b[1] - a[1])
    .map(([style]) => style as DiscStyle);

  const primaryStyle = rankedStyles[0] ?? "C";
  const secondaryStyle = rankedStyles[1] ?? primaryStyle;
  const isHybrid = Math.abs(discScores[primaryStyle] - discScores[secondaryStyle]) <= 2;

  const personaNameCandidates =
    PERSONA_MATRIX[`${primaryStyle}-${secondaryStyle}`] ?? PERSONA_MATRIX[`${primaryStyle}-${primaryStyle}`];

  return {
    themeGapAnalysis,
    discScores,
    primaryStyle,
    secondaryStyle,
    isHybrid,
    personaNameCandidates,
  };
}

export function buildSelectedApps(appSelections: string[], otherAppsText?: string) {
  const selected = appSelections
    .map((appId) => appOptionIndex.get(appId)?.label)
    .filter((label): label is string => Boolean(label));

  if (otherAppsText?.trim()) {
    selected.push(`Other: ${otherAppsText.trim()}`);
  }

  return selected;
}

export function buildConsultEmailText(payload: ConsultSubmissionPayload, summary: ConsultSummary) {
  const selectedApps = buildSelectedApps(payload.appSelections, payload.otherAppsText);
  const topThemes = summary.themeGapAnalysis.slice(0, 3);

  return [
    "COB consult submission",
    "",
    `Email: ${payload.email}`,
    `Name: ${payload.name?.trim() || "Not provided"}`,
    "",
    `Primary style: ${DISC_STYLE_LABELS[summary.primaryStyle]}`,
    `Secondary style: ${DISC_STYLE_LABELS[summary.secondaryStyle]}`,
    `Hybrid: ${summary.isHybrid ? "Yes" : "No"}`,
    `Persona candidates: ${summary.personaNameCandidates.join(", ")}`,
    "",
    "Top theme gaps:",
    ...topThemes.map(
      (theme) =>
        `- ${theme.label}: aspiration ${theme.aspiration}, positive ${theme.currentPositive}, negative ${theme.currentNegative}, growth gap ${theme.growthGap}`,
    ),
    "",
    `Current-state words selected: ${payload.currentStateWordIds.length}`,
    `Aspiration words selected: ${payload.aspirationWordIds.length}`,
    "",
    "App footprint:",
    ...selectedApps.map((app) => `- ${app}`),
  ].join("\n");
}
