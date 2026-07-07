import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Check, X, ExternalLink, Inbox } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace-context";
import {
  approveRequest, listApprovals, rejectRequest,
  type ApprovalStatus,
} from "@/lib/approvals";
import { listRecordFiles, type RecordFile } from "@/lib/record-files";

export default function ApprovalsQueue() {
  const { workspace, userEmail } = useWorkspace();
  const [tab, setTab] = useState<ApprovalStatus | "all">("pending");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [filesByItem, setFilesByItem] = useState<Record<string, RecordFile[]>>({});

  const load = async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      const list = await listApprovals(workspace.id, tab);
      setRows(list);
      // Preload linked files per item
      const itemIds = Array.from(new Set(list.map((r: any) => r.item_id))).slice(0, 30);
      const files: Record<string, RecordFile[]> = {};
      for (const iid of itemIds) {
        try { files[iid] = await listRecordFiles({ itemId: iid }); } catch { /* ignore */ }
      }
      setFilesByItem(files);
    } catch (e: any) {
      toast.error(e.message || "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [workspace?.id, tab]);

  const doApprove = async (r: any) => {
    const res = await approveRequest(r, userEmail);
    if (!res.ok) { toast.error(res.error || "Approval failed"); return; }
    toast.success("Approved");
    load();
  };

  const doReject = async (r: any) => {
    if (!rejectNote.trim()) { toast.error("Reject note required"); return; }
    const res = await rejectRequest(r, rejectNote, userEmail);
    if (!res.ok) { toast.error(res.error || "Reject failed"); return; }
    toast.success("Rejected");
    setRejectFor(null); setRejectNote("");
    load();
  };

  return (
    <div>
      <PageHeader title="Approvals" subtitle="Pending decisions for BD" />
      <div className="p-4 space-y-3">
        <div className="flex gap-1 text-xs font-mono">
          {(["pending", "approved", "rejected", "all"] as const).map(t => (
            <button
              key={t}
              className={`px-2 py-1 rounded border ${tab === t ? "border-dossier-brass text-dossier-brass" : "border-border text-muted-foreground"}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="border border-dashed border-border rounded p-8 text-center text-sm text-muted-foreground">
            <Inbox size={20} className="mx-auto mb-2 opacity-50" />
            No {tab === "all" ? "" : tab} approvals.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(r => {
              const it = r.items;
              const files = filesByItem[r.item_id] || [];
              return (
                <div key={r.id} className="border border-border rounded p-3 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-dossier-brass/60 text-dossier-brass">
                          {r.kind}
                        </span>
                        <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          r.status === "pending" ? "border-border text-muted-foreground" :
                          r.status === "approved" ? "border-status-green text-status-green" :
                          "border-destructive text-destructive"
                        }`}>{r.status}</span>
                        <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                          {format(new Date(r.created_at), "MMM d HH:mm")}
                        </span>
                      </div>
                      {it && (
                        <Link to={`/app/items/${it.id}`} className="text-sm font-medium hover:text-dossier-brass flex items-center gap-1">
                          {it.accounts?.name ? `${it.accounts.name} · ` : ""}{it.title}
                          <ExternalLink size={11} />
                        </Link>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground">
                        {r.kind === "state_move" && (
                          <>Move {r.payload?.from_state ? <><code>{r.payload.from_state}</code> → </> : null}<code>{r.payload?.to_state}</code></>
                        )}
                        {r.kind === "send_email" && (
                          <>Send email · <strong>{r.payload?.email_subject || "(no subject)"}</strong>{r.payload?.recipient ? ` → ${r.payload.recipient}` : ""}</>
                        )}
                        {r.kind === "other" && <>{r.payload?.description || "(no description)"}</>}
                      </div>
                      {files.length > 0 && (
                        <div className="mt-1 text-[10px] font-mono text-muted-foreground">
                          files · {files.slice(0, 3).map(f => f.file_name).join(" · ")}{files.length > 3 ? ` +${files.length - 3}` : ""}
                        </div>
                      )}
                      {r.status !== "pending" && r.note && (
                        <div className="mt-1 text-[11px] text-muted-foreground italic border-l-2 border-border pl-2">
                          {r.note}
                        </div>
                      )}
                    </div>
                    {r.status === "pending" && (
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button size="sm" className="h-7" onClick={() => doApprove(r)}>
                          <Check size={12} className="mr-1" /> Approve
                        </Button>
                        <Button variant="outline" size="sm" className="h-7"
                                onClick={() => { setRejectFor(rejectFor === r.id ? null : r.id); setRejectNote(""); }}>
                          <X size={12} className="mr-1" /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                  {rejectFor === r.id && (
                    <div className="border-t border-border pt-2 space-y-2">
                      <textarea
                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs"
                        rows={2}
                        placeholder="Reject reason (required · feeds redo loop)"
                        value={rejectNote}
                        onChange={e => setRejectNote(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => { setRejectFor(null); setRejectNote(""); }}>Cancel</Button>
                        <Button variant="destructive" size="sm" onClick={() => doReject(r)} disabled={!rejectNote.trim()}>
                          Confirm reject
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
