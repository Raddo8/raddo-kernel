/**
 * Onboarding v0 shell: chapter data, tenant helpers, autosave.
 * Client-facing onboarding at /onboarding. Separate from operator app.
 */
import { supabase } from "@/integrations/supabase/client";

export type OnboardingStep =
  | "welcome"
  | "consent"
  | "gate"
  | "escalated"
  | "chapter"
  | "harvest"
  | "claude_gate"
  | "connector"
  | "complete";

export interface Question {
  key: string;   // stable id, e.g. "q1"
  n: number;     // display number 1..63
  prompt: string;
}
export interface Chapter {
  n: number;
  title: string;
  note?: string;
  questions: Question[];
}

const q = (n: number, prompt: string): Question => ({ key: `q${n}`, n, prompt });

export const CHAPTERS: Chapter[] = [
  {
    n: 1, title: "You and your world", questions: [
      q(1, "Full name, and what you like to be called."),
      q(2, "Best email and cell for you."),
      q(3, "The companies or entities this covers (names are enough)."),
      q(4, "Your role in each, in your words."),
      q(5, "Who else, if anyone, will work with your chief?"),
    ],
  },
  {
    n: 2, title: "The business in your own words", questions: [
      q(6, "What does the business actually do? Explain it like I'm a smart friend, not an investor."),
      q(7, "Who buys from you, and why do they pick you over the alternative?"),
      q(8, "How does money actually come in (deals, invoices, subscriptions, commissions)?"),
      q(9, "What stage are you in: starting, growing, steady, turning around, or heading toward exit?"),
      q(10, "Where do you operate (cities, markets, territories)?"),
      q(11, "The origin story in five sentences: how did this come to exist?"),
    ],
  },
  {
    n: 3, title: "Structure and ownership", questions: [
      q(12, "List each entity: name, type (LLC, corp, etc.), state, and what it does."),
      q(13, "Your ownership in each, roughly."),
      q(14, "Who else owns pieces, and how much, roughly."),
      q(15, "Anything in formation, dissolving, or sitting dormant right now?"),
      q(16, "How the entities relate to each other, in plain words."),
    ],
  },
  {
    n: 4, title: "Your people", questions: [
      q(17, "Your team: name, role, and what you actually rely on them for."),
      q(18, "Your outside bench: attorney, CPA, banker, insurance, anyone else you call."),
      q(19, "The five most important business relationships you have, and why each matters."),
      q(20, "Family in or around the business? How?"),
      q(21, "Anyone you're worried about (flight risk, conflict, underperformance)? This stays between us."),
    ],
  },
  {
    n: 5, title: "How you actually work", questions: [
      q(22, "Walk me through a normal week. Where does your time actually go?"),
      q(23, "The three things you do over and over: the recurring processes that run the business."),
      q(24, "How do commitments get tracked today (a system, a notebook, your head)?"),
      q(25, "What does a typical fire look like, and how do you fight it?"),
      q(26, "What meetings recur, and which would you kill if you could?"),
      q(27, "Where does paperwork or admin pile up?"),
    ],
  },
  {
    n: 6, title: "Money rhythm",
    note: "No account numbers or balances here, just how things flow.",
    questions: [
      q(28, "How do you get paid: what triggers it, who pays, how fast?"),
      q(29, "How do people get paid by you (payroll cadence, contractors, distributions)?"),
      q(30, "How do you check the health of the business today (what number, how often)?"),
      q(31, "What reporting exists (monthly P&L? nothing?) and who produces it?"),
      q(32, "Does cash get tight on a rhythm? When?"),
      q(33, "What money decision are you sitting on right now?"),
    ],
  },
  {
    n: 7, title: "Friction and pain", questions: [
      q(34, "What breaks every single week?"),
      q(35, "What do you hate doing but keep doing?"),
      q(36, "If you could hand one whole category of work to a chief tomorrow, what goes first?"),
      q(37, "Where do deals, money, or follow-ups slip through the cracks?"),
      q(38, "What decision have you been circling without closing? List as many as apply."),
      q(39, "What did you try before (tools, hires, consultants) that didn't stick, and why?"),
    ],
  },
  {
    n: 8, title: "Vision, priorities, values", questions: [
      q(40, "One year from now, what does winning look like, in your words?"),
      q(41, "Five years out?"),
      q(42, "Rank what matters most right now (your top 5, your order)."),
      q(43, "What will you NOT sacrifice to get there?"),
      q(44, "Values or lines: things you won't do, ways you won't operate."),
      q(45, "When the business works, what does it make possible in your life?"),
    ],
  },
  {
    n: 9, title: "Working with your chief", questions: [
      q(46, "How do you like information: short and blunt, or full context?"),
      q(47, "Bullets or paragraphs? Numbers or narrative?"),
      q(48, "When you're wrong, how do you want to be told?"),
      q(49, "What communication habits drive you crazy?"),
      q(50, "Morning brief person or end-of-day person? How often is too often?"),
      q(51, "Anything your chief should never say, assume, or joke about?"),
    ],
  },
  {
    n: 10, title: "Your systems", questions: [
      q(52, "Email: what do you use, and how many accounts matter?"),
      q(53, "Calendar: where does your real schedule live?"),
      q(54, "Files: where do documents actually live (Drive, Box, Dropbox, desktop, email)?"),
      q(55, "Accounting: QuickBooks, spreadsheet, bookkeeper, or vibes?"),
      q(56, "CRM or pipeline tool, if any."),
      q(57, "Payroll or HR system, if any."),
      q(58, "Industry-specific software you live in."),
      q(59, "How you communicate with your team (text, Slack, email, yelling across the office)."),
      q(60, "AI tools you already use (ChatGPT, Claude, other), and what for."),
    ],
  },
  {
    n: 11, title: "Last three", questions: [
      q(61, "Ninety days from now, what would make you say \"this was the best operational decision I made this year\"?"),
      q(62, "What's your biggest skepticism about this working?"),
      q(63, "Anything I didn't ask that I should have?"),
    ],
  },
];

