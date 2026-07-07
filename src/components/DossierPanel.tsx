import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Mail } from "lucide-react";

interface Props { itemId: string; itemMetadata?: any; accountId?: string | null; }

// Only accept valid CSS hex; reject anything else per ui security hardening.
function safeHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : null;
}

export default function DossierPanel({ itemId, itemMetadata, accountId }: Props) {
  const [notes, setNotes] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [primaryContact, setPrimaryContact] = useState<{ name: string; email: string | null; phone: string | null; role: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("timeline_events")
      .select("id, summary, body, raw_json, occurred_at")
      .eq("item_id", itemId)
      .order("occurred_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (!active) return;
        const byLayer: Record<string, any> = {};
        for (const row of data || []) {
          const layer = (row as any).raw_json?.layer;
          if (!layer) continue;
          if (!byLayer[layer]) byLayer[layer] = row;
        }
        setNotes(byLayer);
        setLoading(false);
      });
    return () => { active = false; };
  }, [itemId]);

  // Live-read the primary contact so the Outreach Kit recipient reflects any
  // edit made elsewhere (contacts table is the single source of truth).
  useEffect(() => {
    if (!accountId) { setPrimaryContact(null); return; }
    let active = true;
    supabase
      .from("contacts")
      .select("name, email, phone, role")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (active) setPrimaryContact(data as any); });
    return () => { active = false; };
  }, [accountId]);

  const md = itemMetadata || {};
  const brand = md.brand || {};
  const modules: string[] = Array.isArray(md.modules) ? md.modules : [];
  const hasAny = notes.L2 || notes.L3 || notes.L4 || modules.length > 0 || md.dossier_ref;

  if (loading) return <div className="p-6 text-xs text-muted-foreground font-mono">Loading dossier…</div>;

  if (!hasAny) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No dossier layers on this pursuit yet.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Header strip */}
      <div className="flex flex-wrap gap-3 text-xs font-mono border border-border rounded p-3 bg-muted/30">
        {md.score != null && <span>score · <strong>{md.score}</strong></span>}
        {md.cohort && <span>cohort · <strong>{md.cohort}</strong></span>}
        {md.source_tag && <span className="truncate max-w-[36ch]">source · {md.source_tag}</span>}
        {md.build_reuse_pct != null && <span>reuse · <strong>{md.build_reuse_pct}%</strong></span>}
        {md.subdomain_slug && <span>slug · <strong>{md.subdomain_slug}</strong></span>}
      </div>

      {md.dossier_ref && (
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <FileText size={12} /> <span className="truncate">{md.dossier_ref}</span>
        </div>
      )}

      {/* Strategy */}
      <section>
        <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">L2 · Strategy</h4>
        {notes.L2 ? (
          <div className="text-sm whitespace-pre-wrap">{notes.L2.body || notes.L2.summary}</div>
        ) : <p className="text-xs text-muted-foreground">No L2 note</p>}
      </section>

      {/* Build Spec */}
      <section>
        <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">L3 · Build Spec</h4>
        {notes.L3 && (
          <div className="text-sm whitespace-pre-wrap mb-3">{notes.L3.body || notes.L3.summary}</div>
        )}
        {modules.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Modules</div>
            <ol className="text-sm space-y-0.5 list-decimal list-inside">
              {modules.map((m, i) => <li key={i}>{m}</li>)}
            </ol>
          </div>
        )}
        {(brand.primary || brand.accent || brand.heading_font || brand.body_font) && (
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Brand</div>
            <div className="flex flex-wrap gap-2">
              {["primary","accent"].map((k) => {
                const hex = safeHex(brand[k]);
                if (!hex) return null;
                return (
                  <div key={k} className="flex items-center gap-2 text-xs font-mono border border-border rounded px-2 py-1">
                    <span className="w-4 h-4 rounded border border-border" style={{ backgroundColor: hex }} />
                    {k} · {hex}
                  </div>
                );
              })}
              {brand.heading_font && (
                <div className="text-xs font-mono border border-border rounded px-2 py-1">heading · {brand.heading_font}</div>
              )}
              {brand.body_font && (
                <div className="text-xs font-mono border border-border rounded px-2 py-1">body · {brand.body_font}</div>
              )}
            </div>
          </div>
        )}
        {!notes.L3 && modules.length === 0 && !brand.primary && (
          <p className="text-xs text-muted-foreground">No L3 spec</p>
        )}
      </section>

      {/* Outreach */}
      <section>
        <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">L4 · Outreach Kit</h4>
        <div className="border border-border rounded p-2 bg-muted/20 mb-3 text-xs font-mono flex items-center gap-2">
          <Mail size={12} className="text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">Recipient:</span>
          {primaryContact ? (
            <span className="truncate">
              {primaryContact.name}
              {primaryContact.role && <span className="text-muted-foreground"> · {primaryContact.role}</span>}
              {primaryContact.email && <span className="text-muted-foreground"> · {primaryContact.email}</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">no primary contact on file</span>
          )}
        </div>
        {notes.L4 ? (
          <div className="text-sm whitespace-pre-wrap">{notes.L4.body || notes.L4.summary}</div>
        ) : <p className="text-xs text-muted-foreground">No L4 note</p>}
      </section>
    </div>
  );
}
