import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

type Build = {
  id: string;
  token: string;
  client_id: string;
  title: string;
  sub_type: string;
  storage_path: string;
  version: number;
  revoked: boolean;
  created_at: string;
  expires_at: string | null;
};

const SUB_TYPES = ["App", "Dashboard", "Command Center", "Deck", "Tool"];

// Opaque, URL-safe token (>=16 chars). 24 bytes base64url ≈ 32 chars.
function mintToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "build";
}

function buildUrl(token: string) {
  return `${window.location.origin}/builds/${token}`;
}

export default function BuildsAdmin() {
  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Form state
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [subType, setSubType] = useState("Command Center");
  const [recipient, setRecipient] = useState("");
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [updateBuildId, setUpdateBuildId] = useState<string>("");

  const updateTarget = useMemo(
    () => builds.find((b) => b.id === updateBuildId) ?? null,
    [builds, updateBuildId],
  );

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("builds")
      .select("id, token, client_id, title, sub_type, storage_path, version, revoked, created_at, expires_at")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Failed to load builds", description: error.message, variant: "destructive" });
    setBuilds(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!htmlFile) return toast({ title: "Pick an HTML file" });
    if (!updateTarget && (!clientId.trim() || !title.trim())) {
      return toast({ title: "Client and title are required" });
    }
    setBusy(true);
    try {
      if (updateTarget) {
        // New version: same token, bump version, replace file at a versioned path.
        const version = updateTarget.version + 1;
        const path = `${updateTarget.client_id}/${slug(updateTarget.title)}-v${version}.html`;
        const up = await supabase.storage.from("builds").upload(path, htmlFile, {
          contentType: "text/html",
          upsert: true,
        });
        if (up.error) throw up.error;

        let previewPath: string | undefined;
        if (previewFile) {
          const pp = `${updateTarget.client_id}/${slug(updateTarget.title)}-v${version}.png`;
          const pu = await supabase.storage.from("builds").upload(pp, previewFile, {
            contentType: previewFile.type || "image/png",
            upsert: true,
          });
          if (pu.error) throw pu.error;
          previewPath = pp;
        }

        const patch: Record<string, unknown> = { version, storage_path: path };
        if (previewPath) patch.preview_path = previewPath;
        const upd = await supabase.from("builds").update(patch).eq("id", updateTarget.id);
        if (upd.error) throw upd.error;
        toast({ title: `Published v${version}`, description: buildUrl(updateTarget.token) });
      } else {
        const token = mintToken();
        const path = `${clientId}/${slug(title)}-v1.html`;
        const up = await supabase.storage.from("builds").upload(path, htmlFile, {
          contentType: "text/html",
          upsert: false,
        });
        if (up.error) throw up.error;

        let previewPath: string | null = null;
        if (previewFile) {
          const pp = `${clientId}/${slug(title)}-v1.png`;
          const pu = await supabase.storage.from("builds").upload(pp, previewFile, {
            contentType: previewFile.type || "image/png",
            upsert: false,
          });
          if (pu.error) throw pu.error;
          previewPath = pp;
        }

        const { data: { user } } = await supabase.auth.getUser();
        const ins = await supabase.from("builds").insert({
          token,
          client_id: clientId.trim(),
          title: title.trim(),
          sub_type: subType,
          recipient: recipient.trim() || null,
          storage_path: path,
          preview_path: previewPath,
          access_mode: "open-link",
          created_by: user?.id ?? null,
        });
        if (ins.error) throw ins.error;
        toast({ title: "Build published", description: buildUrl(token) });
      }

      // Reset form
      setHtmlFile(null);
      setPreviewFile(null);
      setUpdateBuildId("");
      setClientId("");
      setTitle("");
      setRecipient("");
      await load();
    } catch (err: any) {
      toast({ title: "Publish failed", description: err.message ?? String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function setRevoked(b: Build, revoked: boolean) {
    const { error } = await supabase.from("builds").update({ revoked }).eq("id", b.id);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    toast({ title: revoked ? "Build revoked" : "Build restored" });
    await load();
  }

  async function copyUrl(token: string) {
    await navigator.clipboard.writeText(buildUrl(token));
    toast({ title: "URL copied" });
  }

  return (
    <div className="space-y-8 p-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-semibold">Builds</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Publish self-contained interactive HTML to <code>chiefofbusiness.ai/builds/&lt;token&gt;</code>.
        </p>
      </header>

      <form onSubmit={publish} className="rounded-lg border p-5 space-y-4 bg-card">
        <h2 className="text-lg font-semibold">
          {updateTarget ? `Upload new version of "${updateTarget.title}"` : "Publish new build"}
        </h2>

        <div className="text-xs rounded border-l-2 border-amber-500 bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-100">
          Open-link build · no raw PII, account numbers, or financials should appear on the page.
        </div>

        {!updateTarget && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="client">Client ID</Label>
              <Input id="client" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="AEL" />
            </div>
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Continuum HUB" />
            </div>
            <div>
              <Label htmlFor="sub">Sub-type</Label>
              <select
                id="sub"
                value={subType}
                onChange={(e) => setSubType(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {SUB_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="recipient">Recipient (optional)</Label>
              <Input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="name@client.com" />
            </div>
          </div>
        )}

        {builds.length > 0 && !updateTarget && (
          <div>
            <Label htmlFor="upd">Or upload as new version of…</Label>
            <select
              id="upd"
              value={updateBuildId}
              onChange={(e) => setUpdateBuildId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— New build —</option>
              {builds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.client_id} · {b.title} (v{b.version})
                </option>
              ))}
            </select>
          </div>
        )}

        {updateTarget && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setUpdateBuildId("")}>
            ← Cancel new-version mode
          </Button>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="html">HTML file</Label>
            <Input id="html" type="file" accept=".html,text/html" onChange={(e) => setHtmlFile(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <Label htmlFor="prev">Preview image (optional)</Label>
            <Input id="prev" type="file" accept="image/png,image/jpeg" onChange={(e) => setPreviewFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <Button type="submit" disabled={busy}>{busy ? "Publishing…" : "Publish"}</Button>
      </form>

      <section>
        <h2 className="text-lg font-semibold mb-3">Published builds</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : builds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No builds yet.</p>
        ) : (
          <div className="space-y-2">
            {builds.map((b) => (
              <div key={b.id} className="rounded-lg border p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium">{b.title} <span className="text-xs text-muted-foreground">· {b.sub_type} · v{b.version}</span></div>
                  <div className="text-xs text-muted-foreground truncate">
                    {b.client_id} · {b.revoked ? <span className="text-red-600">revoked</span> : <span className="text-emerald-600">live</span>} · {buildUrl(b.token)}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => copyUrl(b.token)}>Copy URL</Button>
                  <Button size="sm" variant="outline" onClick={() => window.open(buildUrl(b.token), "_blank")}>Open</Button>
                  <Button size="sm" variant={b.revoked ? "outline" : "destructive"} onClick={() => setRevoked(b, !b.revoked)}>
                    {b.revoked ? "Restore" : "Revoke"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
