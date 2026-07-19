import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import {
  BUILD_STAGES, CHAPTERS, completionPercent, loadIntakeAnswers,
  loadOrCreateTenant, listFiles, type OnboardingTenant,
} from "@/lib/onboarding-v0";
import { extractWorld } from "@/lib/onboarding-world";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Check, Circle, ArrowRight, Pencil } from "lucide-react";
import { format } from "date-fns";

/**
 * /onboarding/dashboard — client command center.
 * Verdict, KPI strip, "Your world" drill-down cards, five stage build timeline.
 * Everything clickable, nothing decorative.
 */
export default function OnboardingDashboard() {
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<OnboardingTenant | null>(null);
  const [answers, setAnswers] = useState<Record<string, { answer: string | null; updated_at: string }>>({});
  const [files, setFiles] = useState<any[]>([]);
  const [drawer, setDrawer] = useState<{ open: boolean; kind: string; title: string; items: { label: string; qn?: number; body?: string }[] }>({
    open: false, kind: "", title: "", items: [],
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user;
      if (!u) { navigate("/onboarding"); return; }
      const t = await loadOrCreateTenant(u.id, u.email || "");
      setTenant(t);
      setAnswers(await loadIntakeAnswers(t.id));
      setFiles(await listFiles(t.id));
    })();
  }, [navigate]);

  const pct = useMemo(() => completionPercent(answers), [answers]);
  const chaptersComplete = useMemo(() => {
    return CHAPTERS.filter((c) => c.questions.every((q) => (answers[q.key]?.answer || "").trim())).length;
  }, [answers]);
  const world = useMemo(() => extractWorld(answers), [answers]);

  const currentIdx = tenant ? Math.max(0, BUILD_STAGES.findIndex((s) => s.key === tenant.status)) : 0;

  if (!tenant) return <OnboardingShell hideBack><div /></OnboardingShell>;

  const openDrawer = (kind: "entities" | "people" | "priorities" | "systems") => {
    const map: Record<typeof kind, { title: string; qnums: number[] }> = {
      entities: { title: "Your entities", qnums: [12, 3, 13, 14, 15, 16] },
      people: { title: "Your people", qnums: [17, 18, 19, 20, 21] },
      priorities: { title: "Your priorities", qnums: [42, 40, 41, 43, 44, 45] },
      systems: { title: "Your systems", qnums: [52, 53, 54, 55, 56, 57, 58, 59, 60] },
    };
    const { title, qnums } = map[kind];
    const items = qnums.map((n) => {
      const q = CHAPTERS.flatMap((c) => c.questions).find((qq) => qq.n === n);
      if (!q) return null;
      return { label: q.prompt, qn: n, body: answers[q.key]?.answer || "" };
    }).filter(Boolean) as any;
    setDrawer({ open: true, kind, title, items });
  };

  const editIntake = () => navigate("/onboarding?step=review");

  return (
    <OnboardingShell hideBack title="Dashboard">
      {/* Verdict */}
      <p className="font-mono uppercase text-[10px] tracking-widest text-dossier-brass-deep">verdict</p>
      <h1 className="font-display font-extrabold mt-1 leading-tight" style={{ fontSize: "clamp(26px, 4vw, 40px)" }}>
        Your Chief is in <span className="dossier-brass-underline">build</span>. Here's what we already know.
      </h1>

      {/* KPI strip */}
      <div className="mt-8 grid gap-3 grid-cols-2 md:grid-cols-4">
        <KpiCard label="Intake" value={`${pct}%`} sub="click to review" onClick={editIntake} />
        <KpiCard label="Chapters" value={`${chaptersComplete} / ${CHAPTERS.length}`} sub="complete" onClick={editIntake} />
        <KpiCard label="Files" value={String(files.length)} sub="received" onClick={() => navigate("/onboarding?step=harvest")} />
        <KpiCard label="Stage" value={BUILD_STAGES[currentIdx].label} sub={`${currentIdx + 1} of ${BUILD_STAGES.length}`} onClick={() => document.getElementById("timeline")?.scrollIntoView({ behavior: "smooth" })} />
      </div>

      {/* Your world */}
      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display font-bold text-dossier-ink-deep" style={{ fontSize: 22 }}>Your world</h2>
          <button onClick={editIntake} className="text-xs font-mono uppercase tracking-widest text-dossier-brass-deep">Edit answers</button>
        </div>
        <p className="mt-1 text-sm text-dossier-ash">Click any card to see the answers we've captured.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <WorldCard title="Entities" count={world.entities.length} preview={world.entities.slice(0, 3)} onClick={() => openDrawer("entities")} />
          <WorldCard title="People" count={world.people.length} preview={world.people.slice(0, 3)} onClick={() => openDrawer("people")} />
          <WorldCard title="Priorities" count={world.priorities.length} preview={world.priorities.slice(0, 3)} onClick={() => openDrawer("priorities")} />
          <WorldCard title="Systems" count={world.systems.length} preview={world.systems.slice(0, 3)} onClick={() => openDrawer("systems")} />
        </div>
      </section>

      {/* Timeline */}
      <section id="timeline" className="mt-14">
        <h2 className="font-display font-bold text-dossier-ink-deep" style={{ fontSize: 22 }}>Build timeline</h2>
        <p className="mt-1 text-sm text-dossier-ash">Where your build is now and what happens next.</p>
        <ol className="mt-6 space-y-6">
          {BUILD_STAGES.map((s, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            const explainer = STAGE_EXPLAINER[s.key] || "";
            const ts = i === currentIdx ? format(new Date(tenant.updated_at), "MMM d, HH:mm") : done ? format(new Date(tenant.created_at), "MMM d") : "";
            return (
              <li key={s.key} className="flex gap-4">
                <div className="flex flex-col items-center">
                  {done
                    ? <div className="rounded-full bg-dossier-brass flex items-center justify-center" style={{ width: 32, height: 32 }}><Check size={16} className="text-dossier-ink-deep" /></div>
                    : active
                      ? <div className="rounded-full border-2 border-dossier-brass bg-white" style={{ width: 32, height: 32 }} />
                      : <Circle size={32} className="text-dossier-paper-edge" strokeWidth={1.5} />}
                  {i < BUILD_STAGES.length - 1 && <div className="w-px flex-1 bg-dossier-paper-edge mt-1" />}
                </div>
                <div className="pb-8 min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <h3 className={`font-display font-bold ${active ? "text-dossier-ink-deep" : done ? "text-dossier-ink-soft" : "text-dossier-ash"}`} style={{ fontSize: 17 }}>
                      {s.label}
                    </h3>
                    {ts && <span className="font-mono text-[10px] uppercase tracking-widest text-dossier-ash">{ts}</span>}
                  </div>
                  <p className="text-sm text-dossier-ash mt-1">{explainer}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Quiet contact */}
      <section className="mt-12 border-t border-dossier-paper-edge pt-6">
        <p className="text-sm text-dossier-ash">
          Questions? <a className="underline text-dossier-ink-deep" href="mailto:cob@chiefofbusiness.ai">cob@chiefofbusiness.ai</a>
        </p>
        <div className="mt-4">
          <Link to="/onboarding?step=review" className="inline-flex items-center gap-2 text-sm text-dossier-ink-deep underline">
            Continue intake <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* Drill-down drawer */}
      <Sheet open={drawer.open} onOpenChange={(v) => setDrawer({ ...drawer, open: v })}>
        <SheetContent side="right" className="bg-dossier-paper w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-display text-dossier-ink-deep">{drawer.title}</SheetTitle>
            <SheetDescription>Your answers, as you gave them.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {drawer.items.map((it, i) => (
              <div key={i} className="border border-dossier-paper-edge bg-white rounded p-3">
                <p className="text-[11px] font-mono text-dossier-ash">Q{it.qn}</p>
                <p className="text-xs text-dossier-charcoal mt-0.5">{it.label}</p>
                <p className={`mt-2 text-sm ${it.body ? "text-dossier-ink-deep" : "text-dossier-ash italic"}`}>
                  {it.body || "Not yet answered"}
                </p>
                <button
                  onClick={() => navigate(`/onboarding?step=intake&c=${chapterOf(it.qn!)}&q=${it.qn}`)}
                  className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-dossier-brass-deep"
                >
                  <Pencil size={10} /> Edit
                </button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </OnboardingShell>
  );
}

const STAGE_EXPLAINER: Record<string, string> = {
  intake_complete: "You've told us your world. We're indexing your answers and pulling files into a private workspace.",
  files_received: "We're reading your uploads and building the memory layer your Chief will use on day one.",
  build_in_progress: "Your Chief is being wired to Claude and configured with your systems, rhythms, and preferences.",
  review: "We're doing an internal review pass, then a walkthrough with you before flipping the switch.",
  go_live: "Your Chief is live. Your first morning brief is scheduled.",
};

function KpiCard({ label, value, sub, onClick }: { label: string; value: string; sub: string; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="text-left bg-white border border-dossier-paper-edge rounded p-4 hover:border-dossier-brass transition min-w-0"
      style={{ minHeight: 88 }}>
      <p className="font-mono text-[10px] uppercase tracking-widest text-dossier-ash">{label}</p>
      <p className="font-display font-extrabold text-dossier-ink-deep mt-1 truncate" style={{ fontSize: 22 }}>{value}</p>
      <p className="text-[11px] text-dossier-ash mt-1">{sub}</p>
    </button>
  );
}

function WorldCard({ title, count, preview, onClick }: { title: string; count: number; preview: string[]; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="text-left bg-white border border-dossier-paper-edge rounded p-4 hover:border-dossier-brass transition min-w-0"
      style={{ minHeight: 140 }}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-dossier-brass-deep">{title}</p>
        <span className="font-mono text-xs text-dossier-ash">{count}</span>
      </div>
      {preview.length === 0 ? (
        <p className="mt-3 text-xs text-dossier-ash italic">Nothing captured yet. Continue intake.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {preview.map((p, i) => (
            <li key={i} className="text-sm text-dossier-ink-deep truncate">· {p}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[10px] font-mono uppercase tracking-widest text-dossier-ash">Open</p>
    </button>
  );
}

function chapterOf(qn: number): number {
  for (const c of CHAPTERS) if (c.questions.some((q) => q.n === qn)) return c.n;
  return 1;
}
