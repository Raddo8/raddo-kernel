export type ThemeId =
  | "clarity"
  | "cash"
  | "delivery"
  | "sales"
  | "people"
  | "systems"
  | "leadership"
  | "capacity"
  | "visibility"
  | "strategy";

export type DiscStyle = "D" | "I" | "S" | "C";

export type CurrentWord = {
  id: string;
  label: string;
  theme: ThemeId;
  sentiment: "positive" | "negative";
};

export type AspirationWord = {
  id: string;
  label: string;
  theme: ThemeId;
};

export type AppOption = {
  id: string;
  label: string;
};

export type AppCategory = {
  id: string;
  label: string;
  options: AppOption[];
};

export type DiscOption = {
  id: string;
  label: string;
  style: DiscStyle;
};

export type DiscRow = {
  id: string;
  prompt: string;
  options: DiscOption[];
};

export const THEMES: { id: ThemeId; label: string; prompt: string }[] = [
  { id: "clarity", label: "Clarity", prompt: "How clear is the work in front of you?" },
  { id: "cash", label: "Cash", prompt: "What does the business feel like financially?" },
  { id: "delivery", label: "Delivery", prompt: "How reliably does work get finished?" },
  { id: "sales", label: "Sales", prompt: "How healthy is demand and follow-through?" },
  { id: "people", label: "People", prompt: "What is the team dynamic right now?" },
  { id: "systems", label: "Systems", prompt: "How dependable are your tools and processes?" },
  { id: "leadership", label: "Leadership", prompt: "How does leadership feel day to day?" },
  { id: "capacity", label: "Capacity", prompt: "How much room is left in the tank?" },
  { id: "visibility", label: "Visibility", prompt: "How visible is the truth of the business?" },
  { id: "strategy", label: "Strategy", prompt: "How coherent is the direction?" },
];

const CURRENT_WORD_SETS: Record<
  ThemeId,
  { positive: string[]; negative: string[]; aspiration: string[] }
> = {
  clarity: {
    positive: ["focused", "ordered", "decisive", "structured", "legible"],
    negative: ["foggy", "reactive", "fragmented", "stalled", "noisy"],
    aspiration: [
      "calm",
      "sequenced",
      "certain",
      "prioritized",
      "clean",
      "aligned",
      "transparent",
      "predictable",
      "usable",
      "steady",
    ],
  },
  cash: {
    positive: ["stable", "bankable", "profitable", "collected", "disciplined"],
    negative: ["tight", "late", "leaking", "uncertain", "stretched"],
    aspiration: [
      "cash-rich",
      "measured",
      "forecastable",
      "timely",
      "durable",
      "margin-safe",
      "funded",
      "sharp",
      "accountable",
      "controlled",
    ],
  },
  delivery: {
    positive: ["reliable", "on-time", "repeatable", "complete", "clean-handed"],
    negative: ["dropped", "late", "uneven", "rushed", "slipping"],
    aspiration: [
      "cadenced",
      "polished",
      "trustworthy",
      "frictionless",
      "finish-first",
      "dependable",
      "stable",
      "measured",
      "fast",
      "professional",
    ],
  },
  sales: {
    positive: ["active", "warm", "compelling", "responsive", "advancing"],
    negative: ["quiet", "stalled", "unclear", "thin", "ghosted"],
    aspiration: [
      "consistent",
      "qualified",
      "confident",
      "conversion-ready",
      "well-timed",
      "magnetic",
      "healthy",
      "tracked",
      "sharp",
      "trusted",
    ],
  },
  people: {
    positive: ["committed", "coachable", "supportive", "honest", "engaged"],
    negative: ["drained", "confused", "siloed", "fragile", "checked-out"],
    aspiration: [
      "clear-eyed",
      "energized",
      "responsible",
      "direct",
      "safe",
      "collaborative",
      "steady",
      "capable",
      "mature",
      "present",
    ],
  },
  systems: {
    positive: ["documented", "stable", "connected", "searchable", "repeatable"],
    negative: ["manual", "brittle", "duplicated", "scattered", "opaque"],
    aspiration: [
      "integrated",
      "traceable",
      "automated",
      "auditable",
      "simple",
      "durable",
      "centralized",
      "indexed",
      "clean",
      "trusted",
    ],
  },
  leadership: {
    positive: ["available", "candid", "steady", "visible", "intentional"],
    negative: ["overloaded", "avoidant", "scattered", "inconsistent", "isolated"],
    aspiration: [
      "composed",
      "truthful",
      "disciplined",
      "present",
      "calibrated",
      "clear",
      "effective",
      "respected",
      "credible",
      "confident",
    ],
  },
  capacity: {
    positive: ["sustainable", "paced", "protected", "rested", "resilient"],
    negative: ["maxed", "interrupt-driven", "brittle", "fatigued", "behind"],
    aspiration: [
      "spacious",
      "buffered",
      "deliberate",
      "protected",
      "recoverable",
      "balanced",
      "durable",
      "stable",
      "human",
      "repeatable",
    ],
  },
  visibility: {
    positive: ["measured", "current", "factual", "searchable", "shared"],
    negative: ["buried", "guessing", "late", "partial", "manual"],
    aspiration: [
      "live",
      "trusted",
      "decision-ready",
      "obvious",
      "coherent",
      "current",
      "shared",
      "verifiable",
      "actionable",
      "consistent",
    ],
  },
  strategy: {
    positive: ["intentional", "coherent", "sequenced", "specific", "grounded"],
    negative: ["wandering", "split", "uncertain", "overbuilt", "improvised"],
    aspiration: [
      "focused",
      "durable",
      "timed",
      "evidence-led",
      "simple",
      "sharp",
      "anchored",
      "credible",
      "practical",
      "compounding",
    ],
  },
};

