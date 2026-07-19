import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import {
  BUILD_STAGES, completionPercent, loadIntakeAnswers, loadOrCreateTenant,
  type OnboardingTenant,
} from "@/lib/onboarding-v0";
import { Check, Circle } from "lucide-react";

/**
 * /onboarding/dashboard — client-facing build tracker.
 * Vertical timeline driven by tenant.status; shows intake completion percent.
 */
export default function OnboardingDashboard() {
  const [tenant, setTenant] = useState<OnboardingTenant | null>(null);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user;
      if (!u) return;
      const t = await loadOrCreateTenant(u.id, u.email || "");
      setTenant(t);
      const answers = await loadIntakeAnswers(t.id);
      setPct(completionPercent(answers));
    })();
  }, []);

  if (!tenant) return <OnboardingShell><div /></OnboardingShell>;

  // Map tenant.status → current stage index. Default to first.
  const currentIdx = Math.max(0, BUILD_STAGES.findIndex((s) => s.key === tenant.status));

  return (
    <OnboardingShell eyebrow="your build">
      <h1 className="font-display text-3xl md:text-4xl font-extrabold leading-tight">
        Your Chief is being <span className="dossier-brass-underline">assembled</span>.
      </h1>
      <p className="mt-3 text-sm text-dossier-ash">Intake completion: {pct}%.</p>
      <div className="mt-4 h-1 bg-dossier-paper-edge rounded overflow-hidden">
        <div className="h-full bg-dossier-brass" style={{ width: `${pct}%` }} />
      </div>

      <ol className="mt-10 space-y-6">
        {BUILD_STAGES.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <li key={s.key} className="flex gap-4">
              <div className="flex flex-col items-center">
                {done
                  ? <div className="w-8 h-8 rounded-full bg-dossier-brass flex items-center justify-center"><Check size={16} className="text-dossier-ink-deep" /></div>
                  : active
                    ? <div className="w-8 h-8 rounded-full border-2 border-dossier-brass bg-white" />
                    : <Circle size={32} className="text-dossier-paper-edge" strokeWidth={1.5} />}
                {i < BUILD_STAGES.length - 1 && <div className="w-px flex-1 bg-dossier-paper-edge mt-1" />}
              </div>
              <div className="pb-8">
                <h3 className={`font-display text-lg font-bold ${active ? "text-dossier-ink-deep" : done ? "text-dossier-ink-soft" : "text-dossier-ash"}`}>
                  {s.label}
                </h3>
                {active && <p className="text-sm text-dossier-ash mt-1">In progress.</p>}
                {done && <p className="text-sm text-dossier-ash mt-1">Complete.</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </OnboardingShell>
  );
}
