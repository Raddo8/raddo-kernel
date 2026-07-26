import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import NotFound from "@/pages/NotFound";
import { decodeSurfaceBody, gzipBase64, sha256Hex, type SurfaceKey } from "@/lib/surface";
import { lineDiff, type DiffLine } from "@/lib/line-diff";

type VersionRow = {
  id: string;
  surface_key: string;
  version: string;
  state: string;
  bytes: number | null;
  sha256: string | null;
  author: string | null;
  reason: string | null;
  created_at: string;
};

type PinRow = { cid: string; surface_key: string; version: string | null; held: boolean | null };
type TenantRow = { cid: string; display_name: string | null };

type TargetMode = "single" | "cohort" | "fleet";

const SURFACE_KEYS: SurfaceKey[] = ["hq", "panel"];

const eyebrow = "font-mono uppercase text-dossier-brass-deep";
const eyebrowStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.22em",
  fontWeight: 700,
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="bg-white"
      style={{ border: "1px solid hsl(var(--dossier-paper-edge))", borderRadius: 8, padding: 20 }}
    >
      <p className={eyebrow} style={{ ...eyebrowStyle, marginBottom: 14 }}>
        {title}
      </p>
      {children}
    </section>
  );
}

export default function SurfacesAdmin() {
  const [operator, setOperator] = useState<boolean | undefined>(undefined);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [pins, setPins] = useState<PinRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState<string>("");

  // Upload form
  const [upKey, setUpKey] = useState<SurfaceKey>("hq");
  const [upVersion, setUpVersion] = useState("");
  const [upReason, setUpReason] = useState("");
  const [upFile, setUpFile] = useState<File | null>(null);
  const [upError, setUpError] = useState<string | null>(null);

  // Release controls
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [diffOpened, setDiffOpened] = useState<Record<string, boolean>>({});
  const [diff, setDiff] = useState<DiffLine[] | null>(null);
  const [targetMode, setTargetMode] = useState<TargetMode>("single");
  const [singleCid, setSingleCid] = useState<string>("");
  const [cohort, setCohort] = useState<string[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [dryReport, setDryReport] = useState<string[] | null>(null);

  useEffect(() => {
    supabase.rpc("is_cob_operator").then(({ data }) => setOperator(data === true));
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const load = useCallback(async () => {
    const [v, p, t] = await Promise.all([
      supabase
        .from("surface_version")
        .select("id, surface_key, version, state, bytes, sha256, author, reason, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("surface_pin").select("cid, surface_key, version, held"),
      supabase.from("tenants").select("cid, display_name").order("cid"),
    ]);
    setVersions((v.data as VersionRow[] | null) ?? []);
    setPins((p.data as PinRow[] | null) ?? []);
    setTenants((t.data as TenantRow[] | null) ?? []);
  }, []);

  useEffect(() => {
    if (operator) void load();
  }, [operator, load]);

  const selected = useMemo(
    () => versions.find((v) => v.id === selectedId) ?? null,
    [versions, selectedId],
  );

  const publishedFor = useCallback(
    (key: string) => versions.find((v) => v.surface_key === key && v.state === "published") ?? null,
    [versions],
  );

  const pinCount = useCallback(
    (key: string, version: string) =>
      pins.filter((p) => p.surface_key === key && p.version === version).length,
    [pins],
  );

  const tenantName = useCallback(
    (cid: string) => tenants.find((t) => t.cid === cid)?.display_name ?? "unnamed",
    [tenants],
  );

  const targetCids = useMemo<string[]>(() => {
    if (!selected) return [];
    const scoped = pins.filter((p) => p.surface_key === selected.surface_key).map((p) => p.cid);
    if (targetMode === "fleet") return scoped;
    if (targetMode === "cohort") return cohort.filter((c) => scoped.includes(c));
    return singleCid && scoped.includes(singleCid) ? [singleCid] : [];
  }, [selected, pins, targetMode, cohort, singleCid]);

  const blast = useMemo(() => {
    if (!selected) return null;
    const scoped = pins.filter((p) => p.surface_key === selected.surface_key);
    const current = publishedFor(selected.surface_key);
    const onCurrent = current ? scoped.filter((p) => p.version === current.version) : [];
    const targets = scoped.filter((p) => targetCids.includes(p.cid));
    return {
      currentVersion: current?.version ?? null,
      onCurrentCount: onCurrent.length,
      moving: targets.filter((p) => !p.held && p.version !== selected.version),
      held: targets.filter((p) => p.held),
      ahead: targets.filter((p) => !p.held && p.version === selected.version),
    };
  }, [selected, pins, publishedFor, targetCids]);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setUpError(null);
    if (!upFile) return setUpError("Pick an .html file.");
    if (!upVersion.trim()) return setUpError("A version string is required.");
    if (!upReason.trim()) return setUpError("A reason is required before a draft can be created.");
    if (versions.some((v) => v.surface_key === upKey && v.version === upVersion.trim())) {
      return setUpError(`Version "${upVersion.trim()}" already exists for surface "${upKey}".`);
    }
    setBusy(true);
    try {
      const text = await upFile.text();
      const sha = await sha256Hex(text);
      const body = await gzipBase64(text);
      const { error } = await supabase.from("surface_version").insert({
        surface_key: upKey,
        version: upVersion.trim(),
        body,
        encoding: "gzip+base64",
        sha256: sha,
        bytes: new TextEncoder().encode(text).length,
        state: "draft",
        author: email,
        reason: upReason.trim(),
      });
      if (error) throw error;
      toast({ title: "Draft created", description: `${upKey} · ${upVersion.trim()}` });
      setUpVersion("");
      setUpReason("");
      setUpFile(null);
      await load();
    } catch (err) {
      setUpError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onCompare(row: VersionRow) {
    setSelectedId(row.id);
    setDiff(null);
    const current = publishedFor(row.surface_key);
    if (!current) {
      setDiffOpened((s) => ({ ...s, [row.id]: true }));
      return;
    }
    setBusy(true);
    try {
      const [a, b] = await Promise.all([
        supabase.from("surface_version").select("body, encoding").eq("id", current.id).maybeSingle(),
        supabase.from("surface_version").select("body, encoding").eq("id", row.id).maybeSingle(),
      ]);
      if (!a.data?.body || !b.data?.body) throw new Error("Could not read one of the versions.");
      const before = await decodeSurfaceBody(a.data.body, a.data.encoding);
      const after = await decodeSurfaceBody(b.data.body, b.data.encoding);
      setDiff(lineDiff(before, after));
      setDiffOpened((s) => ({ ...s, [row.id]: true }));
    } catch (err) {
      toast({
        title: "Compare failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  function buildDryReport(row: VersionRow): string[] {
    const scoped = pins.filter((p) => p.surface_key === row.surface_key);
    return scoped.map((p) => {
      const name = `${p.cid} · ${tenantName(p.cid)}`;
      if (!targetCids.includes(p.cid)) return `${name} → stays on ${p.version ?? "none"} (not targeted)`;
      if (p.held) return `${name} → stays on ${p.version ?? "none"} (held)`;
      if (p.version === row.version) return `${name} → already on ${row.version}`;
      return `${name} → would resolve to ${row.version}`;
    });
  }

  async function movePins(row: VersionRow, mode: "publish" | "rollback") {
    if (!targetCids.length) {
      return toast({ title: "No target selected", description: "Choose at least one tenant." });
    }
    if (dryRun) {
      setDryReport(buildDryReport(row));
      return toast({ title: "Dry run · nothing written" });
    }
    setBusy(true);
    try {
      if (mode === "publish") {
        const current = publishedFor(row.surface_key);
        if (current && current.id !== row.id) {
          const sup = await supabase
            .from("surface_version")
            .update({ state: "superseded" })
            .eq("id", current.id);
          if (sup.error) throw sup.error;
        }
        const pub = await supabase
          .from("surface_version")
          .update({ state: "published", published_at: new Date().toISOString() })
          .eq("id", row.id);
        if (pub.error) throw pub.error;
      }

      const movable = pins
        .filter((p) => p.surface_key === row.surface_key && targetCids.includes(p.cid) && !p.held)
        .map((p) => p.cid);

      if (movable.length) {
        const upd = await supabase
          .from("surface_pin")
          .update({ version: row.version, pinned_at: new Date().toISOString() })
          .eq("surface_key", row.surface_key)
          .in("cid", movable);
        if (upd.error) throw upd.error;
      }

      toast({
        title: mode === "publish" ? "Published" : "Rolled back",
        description: `${movable.length} pin(s) moved to ${row.version}`,
      });
      setDryReport(null);
      await load();
    } catch (err) {
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function toggleHold(pin: PinRow) {
    const { error } = await supabase
      .from("surface_pin")
      .update({ held: !pin.held })
      .eq("cid", pin.cid)
      .eq("surface_key", pin.surface_key);
    if (error) {
      return toast({ title: "Hold failed", description: error.message, variant: "destructive" });
    }
    await load();
  }

  if (operator === undefined) return null;
  if (!operator) return <NotFound />;

  const grouped = SURFACE_KEYS.map((key) => ({
    key,
    rows: versions.filter((v) => v.surface_key === key),
  }));

  return (
    <div className="min-h-screen bg-dossier-paper p-8 space-y-6">
      <header>
        <p className={eyebrow} style={eyebrowStyle}>
          operator · surfaces
        </p>
        <h1
          className="font-display text-dossier-ink-deep mt-2"
          style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}
        >
          Surface releases
        </h1>
        <p className="mt-3 text-sm text-dossier-ash">
          Publishing moves a pin. It does not push a file.
        </p>
      </header>

      <Panel title="upload · new draft">
        <form onSubmit={onUpload} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Surface key</Label>
            <RadioGroup
              value={upKey}
              onValueChange={(v) => setUpKey(v as SurfaceKey)}
              className="flex gap-6"
            >
              {SURFACE_KEYS.map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <RadioGroupItem value={k} id={`up-${k}`} />
                  <Label htmlFor={`up-${k}`} className="font-mono text-xs uppercase">
                    {k}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="up-version">Version</Label>
            <Input
              id="up-version"
              value={upVersion}
              onChange={(e) => setUpVersion(e.target.value)}
              placeholder="2026.0726.1200"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="up-file">Document (.html)</Label>
            <Input
              id="up-file"
              type="file"
              accept=".html,text/html"
              onChange={(e) => setUpFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="up-reason">Reason (required)</Label>
            <Textarea
              id="up-reason"
              rows={2}
              value={upReason}
              onChange={(e) => setUpReason(e.target.value)}
            />
          </div>
          {upError && (
            <p className="md:col-span-2 text-sm text-destructive font-mono">{upError}</p>
          )}
          <div className="md:col-span-2">
            <Button type="submit" disabled={busy}>
              Create draft
            </Button>
          </div>
        </form>
      </Panel>

      {grouped.map(({ key, rows }) => (
        <Panel key={key} title={`versions · ${key}`}>
          {rows.length === 0 && <p className="text-sm text-dossier-ash">No versions yet.</p>}
          <div className="space-y-2">
            {rows.map((row) => {
              const current = publishedFor(row.surface_key);
              const firstPublish = !current;
              const gateOpen = firstPublish || diffOpened[row.id] === true;
              return (
                <div
                  key={row.id}
                  className="p-3 text-sm"
                  style={{
                    border: "1px solid hsl(var(--dossier-paper-edge))",
                    borderRadius: 4,
                    background:
                      selectedId === row.id ? "hsl(var(--dossier-paper))" : "transparent",
                  }}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-dossier-ink-deep">{row.version}</span>
                    <span className="font-mono text-xs uppercase tracking-wider text-dossier-brass-deep">
                      {row.state}
                    </span>
                    <span className="font-mono text-xs text-dossier-ash">
                      {row.bytes ?? 0} b · {(row.sha256 ?? "").slice(0, 8)} ·{" "}
                      {pinCount(row.surface_key, row.version)} pinned
                    </span>
                    <span className="text-xs text-dossier-ash">
                      {row.author ?? "unknown"} · {new Date(row.created_at).toLocaleString()}
                    </span>
                    <div className="ml-auto flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => onCompare(row)} disabled={busy}>
                        Compare
                      </Button>
                      {row.state === "draft" && (
                        <Button
                          size="sm"
                          disabled={busy || !gateOpen || selectedId !== row.id}
                          onClick={() => movePins(row, "publish")}
                        >
                          {firstPublish ? "First publish" : dryRun ? "Publish (dry run)" : "Publish"}
                        </Button>
                      )}
                      {row.state === "superseded" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || selectedId !== row.id}
                          onClick={() => movePins(row, "rollback")}
                        >
                          {dryRun ? "Roll back (dry run)" : "Roll back"}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setSelectedId(row.id)}>
                        Select
                      </Button>
                    </div>
                  </div>
                  {row.reason && (
                    <p className="mt-2 text-xs text-dossier-ash">{row.reason}</p>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      ))}

      {diff && (
        <Panel title="diff · published vs draft">
          <pre
            className="font-mono text-xs overflow-auto"
            style={{ maxHeight: 380, lineHeight: 1.5 }}
          >
            {diff.map((l, i) => (
              <div
                key={i}
                style={{
                  color:
                    l.kind === "add"
                      ? "hsl(var(--dossier-ink-deep))"
                      : l.kind === "del"
                        ? "hsl(var(--dossier-brass-deep))"
                        : "hsl(var(--dossier-ash))",
                }}
              >
                {l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}
                {l.text}
              </div>
            ))}
          </pre>
        </Panel>
      )}

      {selected && (
        <Panel title="target set">
          <RadioGroup
            value={targetMode}
            onValueChange={(v) => setTargetMode(v as TargetMode)}
            className="flex gap-6 mb-4"
          >
            {(["single", "cohort", "fleet"] as TargetMode[]).map((m) => (
              <div key={m} className="flex items-center gap-2">
                <RadioGroupItem value={m} id={`tm-${m}`} />
                <Label htmlFor={`tm-${m}`} className="font-mono text-xs uppercase">
                  {m}
                </Label>
              </div>
            ))}
          </RadioGroup>

          {targetMode === "single" && (
            <select
              className="w-full rounded border bg-white p-2 font-mono text-sm"
              style={{ borderColor: "hsl(var(--dossier-paper-edge))" }}
              value={singleCid}
              onChange={(e) => setSingleCid(e.target.value)}
            >
              <option value="">Select a tenant…</option>
              {pins
                .filter((p) => p.surface_key === selected.surface_key)
                .map((p) => (
                  <option key={p.cid} value={p.cid}>
                    {p.cid} · {tenantName(p.cid)}
                  </option>
                ))}
            </select>
          )}

          {targetMode === "cohort" && (
            <div className="grid gap-2 md:grid-cols-2">
              {pins
                .filter((p) => p.surface_key === selected.surface_key)
                .map((p) => (
                  <label key={p.cid} className="flex items-center gap-2 text-sm font-mono">
                    <Checkbox
                      checked={cohort.includes(p.cid)}
                      onCheckedChange={(c) =>
                        setCohort((s) => (c === true ? [...s, p.cid] : s.filter((x) => x !== p.cid)))
                      }
                    />
                    {p.cid} · {tenantName(p.cid)}
                  </label>
                ))}
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <Switch id="dry" checked={dryRun} onCheckedChange={setDryRun} />
            <Label htmlFor="dry" className="text-sm">
              Dry run · writes nothing
            </Label>
          </div>
        </Panel>
      )}

      {selected && blast && (
        <Panel title="blast radius">
          <ul className="text-sm space-y-1 font-mono">
            <li className="text-dossier-ash">
              current published: {blast.currentVersion ?? "none"} · {blast.onCurrentCount} tenant(s)
            </li>
            <li className="text-dossier-ink-deep">
              would move ({blast.moving.length}):{" "}
              {blast.moving.map((p) => `${p.cid} · ${tenantName(p.cid)}`).join(", ") || "none"}
            </li>
            <li className="text-dossier-brass-deep">
              held, will not move ({blast.held.length}):{" "}
              {blast.held.map((p) => `${p.cid} · ${tenantName(p.cid)}`).join(", ") || "none"}
            </li>
            <li className="text-dossier-ash">
              already on this version ({blast.ahead.length}):{" "}
              {blast.ahead.map((p) => `${p.cid} · ${tenantName(p.cid)}`).join(", ") || "none"}
            </li>
          </ul>
        </Panel>
      )}

      {dryReport && (
        <Panel title="dry run · resolved next load">
          <ul className="text-xs font-mono space-y-1 text-dossier-ash">
            {dryReport.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="holds">
        <div className="space-y-2">
          {pins.length === 0 && <p className="text-sm text-dossier-ash">No pins.</p>}
          {pins.map((p) => (
            <div
              key={`${p.cid}-${p.surface_key}`}
              className="flex items-center gap-3 text-sm font-mono"
            >
              <Switch checked={p.held === true} onCheckedChange={() => toggleHold(p)} />
              <span className="text-dossier-ink-deep">{p.cid}</span>
              <span className="text-dossier-ash">{tenantName(p.cid)}</span>
              <span className="text-xs uppercase tracking-wider text-dossier-brass-deep">
                {p.surface_key}
              </span>
              <span className="text-xs text-dossier-ash">{p.version ?? "none"}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