export const TOTAL_QUESTIONS = CHAPTERS.reduce((s, c) => s + c.questions.length, 0);

export const HARVEST_PROMPT_PLACEHOLDER = "HARVEST PROMPT INSERTED BY OPERATOR";

// Ordered flow steps for the progress bar
export const FLOW_ORDER: OnboardingStep[] = [
  "welcome", "consent", "gate",
  "chapter",
  "harvest", "claude_gate", "connector", "complete",
];

export function flowPercent(step: OnboardingStep, chapterN?: number): number {
  if (step === "escalated") return 20;
  const idx = FLOW_ORDER.indexOf(step);
  if (idx < 0) return 0;
  // Chapters occupy a large middle band
  if (step === "chapter" && chapterN) {
    const chapFrac = (chapterN - 1) / CHAPTERS.length;
    const base = FLOW_ORDER.indexOf("chapter") / FLOW_ORDER.length;
    const span = 1 / FLOW_ORDER.length;
    return Math.round((base + span * chapFrac) * 100);
  }
  return Math.round((idx / (FLOW_ORDER.length - 1)) * 100);
}

// ---- Data helpers ----

export interface OnboardingTenant {
  id: string;
  user_id: string;
  tenant_key: string;
  status: string;
  consent_signed_at: string | null;
  consent_signed_name: string | null;
  step0_flags: any;
  current_step: OnboardingStep;
  created_at: string;
  updated_at: string;
}

function slugify(input: string): string {
  const base = (input || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "client"}-${suffix}`;
}

export async function loadOrCreateTenant(userId: string, email: string): Promise<OnboardingTenant> {
  const { data: existing } = await (supabase as any)
    .from("onboarding_tenants").select("*").eq("user_id", userId).maybeSingle();
  if (existing) return existing as OnboardingTenant;
  const tenant_key = slugify(email.split("@")[0] || "client");
  const { data, error } = await (supabase as any).from("onboarding_tenants")
    .insert({ user_id: userId, tenant_key, status: "intake", current_step: "welcome" })
    .select("*").single();
  if (error) throw error;
  return data as OnboardingTenant;
}

export async function updateTenant(id: string, patch: Partial<OnboardingTenant>) {
  const { data, error } = await (supabase as any).from("onboarding_tenants")
    .update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data as OnboardingTenant;
}

export async function loadIntakeAnswers(tenantId: string): Promise<Record<string, { answer: string | null; updated_at: string }>> {
  const { data } = await (supabase as any).from("intake_state").select("question_key, answer, updated_at").eq("tenant_id", tenantId);
  const out: Record<string, { answer: string | null; updated_at: string }> = {};
  for (const r of (data as any[]) || []) out[r.question_key] = { answer: r.answer, updated_at: r.updated_at };
  return out;
}

export async function saveAnswer(tenantId: string, chapter: number, question_key: string, answer: string) {
  const { error } = await (supabase as any).from("intake_state")
    .upsert({ tenant_id: tenantId, chapter, question_key, answer }, { onConflict: "tenant_id,question_key" });
  if (error) throw error;
}

export async function createEscalation(tenantId: string, reason: string) {
  await (supabase as any).from("onboarding_escalations").insert({ tenant_id: tenantId, reason });
}

export async function listFiles(tenantId: string) {
  const { data } = await (supabase as any).from("intake_files")
    .select("*").eq("tenant_id", tenantId).order("uploaded_at", { ascending: false });
  return (data as any[]) || [];
}

export async function uploadFile(userId: string, tenantId: string, kind: string, file: File) {
  const path = `${userId}/${tenantId}/${Date.now()}-${file.name}`;
  const { error: upErr } = await supabase.storage.from("onboarding-files").upload(path, file);
  if (upErr) throw upErr;
  const { error } = await (supabase as any).from("intake_files").insert({
    tenant_id: tenantId, kind, file_name: file.name, storage_path: path, size_bytes: file.size,
  });
  if (error) throw error;
}

export function completionPercent(answers: Record<string, { answer: string | null }>): number {
  let filled = 0;
  for (const c of CHAPTERS) for (const q of c.questions) {
    const a = answers[q.key]?.answer;
    if (a && a.trim().length > 0) filled++;
  }
  return Math.round((filled / TOTAL_QUESTIONS) * 100);
}

export const BUILD_STAGES = [
  { key: "intake_complete", label: "Intake complete" },
  { key: "files_received", label: "Files received" },
  { key: "build_in_progress", label: "Build in progress" },
  { key: "review", label: "Review" },
  { key: "go_live", label: "Go live" },
];