export const CURRENT_STATE_WORDS: CurrentWord[] = Object.entries(CURRENT_WORD_SETS).flatMap(
  ([theme, set]) => [
    ...set.positive.map((label, index) => ({
      id: `${theme}-positive-${index + 1}`,
      label,
      theme: theme as ThemeId,
      sentiment: "positive" as const,
    })),
    ...set.negative.map((label, index) => ({
      id: `${theme}-negative-${index + 1}`,
      label,
      theme: theme as ThemeId,
      sentiment: "negative" as const,
    })),
  ],
);

export const ASPIRATION_WORDS: AspirationWord[] = Object.entries(CURRENT_WORD_SETS).flatMap(
  ([theme, set]) =>
    set.aspiration.map((label, index) => ({
      id: `${theme}-aspiration-${index + 1}`,
      label,
      theme: theme as ThemeId,
    })),
);

export const APP_CATEGORIES: AppCategory[] = [
  {
    id: "communication",
    label: "Communication",
    options: ["Slack", "Microsoft Teams", "Gmail", "Outlook", "Zoom"].map((label) => ({
      id: `communication-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label,
    })),
  },
  {
    id: "calendar",
    label: "Calendar and meetings",
    options: ["Google Calendar", "Outlook Calendar", "Calendly", "Granola", "Notion Calendar"].map(
      (label) => ({
        id: `calendar-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        label,
      }),
    ),
  },
  {
    id: "documents",
    label: "Documents and knowledge",
    options: ["Google Docs", "Notion", "Coda", "Dropbox", "SharePoint"].map((label) => ({
      id: `documents-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label,
    })),
  },
  {
    id: "project",
    label: "Project and task management",
    options: ["Asana", "ClickUp", "Linear", "Monday", "Trello"].map((label) => ({
      id: `project-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label,
    })),
  },
  {
    id: "crm",
    label: "CRM and pipeline",
    options: ["HubSpot", "Salesforce", "Pipedrive", "Attio", "Close"].map((label) => ({
      id: `crm-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label,
    })),
  },
  {
    id: "finance",
    label: "Finance",
    options: ["QuickBooks", "Xero", "Stripe", "Ramp", "Bill.com"].map((label) => ({
      id: `finance-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label,
    })),
  },
  {
    id: "support",
    label: "Support and service",
    options: ["Zendesk", "Intercom", "Help Scout", "Front", "Gorgias"].map((label) => ({
      id: `support-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label,
    })),
  },
  {
    id: "marketing",
    label: "Marketing",
    options: ["Mailchimp", "ConvertKit", "Klaviyo", "Webflow", "Figma"].map((label) => ({
      id: `marketing-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label,
    })),
  },
  {
    id: "hr",
    label: "HR and people ops",
    options: ["Gusto", "Rippling", "BambooHR", "Lattice", "Deel"].map((label) => ({
      id: `hr-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label,
    })),
  },
  {
    id: "analytics",
    label: "Analytics and reporting",
    options: ["Looker Studio", "Metabase", "Power BI", "Tableau", "Airtable"].map((label) => ({
      id: `analytics-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label,
    })),
  },
];

