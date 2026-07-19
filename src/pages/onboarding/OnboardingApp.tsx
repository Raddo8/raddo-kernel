import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  CHAPTERS, HARVEST_PROMPT_PLACEHOLDER, loadOrCreateTenant, updateTenant,
  loadIntakeAnswers, saveAnswer, createEscalation, listFiles, uploadFile,
  TOTAL_QUESTIONS, type OnboardingTenant,
} from "@/lib/onboarding-v0";
import { CHAPTER_META, exampleFor } from "@/lib/onboarding-copy";
import { extractWorld } from "@/lib/onboarding-world";
import { useVoiceInput } from "@/hooks/use-voice-input";
import {
  Copy, Upload, ArrowRight, Mic, MicOff, Check, Circle, Pencil, WifiOff,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

type Answers = Record<string, string>;

/**
 * Guided /onboarding flow.
 * URL is the source of truth: ?step=welcome|consent|gate|escalated|intake|review|harvest|claude|connector|done
 * plus ?c=<chapter>&q=<question> when step=intake. Browser back and refresh work everywhere.
 */
export default function OnboardingApp() {
  const [session, setSession] = useState<any>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);
  if (session === undefined) return <OnboardingShell hideBack><div /></OnboardingShell>;
  if (!session) return <SignInScreen />;
  return <FlowShell userId={session.user.id} email={session.user.email || ""} />;
}

// ---------- Sign in / sign up ----------
function SignInScreen() {
  const [mode, setMode] = useState<"signup" | "signin" | "reset">("signup");
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
        if (error) {
          if (/registered|exists/i.test(error.message)) {
            toast.error("That email already has an account. Sign in instead.");
            setMode("signin");
          } else throw error;
        } else {
          toast.success("Account created. You can start now, we'll verify email in the background.");
        }
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Reset link sent. Check your email.");
        setMode("signin");
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingShell percent={2} eyebrow="welcome" title="Create your account" hideBack>
      <h1 className="font-display font-extrabold leading-tight" style={{ fontSize: "clamp(28px, 5vw, 44px)" }}>
        Meet your <span className="dossier-brass-underline">Chief of Business</span>.
      </h1>
      <p className="mt-4 text-dossier-ash" style={{ fontSize: 16, lineHeight: 1.6 }}>
        I'm Taylor. I'll walk you through this. About forty minutes total, and you can pause whenever you like.
        Everything saves as you go.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-5" style={{ maxWidth: 440 }}>
        <div>
          <Label htmlFor="ob-email">Email</Label>
          <Input id="ob-email" type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} className="mt-1 bg-white" autoComplete="email" />
        </div>
        {mode !== "reset" && (
          <div>
            <Label htmlFor="ob-pw">Password</Label>
            <Input id="ob-pw" type="password" required minLength={8} value={password}
              onChange={(e) => setPassword(e.target.value)} className="mt-1 bg-white"
              autoComplete={mode === "signup" ? "new-password" : "current-password"} />
          </div>
        )}
        <Button type="submit" disabled={busy}
          className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600, minHeight: 44 }}>
          {busy ? "One moment..." : mode === "signup" ? "Create account" : mode === "signin" ? "Sign in" : "Send reset link"}
          <ArrowRight size={16} className="ml-2" />
        </Button>
      </form>
      <div className="mt-6 text-sm text-dossier-ash flex flex-wrap gap-x-4 gap-y-2">
        {mode !== "signup" && (
          <button className="underline underline-offset-4 text-dossier-ink-deep" onClick={() => setMode("signup")}>Create an account</button>
        )}
        {mode !== "signin" && (
          <button className="underline underline-offset-4 text-dossier-ink-deep" onClick={() => setMode("signin")}>Sign in</button>
        )}
        {mode !== "reset" && (
          <button className="underline underline-offset-4 text-dossier-ash" onClick={() => setMode("reset")}>Forgot password</button>
        )}
      </div>
    </OnboardingShell>
  );
}

