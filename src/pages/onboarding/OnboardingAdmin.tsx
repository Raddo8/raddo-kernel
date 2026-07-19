import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BUILD_STAGES, CHAPTERS, completionPercent } from "@/lib/onboarding-v0";
import { format } from "date-fns";

const ADMIN_EMAILS = ["jake@chiefofbusiness.ai", "jdb1203@gmail.com"];

/**
 * /onboarding/admin — HQ-only admin view.
 * Restricted to specific admin emails. Uses is_onboarding_admin() RLS on read.
 */
export default function OnboardingAdmin() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [tenants, setTenants] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [answers, setAnswers] = useState<Record<string, { answer: string | null; updated_at: string }>>({});
  const [files, setFiles] = useState<any[]>([]);
  const [escalations, setEscalations] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user?.email?.toLowerCase() || "";
      setAuthed(ADMIN_EMAILS.includes(email));
      setReady(true);
      if (ADMIN_EMAILS.includes(email)) await loadAll();
    })();
  }, []);

  const loadAll = async () => {
    const { data } = await (supabase as any).from("onboarding_tenants")
      .select("*").order("created_at", { ascending: false });
    setTenants((data as any[]) || []);
  };

  const openTenant = async (t: any) => {
    setSelected(t);
    const [aRes, fRes, eRes] = await Promise.all([
      (supabase as any).from("intake_state").select("*").eq("tenant_id", t.id),
      (supabase as any).from("intake_files").select("*").eq("tenant_id", t.id).order("uploaded_at", { ascending: false }),
      (supabase as any).from("onboarding_escalations").select("*").eq("tenant_id", t.id).order("created_at", { ascending: false }),
    ]);
    const map: Record<string, { answer: string | null; updated_at: string }> = {};
    for (const r of ((aRes.data as any[]) || [])) map[r.question_key] = { answer: r.answer, updated_at: r.updated_at };
    setAnswers(map);
    setFiles((fRes.data as any[]) || []);
    setEscalations((eRes.data as any[]) || []);
  };

  const setStatus = async (status: string) => {
    if (!selected) return;
    const { error } = await (supabase as any).from("onboarding_tenants").update({ status }).eq("id", selected.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Status → ${status}`);
    await loadAll();
    setSelected({ ...selected, status });
  };

  const downloadFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("onboarding-files").createSignedUrl(path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  // per-chapter metrics
  const chapterMetrics = () => {
    const rows: { chapter: number; title: string; answered: number; skipped: number; firstAt?: string; lastAt?: string; span?: number }[] = [];
    for (const c of CHAPTERS) {
      const keys = c.questions.map((q) => q.key);
      const times: number[] = [];
      let answered = 0;
      for (const k of keys) {
        const a = answers[k];
        if (a && a.answer && a.answer.trim().length > 0) answered++;
        if (a?.updated_at) times.push(new Date(a.updated_at).getTime());
      }
      const skipped = keys.length - answered;
      const firstAt = times.length ? new Date(Math.min(...times)).toISOString() : undefined;
      const lastAt = times.length ? new Date(Math.max(...times)).toISOString() : undefined;
      const span = firstAt && lastAt ? Math.round((new Date(lastAt).getTime() - new Date(firstAt).getTime()) / 1000) : undefined;
      rows.push({ chapter: c.n, title: c.title, answered, skipped, firstAt, lastAt, span });
    }
    return rows;
  };

  if (!ready) return <OnboardingShell><div /></OnboardingShell>;
  if (!authed) {
    return (
      <OnboardingShell eyebrow="restricted">
        <h1 className="font-display text-3xl font-extrabold">Not authorized.</h1>
        <p className="mt-3 text-dossier-ash">This surface is HQ-only.</p>
      </OnboardingShell>
    );
  }

  if (selected) {
    const pct = completionPercent(answers);
    const metrics = chapterMetrics();
    const totalSpan = metrics.reduce((s, m) => s + (m.span || 0), 0);
    return (
      <OnboardingShell wide eyebrow={`tenant · ${selected.tenant_key}`}>
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-3xl font-extrabold">{selected.tenant_key}</h1>
          <button className="text-sm underline underline-offset-4" onClick={() => setSelected(null)}>← All tenants</button>
        </div>
        <p className="text-sm text-dossier-ash mt-1">
          Status: <span className="font-mono">{selected.status}</span> · Intake {pct}% · Created {format(new Date(selected.created_at), "yyyy-MM-dd HH:mm")}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {BUILD_STAGES.map((s) => (
            <Button key={s.key} size="sm" variant={selected.status === s.key ? "default" : "outline"} onClick={() => setStatus(s.key)}>
              {s.label}
            </Button>
          ))}
        </div>

        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Per-chapter metrics</h2>
          <p className="text-xs text-dossier-ash mt-1">Total answering span: {Math.round(totalSpan / 60)} min · Files: {files.length}</p>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-widest text-dossier-ash">
              <tr><th className="py-1">Chapter</th><th>Answered</th><th>Skipped</th><th>Span (s)</th></tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.chapter} className="border-t border-dossier-paper-edge">
                  <td className="py-2">{m.chapter}. {m.title}</td>
                  <td>{m.answered}</td>
                  <td>{m.skipped}</td>
                  <td>{m.span ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Answers</h2>
          {CHAPTERS.map((c) => (
            <div key={c.n} className="mt-4">
              <h3 className="font-mono text-xs uppercase tracking-widest text-dossier-brass-deep">Chapter {c.n} · {c.title}</h3>
              <div className="mt-2 space-y-3">
                {c.questions.map((q) => {
                  const a = answers[q.key]?.answer;
                  return (
                    <div key={q.key} className="border border-dossier-paper-edge bg-white rounded p-3">
                      <p className="text-xs text-dossier-ash">{q.n}. {q.prompt}</p>
                      <p className="mt-1 text-sm whitespace-pre-wrap">{a && a.trim() ? a : <span className="italic text-dossier-ash">skipped</span>}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Files</h2>
          {files.length === 0 ? (
            <p className="text-sm text-dossier-ash mt-2">None uploaded.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {files.map((f) => (
                <li key={f.id} className="flex items-center justify-between border-b border-dossier-paper-edge py-1">
                  <span>{f.file_name} <span className="font-mono text-xs text-dossier-ash ml-2">{f.kind}</span></span>
                  <button className="underline underline-offset-4 text-sm" onClick={() => downloadFile(f.storage_path)}>Download</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Escalations</h2>
          {escalations.length === 0 ? (
            <p className="text-sm text-dossier-ash mt-2">None.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {escalations.map((e) => (
                <li key={e.id} className="border-b border-dossier-paper-edge py-1">
                  <span className="font-mono text-xs text-dossier-ash">{format(new Date(e.created_at), "yyyy-MM-dd HH:mm")}</span>
                  {" "}· {e.reason} · <span className="font-mono text-xs">{e.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell wide eyebrow="onboarding admin">
      <h1 className="font-display text-3xl font-extrabold">Tenants</h1>
      <p className="text-sm text-dossier-ash mt-1">{tenants.length} total</p>
      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-widest text-dossier-ash">
          <tr><th className="py-1">Tenant</th><th>Status</th><th>Step</th><th>Consent</th><th>Created</th></tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.id} className="border-t border-dossier-paper-edge cursor-pointer hover:bg-white" onClick={() => openTenant(t)}>
              <td className="py-2">{t.tenant_key}</td>
              <td className="font-mono text-xs">{t.status}</td>
              <td className="font-mono text-xs">{t.current_step}</td>
              <td className="font-mono text-xs">{t.consent_signed_at ? "signed" : "-"}</td>
              <td className="font-mono text-xs">{format(new Date(t.created_at), "yyyy-MM-dd")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </OnboardingShell>
  );
}
