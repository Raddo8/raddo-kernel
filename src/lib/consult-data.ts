// CONSULT WORD SETS v5 · 9 buckets · 153 chips.
// 16 theme tags. 9 category buckets. Each chip declares both — theme drives
// the warm-start classifier (DISC + emotion), category drives bucket UI and
// the focus signal. Full replacement: zero duplicate labels by construction.

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
  | "strategy"
  | "self"
  | "marketing"
  | "ai"
  | "customers"
  | "culture"
  | "risk";

export type Category =
  | "money"
  | "market_position"
  | "strategy"
  | "operations"
  | "systems"
  | "customers"
  | "people"
  | "culture"
  | "risk"
  | "ai"
  | "you";

export type DiscStyle = "D" | "I" | "S" | "C";

export type CurrentWord = {
  id: string;
  label: string;
  theme: ThemeId;
  sentiment: "positive" | "negative";
  category: Category;
};

export type AspirationWord = {
  id: string;
  label: string;
  theme: ThemeId;
  category: Category;
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

// Bucket display order: MONEY · MARKET POSITION · STRATEGY · OPERATIONS ·
// SYSTEMS · CUSTOMERS · PEOPLE · CULTURE · RISK · AI · YOU
export const CATEGORY_ORDER: Category[] = [
  "money",
  "market_position",
  "strategy",
  "operations",
  "systems",
  "customers",
  "people",
  "culture",
  "risk",
  "ai",
  "you",
];

export const CATEGORY_LABELS: Record<Category, string> = {
  money: "MONEY",
  market_position: "MARKET POSITION",
  strategy: "STRATEGY · DIRECTION",
  operations: "OPERATIONS",
  systems: "SYSTEMS",
  customers: "CUSTOMERS",
  people: "PEOPLE",
  culture: "CULTURE",
  risk: "RISK",
  ai: "AI",
  you: "YOU",
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
  { id: "self", label: "Self", prompt: "How are you holding up personally?" },
  { id: "marketing", label: "Marketing", prompt: "How present are you in the market?" },
  { id: "ai", label: "AI", prompt: "Where do you stand on AI leverage?" },
  { id: "customers", label: "Customers", prompt: "How do customers behave after the first sale?" },
  { id: "culture", label: "Culture", prompt: "What does it feel like to work here?" },
  { id: "risk", label: "Risk", prompt: "How protected is the business?" },
];

// Slug helper · stable id from label.
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

type CurrentSpec = { theme: ThemeId; sentiment: "positive" | "negative"; labels: string[] };
type AspirationSpec = { theme: ThemeId; labels: string[] };

const CURRENT_BY_CATEGORY: Record<Category, CurrentSpec[]> = {
  money: [
    { theme: "cash", sentiment: "negative", labels: ["bleeding cash", "feast-or-famine", "undercharging", "runway-tight", "margin-thin"] },
    { theme: "cash", sentiment: "positive", labels: ["profitable"] },
    { theme: "sales", sentiment: "negative", labels: ["dry pipeline", "stalled deals", "discounting"] },
    { theme: "sales", sentiment: "positive", labels: ["steady demand"] },
  ],
  market_position: [
    { theme: "marketing", sentiment: "negative", labels: ["no marketing engine", "invisible in the market", "undifferentiated", "wasted ad spend"] },
    { theme: "marketing", sentiment: "positive", labels: ["known brand"] },
    { theme: "ai", sentiment: "negative", labels: ["behind on AI", "AI tools collecting dust"] },
    { theme: "strategy", sentiment: "negative", labels: ["no game plan", "stuck at a ceiling"] },
    { theme: "strategy", sentiment: "positive", labels: ["clear positioning"] },
  ],
  operations: [
    { theme: "delivery", sentiment: "negative", labels: ["dropping balls", "inconsistent", "rework", "deadlines slip", "rushed", "no playbooks", "quality dipping", "ad hoc"] },
    { theme: "delivery", sentiment: "positive", labels: ["reliable", "repeatable"] },
  ],
  systems: [
    { theme: "systems", sentiment: "negative", labels: ["duct-taped", "everything's manual", "scattered tools", "in my head", "breaks under load"] },
    { theme: "visibility", sentiment: "negative", labels: ["blind spots", "no dashboard", "finding out late"] },
    { theme: "systems", sentiment: "positive", labels: ["documented"] },
    { theme: "visibility", sentiment: "positive", labels: ["tracked"] },
  ],
  people: [
    { theme: "people", sentiment: "negative", labels: ["short-staffed", "doing it all myself", "can't delegate", "key-person risk", "wrong seats"] },
    { theme: "people", sentiment: "positive", labels: ["strong team"] },
    { theme: "leadership", sentiment: "negative", labels: ["bottlenecked on me", "no accountability", "micromanaging"] },
    { theme: "leadership", sentiment: "positive", labels: ["aligned"] },
  ],
  you: [
    { theme: "self", sentiment: "negative", labels: ["burned out", "running on fumes", "in over my head", "grinding nonstop"] },
    { theme: "self", sentiment: "positive", labels: ["sharp"] },
    { theme: "capacity", sentiment: "negative", labels: ["maxed out", "firefighting"] },
    { theme: "clarity", sentiment: "negative", labels: ["flying blind", "guessing"] },
    { theme: "clarity", sentiment: "positive", labels: ["decisive"] },
  ],
  customers: [
    { theme: "customers", sentiment: "negative", labels: ["losing customers", "high churn", "one-and-done buyers", "complaints piling up", "no referrals", "slipping retention", "customers going quiet", "low NPS"] },
    { theme: "customers", sentiment: "positive", labels: ["loyal customers", "repeat buyers"] },
  ],
  culture: [
    { theme: "culture", sentiment: "negative", labels: ["low trust", "gossip", "fear of speaking up", "burnout culture", "us vs them", "walking on eggshells", "no energy in the room", "going through the motions"] },
    { theme: "culture", sentiment: "positive", labels: ["candid culture", "team energy"] },
  ],
  risk: [
    { theme: "risk", sentiment: "negative", labels: ["legal exposure", "no contracts", "regulatory gaps", "cyber-vulnerable", "no succession plan", "key-person disaster", "IP undocumented", "uninsured"] },
    { theme: "risk", sentiment: "positive", labels: ["protected", "well-papered"] },
  ],
};

const ASPIRATION_BY_CATEGORY: Record<Category, AspirationSpec[]> = {
  money: [
    { theme: "cash", labels: ["predictable revenue", "margin-safe", "paying myself well", "cash cushion"] },
    { theme: "sales", labels: ["full pipeline", "in demand", "pulling ahead"] },
  ],
  market_position: [
    { theme: "marketing", labels: ["known for something", "differentiated", "market-leading"] },
    { theme: "ai", labels: ["AI as edge", "AI-augmented"] },
    { theme: "strategy", labels: ["ahead of the market", "clear plan"] },
  ],
  operations: [
    { theme: "delivery", labels: ["on time every time", "clockwork", "consistent quality", "dependable output", "scales clean", "repeatable wins", "nothing slips"] },
  ],
  systems: [
    { theme: "systems", labels: ["connected", "automated", "one source of truth", "self-running", "built to scale"] },
    { theme: "visibility", labels: ["full visibility", "real-time numbers"] },
  ],
  people: [
    { theme: "people", labels: ["A-team", "runs without me", "leaders I trust", "deep bench"] },
    { theme: "leadership", labels: ["accountable team", "decisions pushed down", "I lead not manage"] },
  ],
  you: [
    { theme: "self", labels: ["in command", "clear-headed", "doing my best work"] },
    { theme: "capacity", labels: ["breathing room", "real time off"] },
    { theme: "clarity", labels: ["data-backed", "confident calls"] },
  ],
  customers: [
    { theme: "customers", labels: ["sticky customers", "raving fans", "high retention", "customers for life", "referrals flowing", "high LTV", "easy renewals"] },
  ],
  culture: [
    { theme: "culture", labels: ["high-trust culture", "energy you can feel", "everyone's engaged", "magnet for talent", "candid + kind", "world-class place to work", "culture people stay for"] },
  ],
  risk: [
    { theme: "risk", labels: ["bulletproof", "regulatory-clear", "succession-ready", "cyber-secure", "insured", "audit-ready", "sleep-at-night"] },
  ],
};

export const CURRENT_STATE_WORDS: CurrentWord[] = (Object.keys(CURRENT_BY_CATEGORY) as Category[])
  .flatMap((category) =>
    CURRENT_BY_CATEGORY[category].flatMap((spec) =>
      spec.labels.map((label) => ({
        id: `cur-${slug(label)}`,
        label,
        theme: spec.theme,
        sentiment: spec.sentiment,
        category,
      })),
    ),
  );

export const ASPIRATION_WORDS: AspirationWord[] = (Object.keys(ASPIRATION_BY_CATEGORY) as Category[])
  .flatMap((category) =>
    ASPIRATION_BY_CATEGORY[category].flatMap((spec) =>
      spec.labels.map((label) => ({
        id: `asp-${slug(label)}`,
        label,
        theme: spec.theme,
        category,
      })),
    ),
  );


// ─────────────────────────────────────────────────────────────────────────────
// TOOLS INVENTORY v2 · 14 categories · 140 chips · slug + domain for logos.
// Replaces v1 wholesale. APP_CATEGORIES is derived for legacy callers
// (consult-analysis.appOptionIndex etc.) — id = `${categoryId}-${slug}`.
// ─────────────────────────────────────────────────────────────────────────────

export type Tool = { name: string; slug: string; domain: string };
export type ToolCategory = { id: string; label: string; tools: Tool[] };

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: "communication",
    label: "Communication",
    tools: [
      { name: "Slack", slug: "slack", domain: "slack.com" },
      { name: "Microsoft Teams", slug: "microsoftteams", domain: "teams.microsoft.com" },
      { name: "Zoom", slug: "zoom", domain: "zoom.us" },
      { name: "Google Meet", slug: "googlemeet", domain: "meet.google.com" },
      { name: "Gmail", slug: "gmail", domain: "gmail.com" },
      { name: "Outlook", slug: "microsoftoutlook", domain: "outlook.com" },
      { name: "Discord", slug: "discord", domain: "discord.com" },
      { name: "WhatsApp Business", slug: "whatsapp", domain: "business.whatsapp.com" },
      { name: "RingCentral", slug: "ringcentral", domain: "ringcentral.com" },
      { name: "Dialpad", slug: "dialpad", domain: "dialpad.com" },
    ],
  },
  {
    id: "meetings",
    label: "Meetings & scheduling",
    tools: [
      { name: "Google Calendar", slug: "googlecalendar", domain: "calendar.google.com" },
      { name: "Outlook Calendar", slug: "microsoftoutlook", domain: "outlook.live.com" },
      { name: "Apple Calendar", slug: "apple", domain: "apple.com" },
      { name: "Notion Calendar", slug: "notion", domain: "notion.so" },
      { name: "Calendly", slug: "calendly", domain: "calendly.com" },
      { name: "Cal.com", slug: "caldotcom", domain: "cal.com" },
      { name: "Acuity Scheduling", slug: "acuityscheduling", domain: "acuityscheduling.com" },
      { name: "Chili Piper", slug: "chilipiper", domain: "chilipiper.com" },
      { name: "SavvyCal", slug: "savvycal", domain: "savvycal.com" },
      { name: "Motion", slug: "motion", domain: "usemotion.com" },
    ],
  },
  {
    id: "docs",
    label: "Documents & knowledge",
    tools: [
      { name: "Google Docs", slug: "googledocs", domain: "docs.google.com" },
      { name: "Microsoft 365", slug: "microsoft", domain: "microsoft365.com" },
      { name: "Notion", slug: "notion", domain: "notion.so" },
      { name: "OneDrive", slug: "microsoftonedrive", domain: "onedrive.com" },
      { name: "SharePoint", slug: "microsoftsharepoint", domain: "sharepoint.com" },
      { name: "Dropbox", slug: "dropbox", domain: "dropbox.com" },
      { name: "Box", slug: "box", domain: "box.com" },
      { name: "Confluence", slug: "confluence", domain: "atlassian.com" },
      { name: "Coda", slug: "coda", domain: "coda.io" },
      { name: "Obsidian", slug: "obsidian", domain: "obsidian.md" },
    ],
  },
  {
    id: "project",
    label: "Project & task management",
    tools: [
      { name: "Asana", slug: "asana", domain: "asana.com" },
      { name: "ClickUp", slug: "clickup", domain: "clickup.com" },
      { name: "Linear", slug: "linear", domain: "linear.app" },
      { name: "Monday", slug: "mondaydotcom", domain: "monday.com" },
      { name: "Trello", slug: "trello", domain: "trello.com" },
      { name: "Jira", slug: "jira", domain: "atlassian.com" },
      { name: "Basecamp", slug: "basecamp", domain: "basecamp.com" },
      { name: "Smartsheet", slug: "smartsheet", domain: "smartsheet.com" },
      { name: "Wrike", slug: "wrike", domain: "wrike.com" },
      { name: "Shortcut", slug: "shortcut", domain: "shortcut.com" },
    ],
  },
  {
    id: "crm",
    label: "CRM & sales",
    tools: [
      { name: "HubSpot", slug: "hubspot", domain: "hubspot.com" },
      { name: "Salesforce", slug: "salesforce", domain: "salesforce.com" },
      { name: "Pipedrive", slug: "pipedrive", domain: "pipedrive.com" },
      { name: "Attio", slug: "attio", domain: "attio.com" },
      { name: "Close", slug: "close", domain: "close.com" },
      { name: "Zoho CRM", slug: "zoho", domain: "zoho.com" },
      { name: "Go High Level", slug: "gohighlevel", domain: "gohighlevel.com" },
      { name: "Folk", slug: "folk", domain: "folk.app" },
      { name: "Apollo", slug: "apollo", domain: "apollo.io" },
      { name: "Outreach", slug: "outreach", domain: "outreach.io" },
    ],
  },
  {
    id: "finance",
    label: "Finance & accounting",
    tools: [
      { name: "QuickBooks", slug: "quickbooks", domain: "quickbooks.intuit.com" },
      { name: "Xero", slug: "xero", domain: "xero.com" },
      { name: "Stripe", slug: "stripe", domain: "stripe.com" },
      { name: "Ramp", slug: "ramp", domain: "ramp.com" },
      { name: "Brex", slug: "brex", domain: "brex.com" },
      { name: "Mercury", slug: "mercury", domain: "mercury.com" },
      { name: "Bill.com", slug: "billdotcom", domain: "bill.com" },
      { name: "NetSuite", slug: "netsuite", domain: "netsuite.com" },
      { name: "FreshBooks", slug: "freshbooks", domain: "freshbooks.com" },
      { name: "Expensify", slug: "expensify", domain: "expensify.com" },
    ],
  },
  {
    id: "support",
    label: "Support & customer service",
    tools: [
      { name: "Zendesk", slug: "zendesk", domain: "zendesk.com" },
      { name: "Intercom", slug: "intercom", domain: "intercom.com" },
      { name: "Help Scout", slug: "helpscout", domain: "helpscout.com" },
      { name: "Front", slug: "front", domain: "front.com" },
      { name: "Gorgias", slug: "gorgias", domain: "gorgias.com" },
      { name: "Freshdesk", slug: "freshdesk", domain: "freshdesk.com" },
      { name: "Salesforce Service Cloud", slug: "salesforce", domain: "salesforce.com" },
      { name: "Kustomer", slug: "kustomer", domain: "kustomer.com" },
      { name: "Drift", slug: "drift", domain: "drift.com" },
      { name: "Crisp", slug: "crisp", domain: "crisp.chat" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing & advertising",
    tools: [
      { name: "Mailchimp", slug: "mailchimp", domain: "mailchimp.com" },
      { name: "Kit (ConvertKit)", slug: "convertkit", domain: "kit.com" },
      { name: "Klaviyo", slug: "klaviyo", domain: "klaviyo.com" },
      { name: "ActiveCampaign", slug: "activecampaign", domain: "activecampaign.com" },
      { name: "Substack", slug: "substack", domain: "substack.com" },
      { name: "Beehiiv", slug: "beehiiv", domain: "beehiiv.com" },
      { name: "Google Ads", slug: "googleads", domain: "ads.google.com" },
      { name: "Meta Ads", slug: "meta", domain: "business.facebook.com" },
      { name: "Ahrefs", slug: "ahrefs", domain: "ahrefs.com" },
      { name: "SEMrush", slug: "semrush", domain: "semrush.com" },
    ],
  },
  {
    id: "hr",
    label: "HR & people ops",
    tools: [
      { name: "Gusto", slug: "gusto", domain: "gusto.com" },
      { name: "Rippling", slug: "rippling", domain: "rippling.com" },
      { name: "BambooHR", slug: "bamboohr", domain: "bamboohr.com" },
      { name: "Lattice", slug: "lattice", domain: "lattice.com" },
      { name: "Deel", slug: "deel", domain: "deel.com" },
      { name: "ADP", slug: "adp", domain: "adp.com" },
      { name: "Paychex", slug: "paychex", domain: "paychex.com" },
      { name: "Greenhouse", slug: "greenhouse", domain: "greenhouse.io" },
      { name: "Lever", slug: "lever", domain: "lever.co" },
      { name: "15Five", slug: "15five", domain: "15five.com" },
    ],
  },
  {
    id: "analytics",
    label: "Analytics & reporting",
    tools: [
      { name: "Looker Studio", slug: "looker", domain: "lookerstudio.google.com" },
      { name: "Metabase", slug: "metabase", domain: "metabase.com" },
      { name: "Power BI", slug: "powerbi", domain: "powerbi.microsoft.com" },
      { name: "Tableau", slug: "tableau", domain: "tableau.com" },
      { name: "Airtable", slug: "airtable", domain: "airtable.com" },
      { name: "Google Analytics", slug: "googleanalytics", domain: "analytics.google.com" },
      { name: "Mixpanel", slug: "mixpanel", domain: "mixpanel.com" },
      { name: "Amplitude", slug: "amplitude", domain: "amplitude.com" },
      { name: "Hotjar", slug: "hotjar", domain: "hotjar.com" },
      { name: "Segment", slug: "segment", domain: "segment.com" },
    ],
  },
  {
    id: "ai",
    label: "AI tools",
    tools: [
      { name: "ChatGPT", slug: "openai", domain: "chatgpt.com" },
      { name: "Claude", slug: "anthropic", domain: "claude.ai" },
      { name: "Gemini", slug: "googlegemini", domain: "gemini.google.com" },
      { name: "Microsoft Copilot", slug: "microsoft", domain: "copilot.microsoft.com" },
      { name: "Perplexity", slug: "perplexity", domain: "perplexity.ai" },
      { name: "Notion AI", slug: "notion", domain: "notion.so" },
      { name: "Cursor", slug: "cursor", domain: "cursor.com" },
      { name: "Midjourney", slug: "midjourney", domain: "midjourney.com" },
      { name: "ElevenLabs", slug: "elevenlabs", domain: "elevenlabs.io" },
      { name: "GitHub Copilot", slug: "github", domain: "github.com" },
    ],
  },
  {
    id: "automation",
    label: "Automation & integration",
    tools: [
      { name: "Zapier", slug: "zapier", domain: "zapier.com" },
      { name: "Make (Integromat)", slug: "make", domain: "make.com" },
      { name: "n8n", slug: "n8n", domain: "n8n.io" },
      { name: "Workato", slug: "workato", domain: "workato.com" },
      { name: "Pipedream", slug: "pipedream", domain: "pipedream.com" },
      { name: "Tray.io", slug: "tray", domain: "tray.io" },
      { name: "IFTTT", slug: "ifttt", domain: "ifttt.com" },
      { name: "Power Automate", slug: "microsoft", domain: "powerautomate.microsoft.com" },
      { name: "Bardeen", slug: "bardeen", domain: "bardeen.ai" },
      { name: "Airtable Automations", slug: "airtable", domain: "airtable.com" },
    ],
  },
  {
    id: "social",
    label: "Social & content",
    tools: [
      { name: "LinkedIn", slug: "linkedin", domain: "linkedin.com" },
      { name: "X (Twitter)", slug: "x", domain: "x.com" },
      { name: "Instagram", slug: "instagram", domain: "instagram.com" },
      { name: "Facebook", slug: "facebook", domain: "facebook.com" },
      { name: "YouTube", slug: "youtube", domain: "youtube.com" },
      { name: "TikTok", slug: "tiktok", domain: "tiktok.com" },
      { name: "Buffer", slug: "buffer", domain: "buffer.com" },
      { name: "Hootsuite", slug: "hootsuite", domain: "hootsuite.com" },
      { name: "Canva", slug: "canva", domain: "canva.com" },
      { name: "Sprout Social", slug: "sproutsocial", domain: "sproutsocial.com" },
    ],
  },
  {
    id: "meeting_ai",
    label: "Meeting & call AI",
    tools: [
      { name: "Granola", slug: "granola", domain: "granola.ai" },
      { name: "Otter.ai", slug: "otter", domain: "otter.ai" },
      { name: "Fireflies.ai", slug: "fireflies", domain: "fireflies.ai" },
      { name: "tl;dv", slug: "tldv", domain: "tldv.io" },
      { name: "Read.ai", slug: "readai", domain: "read.ai" },
      { name: "Fathom", slug: "fathom", domain: "fathom.video" },
      { name: "Krisp", slug: "krisp", domain: "krisp.ai" },
      { name: "Loom", slug: "loom", domain: "loom.com" },
      { name: "Vidyard", slug: "vidyard", domain: "vidyard.com" },
      { name: "Avoma", slug: "avoma", domain: "avoma.com" },
    ],
  },
];

// Derived legacy shape · keeps consult-analysis.appOptionIndex working.
export const APP_CATEGORIES: AppCategory[] = TOOL_CATEGORIES.map((category) => ({
  id: category.id,
  label: category.label,
  options: category.tools.map((tool) => ({
    id: `${category.id}-${tool.slug}`,
    label: tool.name,
  })),
}));

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