// ---------- Flow shell ----------
function FlowShell({ userId, email }: { userId: string; email: string }) {
  const [tenant, setTenant] = useState<OnboardingTenant | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [saved, setSaved] = useState(false);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const t = await loadOrCreateTenant(userId, email);
        const rows = await loadIntakeAnswers(t.id);
        const flat: Answers = {};
        for (const k of Object.keys(rows)) flat[k] = rows[k].answer || "";
        setAnswers(flat);
        setTenant(t);
        // If URL has no step, resume from tenant.current_step
        if (!params.get("step")) {
          const step = t.current_step === "chapter" ? "intake" : (t.current_step || "welcome");
          setParams({ step }, { replace: true });
        }
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const pct = useMemo(() => {
    let filled = 0;
    for (const c of CHAPTERS) for (const q of c.questions) {
      const v = answers[q.key]; if (v && v.trim()) filled++;
    }
    return Math.round((filled / TOTAL_QUESTIONS) * 100);
  }, [answers]);

  if (!loaded || !tenant) return <OnboardingShell hideBack><div /></OnboardingShell>;

  const step = params.get("step") || "welcome";

  const goto = async (nextStep: string, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(params);
    p.set("step", nextStep);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    if (nextStep !== "intake") { p.delete("c"); p.delete("q"); }
    setParams(p);
    const stepMap: Record<string, string> = {
      intake: "chapter", review: "chapter", claude: "claude_gate", done: "complete",
    };
    const dbStep = stepMap[nextStep] || nextStep;
    try { await updateTenant(tenant.id, { current_step: dbStep as any }); } catch {}
  };

  const setAnswer = (key: string, val: string) => {
    setAnswers((a) => ({ ...a, [key]: val }));
  };

  const persist = async (chapter: number, key: string, val: string) => {
    try {
      await saveAnswer(tenant.id, chapter, key, val);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1400);
    } catch (e: any) {
      if (!online) return; // silently buffer; user sees offline banner
      toast.error(e.message);
    }
  };

  const commonShellProps = { percent: step === "intake" ? pct : undefined, saved };

  return (
    <>
      {!online && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-dossier-ink-deep text-dossier-paper px-4 py-2 rounded flex items-center gap-2 text-xs font-mono">
          <WifiOff size={14} /> Offline. Your answers are held locally and will sync.
        </div>
      )}
      {step === "welcome" && <WelcomeStep tenant={tenant} pct={pct} onNext={() => goto("consent")} {...commonShellProps} />}
      {step === "consent" && <ConsentStep tenant={tenant} setTenant={setTenant} onNext={() => goto("gate")} {...commonShellProps} />}
      {step === "gate" && <GateStep tenant={tenant} setTenant={setTenant} onNext={() => goto("intake", { c: "1", q: "1" })} onEscalate={() => goto("escalated")} {...commonShellProps} />}
      {step === "escalated" && <EscalatedStep />}
      {step === "intake" && (
        <IntakeStep
          tenant={tenant} answers={answers} pct={pct} saved={saved}
          setAnswer={setAnswer} persist={persist} goto={goto} params={params}
          setParams={setParams}
        />
      )}
      {step === "review" && (
        <ReviewStep answers={answers} pct={pct} saved={saved} goto={goto} setParams={setParams} />
      )}
      {step === "harvest" && <HarvestStep tenant={tenant} userId={userId} onNext={() => goto("claude")} {...commonShellProps} />}
      {step === "claude" && <ClaudeStep onNext={() => goto("connector")} {...commonShellProps} />}
      {step === "connector" && <ConnectorStep onNext={() => goto("done")} {...commonShellProps} />}
      {step === "done" && <DoneStep />}
    </>
  );
}