export const DISC_ROWS: DiscRow[] = [
  {
    id: "disc-1",
    prompt: "In a tense week, I tend to be...",
    options: [
      { id: "disc-1-d", label: "direct and fast", style: "D" },
      { id: "disc-1-i", label: "upbeat and vocal", style: "I" },
      { id: "disc-1-s", label: "steady and supportive", style: "S" },
      { id: "disc-1-c", label: "careful and exact", style: "C" },
    ],
  },
  {
    id: "disc-2",
    prompt: "When a decision is overdue, I usually...",
    options: [
      { id: "disc-2-d", label: "force clarity", style: "D" },
      { id: "disc-2-i", label: "talk it through", style: "I" },
      { id: "disc-2-s", label: "look for alignment", style: "S" },
      { id: "disc-2-c", label: "collect more evidence", style: "C" },
    ],
  },
  {
    id: "disc-3",
    prompt: "In meetings, I am often the one who...",
    options: [
      { id: "disc-3-d", label: "cuts to the call", style: "D" },
      { id: "disc-3-i", label: "creates energy", style: "I" },
      { id: "disc-3-s", label: "holds the room together", style: "S" },
      { id: "disc-3-c", label: "tightens the details", style: "C" },
    ],
  },
  {
    id: "disc-4",
    prompt: "My default pace feels...",
    options: [
      { id: "disc-4-d", label: "urgent", style: "D" },
      { id: "disc-4-i", label: "adaptive", style: "I" },
      { id: "disc-4-s", label: "deliberate", style: "S" },
      { id: "disc-4-c", label: "methodical", style: "C" },
    ],
  },
  {
    id: "disc-5",
    prompt: "What frustrates me most is...",
    options: [
      { id: "disc-5-d", label: "slowness", style: "D" },
      { id: "disc-5-i", label: "coldness", style: "I" },
      { id: "disc-5-s", label: "instability", style: "S" },
      { id: "disc-5-c", label: "sloppiness", style: "C" },
    ],
  },
  {
    id: "disc-6",
    prompt: "When something breaks, I usually...",
    options: [
      { id: "disc-6-d", label: "take charge", style: "D" },
      { id: "disc-6-i", label: "rally people", style: "I" },
      { id: "disc-6-s", label: "stabilize the team", style: "S" },
      { id: "disc-6-c", label: "diagnose the root", style: "C" },
    ],
  },
  {
    id: "disc-7",
    prompt: "My strongest contribution is usually...",
    options: [
      { id: "disc-7-d", label: "momentum", style: "D" },
      { id: "disc-7-i", label: "enthusiasm", style: "I" },
      { id: "disc-7-s", label: "reliability", style: "S" },
      { id: "disc-7-c", label: "precision", style: "C" },
    ],
  },
  {
    id: "disc-8",
    prompt: "I feel most trusted when people see me as...",
    options: [
      { id: "disc-8-d", label: "decisive", style: "D" },
      { id: "disc-8-i", label: "persuasive", style: "I" },
      { id: "disc-8-s", label: "dependable", style: "S" },
      { id: "disc-8-c", label: "thorough", style: "C" },
    ],
  },
  {
    id: "disc-9",
    prompt: "My communication style is usually...",
    options: [
      { id: "disc-9-d", label: "blunt", style: "D" },
      { id: "disc-9-i", label: "expressive", style: "I" },
      { id: "disc-9-s", label: "warm", style: "S" },
      { id: "disc-9-c", label: "measured", style: "C" },
    ],
  },
  {
    id: "disc-10",
    prompt: "My risk posture is usually...",
    options: [
      { id: "disc-10-d", label: "bold", style: "D" },
      { id: "disc-10-i", label: "optimistic", style: "I" },
      { id: "disc-10-s", label: "protective", style: "S" },
      { id: "disc-10-c", label: "cautious", style: "C" },
    ],
  },
  {
    id: "disc-11",
    prompt: "Under pressure, I become more...",
    options: [
      { id: "disc-11-d", label: "controlling", style: "D" },
      { id: "disc-11-i", label: "talkative", style: "I" },
      { id: "disc-11-s", label: "accommodating", style: "S" },
      { id: "disc-11-c", label: "critical", style: "C" },
    ],
  },
  {
    id: "disc-12",
    prompt: "My ideal week feels...",
    options: [
      { id: "disc-12-d", label: "productive", style: "D" },
      { id: "disc-12-i", label: "energizing", style: "I" },
      { id: "disc-12-s", label: "smooth", style: "S" },
      { id: "disc-12-c", label: "well-structured", style: "C" },
    ],
  },
  {
    id: "disc-13",
    prompt: "In conflict, I tend to...",
    options: [
      { id: "disc-13-d", label: "confront", style: "D" },
      { id: "disc-13-i", label: "reframe", style: "I" },
      { id: "disc-13-s", label: "de-escalate", style: "S" },
      { id: "disc-13-c", label: "document", style: "C" },
    ],
  },
  {
    id: "disc-14",
    prompt: "When I delegate, I care most about...",
    options: [
      { id: "disc-14-d", label: "speed", style: "D" },
      { id: "disc-14-i", label: "buy-in", style: "I" },
      { id: "disc-14-s", label: "continuity", style: "S" },
      { id: "disc-14-c", label: "accuracy", style: "C" },
    ],
  },
  {
    id: "disc-15",
    prompt: "People would likely describe me as...",
    options: [
      { id: "disc-15-d", label: "assertive", style: "D" },
      { id: "disc-15-i", label: "engaging", style: "I" },
      { id: "disc-15-s", label: "steadying", style: "S" },
      { id: "disc-15-c", label: "analytical", style: "C" },
    ],
  },
];

export const DISC_STYLE_LABELS: Record<DiscStyle, string> = {
  D: "Dominance",
  I: "Influence",
  S: "Steadiness",
  C: "Conscientiousness",
};
