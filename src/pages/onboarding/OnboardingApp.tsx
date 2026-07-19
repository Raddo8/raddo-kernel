import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  CHAPTERS, FLOW_ORDER, flowPercent, HARVEST_PROMPT_PLACEHOLDER,
  loadOrCreateTenant, updateTenant, loadIntakeAnswers, saveAnswer,
  createEscalation, listFiles, uploadFile, TOTAL_QUESTIONS,
  type OnboardingStep, type OnboardingTenant,
} from "@/lib/onboarding-v0";
import { Copy, Upload, ArrowRight, ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

/**
 * Full guided onboarding at /onboarding.
 * Sign in first, then walk the resumable flow via tenant.current_step.
 */
export default function OnboardingApp() {
  const [session, setSession] = useState<any>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);
  if (session === undefined) return <OnboardingShell><div /></OnboardingShell>;
  if (!session) return <SignInScreen />;
  return <FlowRouter userId={session.user.id} email={session.user.email || ""} />;
}

// ---------- Sign in / sign up ----------
function SignInScreen() {
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/onboarding` },
        });
        if (error) throw error;
        toast.success("Account created. Check your email if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingShell percent={5} eyebrow="onboarding · step 1 of 4">
      <h1 className="font-display text-4xl md:text-5xl font-extrabold leading-tight">
        Create your <span className="dossier-brass-underline">account</span>.
      </h1>
      <p className="mt-4 text-base text-dossier-ash">
        {mode === "signup"
          ? "This is the front door to your Chief of Business build. Choose an email and password. You will use the same account inside Claude later."
          : "Welcome back. Sign in to pick up where you left off."}
      </p>
      <form onSubmit={submit} className="mt-8 space-y-5 max-w-md">
        <div>
          <Label htmlFor="ob-email">Email</Label>
          <Input id="ob-email" type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} className="mt-1 bg-white" />
        </div>
        <div>
          <Label htmlFor="ob-pw">Password</Label>
          <Input id="ob-pw" type="password" required minLength={8} value={password}
            onChange={(e) => setPassword(e.target.value)} className="mt-1 bg-white" />
        </div>
        <Button type="submit" disabled={busy}
          className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600 }}>
          {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"} <ArrowRight size={16} className="ml-2" />
        </Button>
      </form>
      <p className="mt-6 text-sm text-dossier-ash">
        {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
        <button className="underline underline-offset-4 text-dossier-ink-deep"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>
          {mode === "signup" ? "Sign in" : "Create an account"}
        </button>
      </p>
    </OnboardingShell>
  );
}

// ---------- Router across steps ----------
function FlowRouter({ userId, email }: { userId: string; email: string }) {
  const [tenant, setTenant] = useState<OnboardingTenant | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    loadOrCreateTenant(userId, email)
      .then(setTenant)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [userId, email]);

  const goto = async (step: OnboardingStep, extra?: Partial<OnboardingTenant>) => {
    if (!tenant) return;
    const next = await updateTenant(tenant.id, { current_step: step, ...(extra || {}) });
    setTenant(next);
  };

  if (loading || !tenant) return <OnboardingShell><div /></OnboardingShell>;
  const step = tenant.current_step;

  switch (step) {
    case "welcome":    return <WelcomeScreen tenant={tenant} onNext={() => goto("consent")} />;
    case "consent":    return <ConsentScreen tenant={tenant} setTenant={setTenant} onNext={() => goto("gate")} />;
    case "gate":       return <GateScreen tenant={tenant} setTenant={setTenant} onNext={() => goto("chapter")} onEscalate={() => goto("escalated")} />;
    case "escalated":  return <EscalatedScreen />;
    case "chapter":    return <ChapterFlow tenant={tenant} onDone={() => goto("harvest")} />;
    case "harvest":    return <HarvestScreen tenant={tenant} userId={userId} onNext={() => goto("claude_gate")} />;
    case "claude_gate":return <ClaudeGateScreen onNext={() => goto("connector")} />;
    case "connector":  return <ConnectorScreen onNext={() => goto("complete")} />;
    case "complete":   return <CompleteScreen />;
    default:           return <WelcomeScreen tenant={tenant} onNext={() => goto("consent")} />;
  }
}

// ---------- Screens ----------
function WelcomeScreen({ tenant, onNext }: { tenant: OnboardingTenant; onNext: () => void }) {
  return (
    <OnboardingShell percent={flowPercent("welcome")} eyebrow={`welcome, ${tenant.tenant_key}`}>
      <h1 className="font-display text-4xl md:text-5xl font-extrabold leading-tight">
        Welcome. Here is the <span className="dossier-brass-underline">path ahead</span>.
      </h1>
      <p className="mt-4 text-base text-dossier-ash">
        Three steps. You can pause any time. Everything you type is saved automatically.
      </p>
      <ol className="mt-10 space-y-5">
        {[
          ["Tell us your world", "A guided interview. Answer in your own words. Skip anything that does not fit."],
          ["Connect your systems", "You will set up Claude and add the Chief of Business connector. Ten minutes, tops."],
          ["Meet your Chief", "Your Chief comes online and starts working. You will watch progress on your dashboard."],
        ].map(([title, body], i) => (
          <li key={i} className="flex gap-4">
            <span className="font-mono text-dossier-brass-deep text-sm mt-1">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h3 className="font-display text-xl font-bold">{title}</h3>
              <p className="text-sm text-dossier-ash mt-1">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-10">
        <Button onClick={onNext}
          className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600 }}>
          Begin <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </OnboardingShell>
  );
}

function ConsentScreen({
  tenant, setTenant, onNext,
}: { tenant: OnboardingTenant; setTenant: (t: OnboardingTenant) => void; onNext: () => void }) {
  const [checked, setChecked] = useState(!!tenant.consent_signed_at);
  const [name, setName] = useState(tenant.consent_signed_name || "");
  const [busy, setBusy] = useState(false);

  const sign = async () => {
    if (!checked || name.trim().length < 2) {
      toast.error("Please read the agreement, check the box, and type your full name.");
      return;
    }
    setBusy(true);
    try {
      const t = await updateTenant(tenant.id, {
        consent_signed_at: new Date().toISOString(),
        consent_signed_name: name.trim(),
      });
      setTenant(t);
      onNext();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <OnboardingShell percent={flowPercent("consent")} eyebrow="consent and scope" wide>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold leading-tight">
        The <span className="dossier-brass-underline">agreement</span>.
      </h1>
      <p className="mt-3 text-base text-dossier-ash">
        Read it, check the box, and sign by typing your full name.
      </p>
      <div className="mt-6 border border-dossier-paper-edge rounded bg-white p-4 h-72 overflow-auto text-sm leading-relaxed">
        <p className="uppercase text-dossier-ash font-mono text-[10px] tracking-widest mb-3">
          CONSENT AGREEMENT TEXT PENDING LEGAL FINAL
        </p>
        <p>
          Placeholder consent body. The final language will describe scope of work, data handling,
          confidentiality, and the client's right to walled-off areas. This block is intentionally
          long so the scrollable behavior is real during preview.
        </p>
        {Array.from({ length: 20 }).map((_, i) => (
          <p key={i} className="mt-3 text-dossier-ash">
            Placeholder paragraph {i + 1}. Replace with counsel's final consent copy before launch.
          </p>
        ))}
      </div>
      <label className="mt-6 flex items-start gap-3 cursor-pointer">
        <Checkbox checked={checked} onCheckedChange={(v) => setChecked(!!v)} className="mt-1" />
        <span className="text-sm">
          I have read the agreement above and agree to its terms.
        </span>
      </label>
      <div className="mt-4 max-w-md">
        <Label htmlFor="sig">Type your full name to sign</Label>
        <Input id="sig" value={name} onChange={(e) => setName(e.target.value)}
          className="mt-1 bg-white" placeholder="Full legal name" />
      </div>
      <div className="mt-8">
        <Button onClick={sign} disabled={busy}
          className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600 }}>
          Sign and continue <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </OnboardingShell>
  );
}

function GateScreen({
  tenant, setTenant, onNext, onEscalate,
}: {
  tenant: OnboardingTenant;
  setTenant: (t: OnboardingTenant) => void;
  onNext: () => void;
  onEscalate: () => void;
}) {
  const [flags, setFlags] = useState<Record<string, boolean | null>>({
    sensitive_data: tenant.step0_flags?.sensitive_data ?? null,
    regulated: tenant.step0_flags?.regulated ?? null,
    walled_off: tenant.step0_flags?.walled_off ?? null,
  });
  const [busy, setBusy] = useState(false);

  const questions: [keyof typeof flags, string][] = [
    ["sensitive_data", "Does your business hold customers' financial account data, health information, or legally privileged material?"],
    ["regulated", "Are you in a regulated industry such as financial advisory, healthcare, legal, or insurance?"],
    ["walled_off", "Is there anything you would want fully walled off where even your chief cannot reach it?"],
  ];

  const submit = async () => {
    if (Object.values(flags).some((v) => v === null)) {
      toast.error("Please answer each question.");
      return;
    }
    setBusy(true);
    try {
      const t = await updateTenant(tenant.id, { step0_flags: flags });
      setTenant(t);
      const anyYes = Object.entries(flags).some(([, v]) => v === true);
      if (anyYes) {
        const reasons = Object.entries(flags).filter(([, v]) => v === true).map(([k]) => k).join(", ");
        await createEscalation(tenant.id, `Step 0 flags yes: ${reasons}`);
        onEscalate();
      } else {
        onNext();
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <OnboardingShell percent={flowPercent("gate")} eyebrow="three quick questions">
      <h1 className="font-display text-3xl md:text-4xl font-extrabold leading-tight">
        Before we go further.
      </h1>
      <p className="mt-3 text-base text-dossier-ash">
        These three answers decide how we set your workspace up. Yes on any of them means we handle it personally.
      </p>
      <div className="mt-8 space-y-6">
        {questions.map(([key, prompt]) => (
          <div key={key} className="border border-dossier-paper-edge bg-white rounded p-4">
            <p className="text-sm">{prompt}</p>
            <div className="mt-3 flex gap-2">
              {[["Yes", true], ["No", false]].map(([label, val]) => (
                <button
                  key={String(val)}
                  onClick={() => setFlags({ ...flags, [key]: val as boolean })}
                  className={`px-4 py-1.5 rounded text-sm font-mono border transition ${
                    flags[key] === val
                      ? "bg-dossier-ink-deep text-dossier-paper border-dossier-ink-deep"
                      : "bg-white text-dossier-ink-deep border-dossier-paper-edge hover:border-dossier-ink-soft"
                  }`}
                >
                  {label as string}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <Button onClick={submit} disabled={busy}
          className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600 }}>
          Continue <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </OnboardingShell>
  );
}

function EscalatedScreen() {
  return (
    <OnboardingShell percent={flowPercent("escalated")} eyebrow="white glove handling">
      <h1 className="font-display text-3xl md:text-4xl font-extrabold leading-tight">
        Your setup gets <span className="dossier-brass-underline">white glove</span> handling.
      </h1>
      <p className="mt-4 text-base text-dossier-ash">
        Based on what you told us, we will reach out within one business day to configure your workspace
        with the right containment. In the meantime you do not need to do anything.
      </p>
      <p className="mt-6 text-sm text-dossier-ash">
        If you need to reach us sooner, email <a className="underline" href="mailto:cob@chiefofbusiness.ai">cob@chiefofbusiness.ai</a>.
      </p>
    </OnboardingShell>
  );
}

function ChapterFlow({ tenant, onDone }: { tenant: OnboardingTenant; onDone: () => void }) {
  const [chapterIdx, setChapterIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    loadIntakeAnswers(tenant.id).then((rows) => {
      const flat: Record<string, string> = {};
      for (const k of Object.keys(rows)) flat[k] = rows[k].answer || "";
      setAnswers(flat);
      // Resume: first chapter that has an unanswered question, else last chapter
      let resume = 0;
      for (let i = 0; i < CHAPTERS.length; i++) {
        const any = CHAPTERS[i].questions.some((q) => !flat[q.key] || !flat[q.key].trim());
        if (any) { resume = i; break; }
        resume = i;
      }
      setChapterIdx(resume);
      setLoaded(true);
    });
  }, [tenant.id]);

  if (!loaded) return <OnboardingShell><div /></OnboardingShell>;
  const chapter = CHAPTERS[chapterIdx];

  const onChange = (key: string, val: string) => setAnswers((a) => ({ ...a, [key]: val }));
  const onBlur = async (key: string) => {
    setSavingKey(key);
    try { await saveAnswer(tenant.id, chapter.n, key, answers[key] || ""); }
    catch (e: any) { toast.error(e.message); }
    finally { setSavingKey(null); }
  };

  const next = () => {
    if (chapterIdx + 1 < CHAPTERS.length) setChapterIdx(chapterIdx + 1);
    else onDone();
    window.scrollTo(0, 0);
  };
  const prev = () => {
    if (chapterIdx > 0) setChapterIdx(chapterIdx - 1);
    window.scrollTo(0, 0);
  };

  return (
    <OnboardingShell
      percent={flowPercent("chapter", chapter.n)}
      eyebrow={`chapter ${chapter.n} of ${CHAPTERS.length}`}
      wide
    >
      <h1 className="font-display text-3xl md:text-4xl font-extrabold leading-tight">
        {chapter.title}
      </h1>
      {chapter.note && (
        <p className="mt-2 text-sm italic text-dossier-ash">{chapter.note}</p>
      )}
      <p className="mt-3 text-sm text-dossier-ash">
        Every question is skippable. Answers save automatically when you tab away.
      </p>
      <div className="mt-8 space-y-6">
        {chapter.questions.map((q) => (
          <div key={q.key}>
            <Label htmlFor={q.key} className="flex gap-2 items-start">
              <span className="font-mono text-dossier-brass-deep text-xs mt-1">{q.n}</span>
              <span className="text-sm font-medium text-dossier-ink-deep">{q.prompt}</span>
            </Label>
            <Textarea
              id={q.key}
              value={answers[q.key] || ""}
              onChange={(e) => onChange(q.key, e.target.value)}
              onBlur={() => onBlur(q.key)}
              className="mt-2 bg-white min-h-[80px]"
              placeholder="Your answer, or leave blank to skip."
            />
            {savingKey === q.key && (
              <span className="text-[10px] font-mono text-dossier-ash">saving…</span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-10 flex items-center justify-between">
        <Button variant="outline" onClick={prev} disabled={chapterIdx === 0}>
          <ArrowLeft size={16} className="mr-2" /> Previous
        </Button>
        <Button onClick={next}
          className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600 }}>
          {chapterIdx + 1 === CHAPTERS.length ? "Finish intake" : "Next chapter"} <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </OnboardingShell>
  );
}

function HarvestScreen({
  tenant, userId, onNext,
}: { tenant: OnboardingTenant; userId: string; onNext: () => void }) {
  const [files, setFiles] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { listFiles(tenant.id).then(setFiles); }, [tenant.id]);

  const copy = async () => {
    await navigator.clipboard.writeText(HARVEST_PROMPT_PLACEHOLDER);
    toast.success("Prompt copied.");
  };
  const upload = async (kind: string, list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      for (const f of Array.from(list)) await uploadFile(userId, tenant.id, kind, f);
      setFiles(await listFiles(tenant.id));
      toast.success("Uploaded.");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <OnboardingShell percent={flowPercent("harvest")} eyebrow="ai memory" wide>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold leading-tight">
        If you use ChatGPT, it already knows a lot about how you work. Let's <span className="dossier-brass-underline">pull that knowledge out cleanly</span>.
      </h1>
      <p className="mt-4 text-base text-dossier-ash">
        Copy the prompt below into ChatGPT (or your assistant of choice). Save the reply as a file. Then drop it here.
      </p>
      <div className="mt-6 relative bg-white border border-dossier-paper-edge rounded p-4">
        <pre className="whitespace-pre-wrap text-sm font-mono text-dossier-ink-deep">{HARVEST_PROMPT_PLACEHOLDER}</pre>
        <Button size="sm" variant="outline" onClick={copy} className="absolute top-2 right-2">
          <Copy size={14} className="mr-1" /> Copy
        </Button>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {[
          ["harvest", "Harvest reply", ".md,.txt,.json"],
          ["claude_export", "Claude export", ".zip,.json"],
          ["gemini_export", "Gemini export", ".zip,.json"],
          ["doc", "Any other doc", ".md,.txt,.zip,.json,.pdf,.docx"],
        ].map(([kind, label, accept]) => (
          <label key={kind} className="border border-dashed border-dossier-paper-edge bg-white rounded p-6 flex flex-col items-center justify-center cursor-pointer hover:border-dossier-brass transition">
            <Upload size={20} className="text-dossier-ash" />
            <span className="mt-2 font-mono text-xs uppercase tracking-widest text-dossier-ink-deep">{label}</span>
            <span className="mt-1 text-[10px] text-dossier-ash">{accept}</span>
            <input type="file" accept={accept} multiple className="hidden"
              onChange={(e) => upload(kind, e.target.files)} disabled={busy} />
          </label>
        ))}
      </div>
      {files.length > 0 && (
        <div className="mt-6">
          <p className="font-mono text-xs uppercase tracking-widest text-dossier-ash mb-2">Uploaded</p>
          <ul className="text-sm space-y-1">
            {files.map((f) => (
              <li key={f.id} className="flex justify-between border-b border-dossier-paper-edge py-1">
                <span>{f.file_name}</span>
                <span className="text-dossier-ash font-mono text-xs">{f.kind}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-10 flex items-center justify-between">
        <button onClick={onNext} className="text-sm text-dossier-ash underline underline-offset-4">
          Skip for now
        </button>
        <Button onClick={onNext}
          className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600 }}>
          Continue <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </OnboardingShell>
  );
}

function ClaudeGateScreen({ onNext }: { onNext: () => void }) {
  const [hasClaude, setHasClaude] = useState<boolean | null>(null);
  return (
    <OnboardingShell percent={flowPercent("claude_gate")} eyebrow="your chief lives inside claude">
      <h1 className="font-display text-3xl md:text-4xl font-extrabold leading-tight">
        Your Chief lives inside <span className="dossier-brass-underline">Claude</span>.
      </h1>
      <p className="mt-4 text-base text-dossier-ash">Do you have a Claude account?</p>
      <div className="mt-4 flex gap-2">
        {[["Yes", true], ["No", false]].map(([l, v]) => (
          <button key={String(v)} onClick={() => setHasClaude(v as boolean)}
            className={`px-4 py-1.5 rounded text-sm font-mono border transition ${
              hasClaude === v
                ? "bg-dossier-ink-deep text-dossier-paper border-dossier-ink-deep"
                : "bg-white text-dossier-ink-deep border-dossier-paper-edge hover:border-dossier-ink-soft"
            }`}>{l as string}</button>
        ))}
      </div>
      {hasClaude === false && (
        <div className="mt-6 border border-dossier-paper-edge bg-white rounded p-4 text-sm">
          <p>Create one at <a className="underline" href="https://claude.ai" target="_blank" rel="noreferrer">claude.ai</a>. A paid plan is required for connectors. Come back here when you are signed in.</p>
        </div>
      )}
      {hasClaude === true && (
        <div className="mt-8">
          <Button onClick={onNext}
            className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
            style={{ borderRadius: 4, fontWeight: 600 }}>
            Continue to connector <ArrowRight size={16} className="ml-2" />
          </Button>
        </div>
      )}
    </OnboardingShell>
  );
}

function ConnectorScreen({ onNext }: { onNext: () => void }) {
  const steps = [
    ["Open Claude", "Sign in at claude.ai and open Settings."],
    ["Connectors", "In Settings, click Connectors."],
    ["Add custom connector", "Click Add custom connector."],
    ["Enter the Chief of Business URL", "Paste the URL your operator gave you (this will be provided separately)."],
    ["Sign in", "Sign in with the same email and password you created here."],
  ];
  return (
    <OnboardingShell percent={flowPercent("connector")} eyebrow="add the connector" wide>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold leading-tight">
        Add the <span className="dossier-brass-underline">connector</span>.
      </h1>
      <ol className="mt-8 space-y-6">
        {steps.map(([title, body], i) => (
          <li key={i} className="border border-dossier-paper-edge bg-white rounded p-4">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-dossier-brass-deep text-sm">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="font-display text-lg font-bold">{title}</h3>
            </div>
            <p className="mt-2 text-sm text-dossier-ash">{body}</p>
            <div className="mt-3 h-32 bg-dossier-paper border border-dashed border-dossier-paper-edge rounded flex items-center justify-center text-dossier-ash font-mono text-[10px] uppercase tracking-widest">
              screenshot placeholder
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-10">
        <Button onClick={onNext}
          className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600 }}>
          I've added the connector <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </OnboardingShell>
  );
}

function CompleteScreen() {
  const navigate = useNavigate();
  return (
    <OnboardingShell percent={100} eyebrow="you're set">
      <h1 className="font-display text-4xl md:text-5xl font-extrabold leading-tight">
        Your build <span className="dossier-brass-underline">begins now</span>.
      </h1>
      <p className="mt-4 text-base text-dossier-ash">
        Watch your dashboard. We will move things forward on our side and update you as stages complete.
      </p>
      <div className="mt-8">
        <Button onClick={() => navigate("/onboarding/dashboard")}
          className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600 }}>
          Open my dashboard <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </OnboardingShell>
  );
}