// ---------- Welcome ----------
function WelcomeStep({ tenant, pct, onNext, saved }: { tenant: OnboardingTenant; pct: number; onNext: () => void; saved?: boolean }) {
  const returning = pct > 0;
  return (
    <OnboardingShell eyebrow={returning ? `welcome back` : `welcome`} title="Welcome" hideBack saved={saved} percent={pct || 5}>
      <h1 className="font-display font-extrabold leading-tight" style={{ fontSize: "clamp(28px, 5vw, 44px)" }}>
        {returning ? (
          <>You're <span className="dossier-brass-underline">{pct}% through</span>. Pick up where you left off.</>
        ) : (
          <>Here's the <span className="dossier-brass-underline">path ahead</span>.</>
        )}
      </h1>
      <p className="mt-4 text-dossier-ash" style={{ fontSize: 16, lineHeight: 1.6 }}>
        Three steps. Rough notes are fine. Your Chief will tidy them.
      </p>
      <ol className="mt-10 space-y-6">
        {[
          ["Tell us your world", "Sixty three questions across eleven short chapters. Talk or type."],
          ["Connect your systems", "You'll set up Claude and add the Chief of Business connector."],
          ["Meet your Chief", "Your Chief comes online. You watch progress on your dashboard."],
        ].map(([title, body], i) => (
          <li key={i} className="flex gap-4">
            <span className="font-mono text-dossier-brass-deep text-sm mt-1" style={{ minWidth: 24 }}>{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <h3 className="font-display text-xl font-bold">{title}</h3>
              <p className="text-sm text-dossier-ash mt-1">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-10">
        <Button onClick={onNext}
          className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600, minHeight: 44 }}>
          {returning ? "Continue" : "Begin"} <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </OnboardingShell>
  );
}

// ---------- Consent ----------
function ConsentStep({ tenant, setTenant, onNext, saved }: {
  tenant: OnboardingTenant; setTenant: (t: OnboardingTenant) => void; onNext: () => void; saved?: boolean;
}) {
  const [checked, setChecked] = useState(!!tenant.consent_signed_at);
  const [name, setName] = useState(tenant.consent_signed_name || "");
  const [busy, setBusy] = useState(false);

  const sign = async () => {
    if (!checked || name.trim().length < 2) {
      toast.error("Read it, check the box, and type your full name.");
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
    <OnboardingShell percent={10} eyebrow="consent and scope" title="Consent" saved={saved} wide>
      <h1 className="font-display font-extrabold leading-tight" style={{ fontSize: "clamp(24px, 4vw, 36px)" }}>
        The <span className="dossier-brass-underline">agreement</span>.
      </h1>
      <p className="mt-3 text-dossier-ash" style={{ fontSize: 15 }}>
        Read it, check the box, sign by typing your full name.
      </p>
      <div className="mt-6 border border-dossier-paper-edge rounded bg-white p-4 overflow-auto text-sm leading-relaxed" style={{ height: 288 }}>
        <p className="uppercase text-dossier-ash font-mono text-[10px] tracking-widest mb-3">
          Consent agreement text pending legal final
        </p>
        <p>
          Placeholder consent body. The final language will describe scope of work, data handling,
          confidentiality, and the client's right to walled off areas.
        </p>
        {Array.from({ length: 20 }).map((_, i) => (
          <p key={i} className="mt-3 text-dossier-ash">
            Placeholder paragraph {i + 1}. Replace with counsel's final consent copy before launch.
          </p>
        ))}
      </div>
      <label className="mt-6 flex items-start gap-3 cursor-pointer" style={{ minHeight: 44 }}>
        <Checkbox checked={checked} onCheckedChange={(v) => setChecked(!!v)} className="mt-1" />
        <span className="text-sm">I have read the agreement above and agree to its terms.</span>
      </label>
      <div className="mt-4" style={{ maxWidth: 440 }}>
        <Label htmlFor="sig">Type your full name to sign</Label>
        <Input id="sig" value={name} onChange={(e) => setName(e.target.value)}
          className="mt-1 bg-white" placeholder="Full legal name" />
      </div>
      <div className="mt-8">
        <Button onClick={sign} disabled={busy}
          className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600, minHeight: 44 }}>
          Sign and continue <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </OnboardingShell>
  );
}

// ---------- Gate ----------
function GateStep({ tenant, setTenant, onNext, onEscalate, saved }: {
  tenant: OnboardingTenant; setTenant: (t: OnboardingTenant) => void;
  onNext: () => void; onEscalate: () => void; saved?: boolean;
}) {
  const [flags, setFlags] = useState<Record<string, boolean | null>>({
    sensitive_data: tenant.step0_flags?.sensitive_data ?? null,
    regulated: tenant.step0_flags?.regulated ?? null,
    walled_off: tenant.step0_flags?.walled_off ?? null,
  });
  const [busy, setBusy] = useState(false);

  const questions: [keyof typeof flags, string][] = [
    ["sensitive_data", "Does your business hold customers' financial account data, health information, or legally privileged material?"],
    ["regulated", "Are you in a regulated industry (financial advisory, healthcare, legal, insurance)?"],
    ["walled_off", "Is there anything you'd want fully walled off, where even your chief cannot reach?"],
  ];

  const submit = async () => {
    if (Object.values(flags).some((v) => v === null)) { toast.error("Answer each question."); return; }
    setBusy(true);
    try {
      const t = await updateTenant(tenant.id, { step0_flags: flags });
      setTenant(t);
      const anyYes = Object.entries(flags).some(([, v]) => v === true);
      if (anyYes) {
        const reasons = Object.entries(flags).filter(([, v]) => v === true).map(([k]) => k).join(", ");
        await createEscalation(tenant.id, `Step 0 flags yes: ${reasons}`);
        onEscalate();
      } else onNext();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <OnboardingShell percent={15} eyebrow="three quick questions" title="Setup gate" saved={saved}>
      <h1 className="font-display font-extrabold leading-tight" style={{ fontSize: "clamp(24px, 4vw, 36px)" }}>
        Before we go further.
      </h1>
      <p className="mt-3 text-dossier-ash" style={{ fontSize: 15 }}>
        These three answers decide how we set your workspace up.
      </p>
      <div className="mt-8 space-y-6">
        {questions.map(([key, prompt]) => (
          <div key={key} className="border border-dossier-paper-edge bg-white rounded p-4">
            <p className="text-sm">{prompt}</p>
            <div className="mt-3 flex gap-2">
              {[["Yes", true], ["No", false]].map(([label, val]) => (
                <button key={String(val)}
                  onClick={() => setFlags({ ...flags, [key]: val as boolean })}
                  className={`px-4 rounded text-sm font-mono border transition ${
                    flags[key] === val
                      ? "bg-dossier-ink-deep text-dossier-paper border-dossier-ink-deep"
                      : "bg-white text-dossier-ink-deep border-dossier-paper-edge hover:border-dossier-ink-soft"
                  }`}
                  style={{ minHeight: 44, minWidth: 88 }}>
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
          style={{ borderRadius: 4, fontWeight: 600, minHeight: 44 }}>
          Continue <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </OnboardingShell>
  );
}

function EscalatedStep() {
  return (
    <OnboardingShell percent={20} eyebrow="white glove handling" title="White glove">
      <h1 className="font-display font-extrabold leading-tight" style={{ fontSize: "clamp(24px, 4vw, 36px)" }}>
        Your setup gets <span className="dossier-brass-underline">white glove</span> handling.
      </h1>
      <p className="mt-4 text-dossier-ash" style={{ fontSize: 16 }}>
        Based on what you told us, we'll reach out within one business day to configure your workspace with the
        right containment. In the meantime, nothing more is needed from you.
      </p>
      <p className="mt-6 text-sm text-dossier-ash">
        Need us sooner? Email <a className="underline" href="mailto:cob@chiefofbusiness.ai">cob@chiefofbusiness.ai</a>.
      </p>
    </OnboardingShell>
  );
}

// ---------- Intake (one question per screen) ----------
function IntakeStep({
  tenant, answers, pct, saved, setAnswer, persist, goto, params, setParams,
}: {
  tenant: OnboardingTenant;
  answers: Answers;
  pct: number;
  saved: boolean;
  setAnswer: (k: string, v: string) => void;
  persist: (chapter: number, key: string, val: string) => Promise<void>;
  goto: (step: string, extra?: Record<string, string>) => Promise<void>;
  params: URLSearchParams;
  setParams: (p: URLSearchParams, opts?: any) => void;
}) {
  const cNum = Math.max(1, Math.min(CHAPTERS.length, parseInt(params.get("c") || "1", 10)));
  const qNum = Math.max(1, parseInt(params.get("q") || "1", 10));
  const chapter = CHAPTERS[cNum - 1];
  const qIndex = chapter.questions.findIndex((q) => q.n === qNum);
  const question = chapter.questions[Math.max(0, qIndex)];
  const meta = CHAPTER_META[chapter.n];

  const jump = (c: number, q: number) => {
    const p = new URLSearchParams(params);
    p.set("step", "intake"); p.set("c", String(c)); p.set("q", String(q));
    setParams(p);
    window.scrollTo(0, 0);
  };

  const nextQ = () => {
    const idxInCh = chapter.questions.findIndex((x) => x.n === question.n);
    if (idxInCh + 1 < chapter.questions.length) {
      jump(cNum, chapter.questions[idxInCh + 1].n);
    } else if (cNum < CHAPTERS.length) {
      const next = CHAPTERS[cNum]; jump(next.n, next.questions[0].n);
    } else {
      goto("review");
    }
  };
  const prevQ = () => {
    const idxInCh = chapter.questions.findIndex((x) => x.n === question.n);
    if (idxInCh > 0) jump(cNum, chapter.questions[idxInCh - 1].n);
    else if (cNum > 1) { const p = CHAPTERS[cNum - 2]; jump(p.n, p.questions[p.questions.length - 1].n); }
  };

  // Debounced autosave on keystroke
  const timer = useRef<number | null>(null);
  const val = answers[question.key] || "";
  const onChange = (v: string) => {
    setAnswer(question.key, v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => persist(chapter.n, question.key, v), 600);
  };

  // Voice
  const { supported: voiceSupported, listening, toggle: toggleVoice } = useVoiceInput((t) => {
    const joiner = val && !val.endsWith(" ") ? " " : "";
    onChange((val + joiner + t).trim());
  });

  // Keyboard: Enter advances, Shift+Enter newline
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Persist immediately before leaving
      if (timer.current) { window.clearTimeout(timer.current); }
      persist(chapter.n, question.key, val).finally(() => nextQ());
    }
  };

  const skip = () => {
    if (timer.current) window.clearTimeout(timer.current);
    persist(chapter.n, question.key, "").finally(() => nextQ());
  };

  const world = extractWorld(
    Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { answer: v }])) as any
  );

  return (
    <OnboardingShell
      percent={pct}
      eyebrow={`chapter ${chapter.n} of ${CHAPTERS.length} · about ${meta.minutes} minutes`}
      title={chapter.title}
      onBack={prevQ}
      saved={saved}
      wide
      rail={<ChapterRail cNum={cNum} answers={answers} onJump={(c) => jump(c, CHAPTERS[c - 1].questions[0].n)} />}
      world={<WorldPanel world={world} />}
    >
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        <h2 className="font-display font-bold text-dossier-ink-deep" style={{ fontSize: "clamp(20px, 2.5vw, 26px)" }}>
          {chapter.title}
        </h2>
        <p className="mt-1 text-sm text-dossier-ash italic">{meta.taylor}</p>
        {chapter.note && <p className="mt-2 text-xs text-dossier-brass-deep font-mono uppercase tracking-widest">{chapter.note}</p>}

        <div className="mt-8">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-dossier-brass-deep text-sm" style={{ minWidth: 32 }}>Q{question.n}</span>
            <h1 className="font-display text-dossier-ink-deep font-extrabold"
              style={{ fontSize: "clamp(22px, 3vw, 32px)", lineHeight: 1.25 }}>
              {question.prompt}
            </h1>
          </div>

          <div className="mt-6 relative">
            <Textarea
              autoFocus
              id={question.key}
              value={val}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKey}
              placeholder={exampleFor(question.n)}
              className="bg-white pr-14"
              style={{ minHeight: 140, fontSize: 16, lineHeight: 1.55, borderRadius: 8 }}
            />
            {voiceSupported && (
              <button
                onClick={toggleVoice}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
                className={`absolute top-2 right-2 rounded transition ${
                  listening ? "bg-dossier-brass text-dossier-ink-deep" : "bg-dossier-paper-edge text-dossier-ink-deep hover:bg-dossier-brass"
                }`}
                style={{ width: 44, height: 44 }}
              >
                {listening ? <MicOff size={18} className="mx-auto" /> : <Mic size={18} className="mx-auto" />}
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-dossier-ash">
            Rough notes are fine. Your chief will tidy them. Enter to continue, Shift plus Enter for a new line.
          </p>
        </div>

        <div className="mt-10 flex items-center justify-between gap-3 flex-wrap">
          <button onClick={skip} className="text-sm text-dossier-ash underline underline-offset-4" style={{ minHeight: 44 }}>
            Skip for now
          </button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={prevQ} style={{ minHeight: 44, borderRadius: 4 }}>Previous</Button>
            <Button onClick={() => { if (timer.current) window.clearTimeout(timer.current); persist(chapter.n, question.key, val).finally(nextQ); }}
              className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
              style={{ borderRadius: 4, fontWeight: 600, minHeight: 44 }}>
              Next <ArrowRight size={16} className="ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
}

// ---------- Chapter rail ----------
function ChapterRail({ cNum, answers, onJump }: {
  cNum: number; answers: Answers; onJump: (c: number) => void;
}) {
  return (
    <nav className="sticky top-24 space-y-1 text-sm">
      <p className="font-mono uppercase text-[10px] tracking-widest text-dossier-ash mb-2">Chapters</p>
      {CHAPTERS.map((c) => {
        const total = c.questions.length;
        const done = c.questions.filter((q) => (answers[q.key] || "").trim()).length;
        const complete = done === total;
        const active = c.n === cNum;
        return (
          <button key={c.n} onClick={() => onJump(c.n)}
            className={`w-full text-left flex items-start gap-2 px-2 py-2 rounded transition ${
              active ? "bg-dossier-paper-edge" : "hover:bg-dossier-paper-edge/60"
            }`}>
            <span className="mt-0.5">
              {complete
                ? <Check size={14} className="text-dossier-brass-deep" />
                : <Circle size={14} className={active ? "text-dossier-ink-deep" : "text-dossier-ash"} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block ${active ? "text-dossier-ink-deep font-medium" : "text-dossier-charcoal"}`}
                style={{ fontSize: 13, lineHeight: 1.35 }}>
                {c.n}. {c.title}
              </span>
              <span className="block text-[10px] font-mono text-dossier-ash mt-0.5">{done}/{total}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// ---------- World panel ----------
function WorldPanel({ world }: { world: ReturnType<typeof extractWorld> }) {
  const any = world.entities.length || world.people.length || world.priorities.length || world.systems.length;
  return (
    <div className="sticky top-24 space-y-4">
      <p className="font-mono uppercase text-[10px] tracking-widest text-dossier-brass-deep">Your world</p>
      {!any && (
        <p className="text-xs text-dossier-ash italic">This side panel fills in as you answer.</p>
      )}
      {world.entities.length > 0 && (
        <WorldGroup label="Entities" items={world.entities} />
      )}
      {world.people.length > 0 && (
        <WorldGroup label="People" items={world.people} />
      )}
      {world.priorities.length > 0 && (
        <WorldGroup label="Priorities" items={world.priorities} />
      )}
      {world.systems.length > 0 && (
        <WorldGroup label="Systems" items={world.systems} />
      )}
    </div>
  );
}

function WorldGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
      <p className="text-[10px] font-mono uppercase tracking-widest text-dossier-ash mb-1">{label}</p>
      <div className="space-y-1">
        {items.slice(0, 6).map((s, i) => (
          <div key={i} className="bg-white border border-dossier-paper-edge rounded px-2 py-1 text-xs text-dossier-ink-deep truncate">
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Review ----------
function ReviewStep({ answers, pct, saved, goto, setParams }: {
  answers: Answers;
  pct: number; saved: boolean;
  goto: (step: string, extra?: Record<string, string>) => Promise<void>;
  setParams: (p: URLSearchParams, opts?: any) => void;
}) {
  const skipped: { c: number; qn: number; prompt: string }[] = [];
  for (const c of CHAPTERS) for (const q of c.questions) {
    if (!(answers[q.key] || "").trim()) skipped.push({ c: c.n, qn: q.n, prompt: q.prompt });
  }

  const jumpTo = (c: number, q: number) => {
    const p = new URLSearchParams();
    p.set("step", "intake"); p.set("c", String(c)); p.set("q", String(q));
    setParams(p);
  };

  return (
    <OnboardingShell percent={pct} eyebrow="review everything" title="Review" saved={saved} wide>
      <h1 className="font-display font-extrabold" style={{ fontSize: "clamp(24px, 4vw, 36px)" }}>
        Look it <span className="dossier-brass-underline">over</span>.
      </h1>
      <p className="mt-3 text-dossier-ash">
        Every answer is editable. Click any card to jump back and refine.
      </p>

      {skipped.length > 0 && (
        <div className="mt-8 border border-dossier-paper-edge rounded bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-dossier-brass-deep mb-2">Skipped ({skipped.length})</p>
          <ul className="space-y-1">
            {skipped.slice(0, 12).map((s) => (
              <li key={s.qn} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-dossier-ash">Q{s.qn} · {s.prompt}</span>
                <button onClick={() => jumpTo(s.c, s.qn)} className="text-dossier-ink-deep underline text-xs shrink-0">Answer now</button>
              </li>
            ))}
            {skipped.length > 12 && <li className="text-xs text-dossier-ash">and {skipped.length - 12} more</li>}
          </ul>
        </div>
      )}

      <div className="mt-8 space-y-8">
        {CHAPTERS.map((c) => (
          <section key={c.n}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display font-bold text-dossier-ink-deep" style={{ fontSize: 18 }}>
                {c.n}. {c.title}
              </h2>
              <button onClick={() => jumpTo(c.n, c.questions[0].n)} className="text-xs font-mono uppercase tracking-widest text-dossier-brass-deep">Edit chapter</button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {c.questions.map((q) => {
                const a = (answers[q.key] || "").trim();
                return (
                  <button key={q.key} onClick={() => jumpTo(c.n, q.n)}
                    className="text-left bg-white border border-dossier-paper-edge rounded p-3 hover:border-dossier-brass transition min-w-0">
                    <p className="text-[11px] font-mono text-dossier-ash">Q{q.n}</p>
                    <p className="text-xs text-dossier-charcoal line-clamp-2 mt-0.5">{q.prompt}</p>
                    <p className={`mt-2 text-sm ${a ? "text-dossier-ink-deep" : "text-dossier-ash italic"}`}>
                      {a || "Not yet answered"}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-dossier-brass-deep">
                      <Pencil size={10} /> Edit
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-10 flex items-center justify-between flex-wrap gap-3">
        <Button variant="outline" onClick={() => goto("intake", { c: "1", q: "1" })} style={{ minHeight: 44, borderRadius: 4 }}>
          Back to intake
        </Button>
        <Button onClick={() => goto("harvest")}
          className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600, minHeight: 44 }}>
          Continue <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </OnboardingShell>
  );
}

// ---------- Harvest ----------
function HarvestStep({ tenant, userId, onNext, saved }: {
  tenant: OnboardingTenant; userId: string; onNext: () => void; saved?: boolean;
}) {
  const [files, setFiles] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { listFiles(tenant.id).then(setFiles); }, [tenant.id]);

  const copy = async () => {
    await navigator.clipboard.writeText(HARVEST_PROMPT_PLACEHOLDER);
    toast.success("Prompt copied.");
  };
  const upload = async (kind: string, list: FileList | null) => {
    if (!list || list.length === 0) return;
    const MAX = 50 * 1024 * 1024;
    setBusy(true);
    try {
      for (const f of Array.from(list)) {
        if (f.size > MAX) { toast.error(`${f.name} is over 50MB. Try a smaller file.`); continue; }
        try { await uploadFile(userId, tenant.id, kind, f); }
        catch (e: any) { toast.error(`Upload failed for ${f.name}. Retry?`); }
      }
      setFiles(await listFiles(tenant.id));
    } finally { setBusy(false); }
  };

  return (
    <OnboardingShell percent={80} eyebrow="ai memory" title="AI memory" saved={saved} wide>
      <h1 className="font-display font-extrabold leading-tight" style={{ fontSize: "clamp(24px, 4vw, 34px)" }}>
        If you use ChatGPT, it already knows a lot. Let's <span className="dossier-brass-underline">pull that out cleanly</span>.
      </h1>
      <p className="mt-4 text-dossier-ash" style={{ fontSize: 15 }}>
        Copy the prompt, run it in your assistant, save the reply, and drop it here.
      </p>
      <div className="mt-6 relative bg-white border border-dossier-paper-edge rounded p-4 overflow-auto" style={{ maxHeight: 300 }}>
        <pre className="whitespace-pre-wrap text-xs font-mono text-dossier-ink-deep">{HARVEST_PROMPT_PLACEHOLDER}</pre>
        <Button size="sm" variant="outline" onClick={copy} className="absolute top-2 right-2" style={{ minHeight: 36 }}>
          <Copy size={14} className="mr-1" /> Copy
        </Button>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {[
          ["harvest", "Harvest reply", ".md,.txt,.json"],
          ["claude_export", "Claude export", ".zip,.json"],
          ["gemini_export", "Gemini export", ".zip,.json"],
          ["doc", "Any other doc", ".md,.txt,.zip,.json,.pdf,.docx"],
        ].map(([kind, label, accept]) => (
          <label key={kind} className="border border-dashed border-dossier-paper-edge bg-white rounded p-6 flex flex-col items-center justify-center cursor-pointer hover:border-dossier-brass transition min-w-0"
            style={{ minHeight: 120 }}>
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
              <li key={f.id} className="flex justify-between border-b border-dossier-paper-edge py-1 min-w-0 gap-2">
                <span className="truncate">{f.file_name}</span>
                <span className="text-dossier-ash font-mono text-xs shrink-0">{f.kind}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-10 flex items-center justify-between flex-wrap gap-3">
        <button onClick={onNext} className="text-sm text-dossier-ash underline underline-offset-4" style={{ minHeight: 44 }}>Skip for now</button>
        <Button onClick={onNext}
          className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600, minHeight: 44 }}>
          Continue <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </OnboardingShell>
  );
}

// ---------- Claude gate ----------
function ClaudeStep({ onNext, saved }: { onNext: () => void; saved?: boolean }) {
  const [hasClaude, setHasClaude] = useState<boolean | null>(null);
  return (
    <OnboardingShell percent={90} eyebrow="your chief lives in claude" title="Claude" saved={saved}>
      <h1 className="font-display font-extrabold" style={{ fontSize: "clamp(24px, 4vw, 34px)" }}>
        Your Chief lives inside <span className="dossier-brass-underline">Claude</span>.
      </h1>
      <p className="mt-4 text-dossier-ash">Do you have a Claude account?</p>
      <div className="mt-4 flex gap-2">
        {[["Yes", true], ["No", false]].map(([l, v]) => (
          <button key={String(v)} onClick={() => setHasClaude(v as boolean)}
            className={`px-4 rounded text-sm font-mono border transition ${
              hasClaude === v
                ? "bg-dossier-ink-deep text-dossier-paper border-dossier-ink-deep"
                : "bg-white text-dossier-ink-deep border-dossier-paper-edge hover:border-dossier-ink-soft"
            }`} style={{ minHeight: 44, minWidth: 88 }}>{l as string}</button>
        ))}
      </div>
      {hasClaude === false && (
        <div className="mt-6 border border-dossier-paper-edge bg-white rounded p-4 text-sm">
          Create one at <a className="underline" href="https://claude.ai" target="_blank" rel="noreferrer">claude.ai</a>.
          A paid plan is required for connectors. Come back here when you're signed in.
        </div>
      )}
      {hasClaude === true && (
        <div className="mt-8">
          <Button onClick={onNext}
            className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
            style={{ borderRadius: 4, fontWeight: 600, minHeight: 44 }}>
            Continue to connector <ArrowRight size={16} className="ml-2" />
          </Button>
        </div>
      )}
    </OnboardingShell>
  );
}

// ---------- Connector ----------
function ConnectorStep({ onNext, saved }: { onNext: () => void; saved?: boolean }) {
  const steps = [
    ["Open Claude", "Sign in at claude.ai and open Settings."],
    ["Connectors", "In Settings, click Connectors."],
    ["Add custom connector", "Click Add custom connector."],
    ["Enter the Chief of Business URL", "Paste the URL your operator gave you (provided separately)."],
    ["Sign in", "Use the same email and password you created here."],
  ];
  return (
    <OnboardingShell percent={95} eyebrow="add the connector" title="Connector" saved={saved} wide>
      <h1 className="font-display font-extrabold" style={{ fontSize: "clamp(24px, 4vw, 34px)" }}>
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
          </li>
        ))}
      </ol>
      <div className="mt-10">
        <Button onClick={onNext}
          className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600, minHeight: 44 }}>
          I've added the connector <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </OnboardingShell>
  );
}

// ---------- Done ----------
function DoneStep() {
  const navigate = useNavigate();
  return (
    <OnboardingShell percent={100} eyebrow="you're set" title="You're set">
      <h1 className="font-display font-extrabold" style={{ fontSize: "clamp(28px, 5vw, 44px)" }}>
        Your build <span className="dossier-brass-underline">begins now</span>.
      </h1>
      <p className="mt-4 text-dossier-ash" style={{ fontSize: 16 }}>
        Watch your dashboard. We'll move things forward on our side and update you as stages complete.
      </p>
      <div className="mt-8 flex gap-3 flex-wrap">
        <Button onClick={() => navigate("/onboarding/dashboard")}
          className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600, minHeight: 44 }}>
          Open my dashboard <ArrowRight size={16} className="ml-2" />
        </Button>
        <Link to="/onboarding?step=review" className="inline-flex items-center px-4 rounded text-sm font-mono border border-dossier-paper-edge bg-white hover:border-dossier-ink-soft"
          style={{ minHeight: 44 }}>Review my answers</Link>
      </div>
    </OnboardingShell>
  );
}
