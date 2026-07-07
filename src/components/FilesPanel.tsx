/**
 * FilesPanel — attachments block for account/pursuit records.
 * Upload, download (signed URL), replace (versioning), soft-delete.
 * Renders on AccountDetail, ItemDetail, and PursuitSlideOut.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, Download, FileText, RefreshCw, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import {
  FILE_KINDS,
  fmtSize,
  listRecordFiles,
  signedUrl,
  softDeleteFile,
  uploadRecordFile,
  type FileKind,
  type RecordFile,
} from "@/lib/record-files";

interface Props {
  workspaceId: string;
  accountId: string;
  itemId?: string | null;
  actorEmail?: string | null;
  compact?: boolean;
}

export default function FilesPanel({ workspaceId, accountId, itemId, actorEmail, compact }: Props) {
  const [files, setFiles] = useState<RecordFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<FileKind>("other");
  const [replaceTarget, setReplaceTarget] = useState<RecordFile | null>(null);
  const [showPrev, setShowPrev] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await listRecordFiles({ accountId, itemId: itemId ?? undefined });
      setFiles(rows);
    } catch (e: any) {
      toast.error(e.message || "Failed to load files");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [accountId, itemId]);

  const active = useMemo(() => files.filter(f => !f.superseded_by || f.superseded_by === f.id ? !f.superseded_by : false), [files]);
  const superseded = useMemo(() => files.filter(f => f.superseded_by), [files]);

  const doUpload = async (file: File) => {
    setUploading(true);
    try {
      await uploadRecordFile({
        workspaceId, accountId, itemId: itemId ?? null,
        file, kind, replacesId: replaceTarget?.id, actorEmail,
      });
      toast.success(replaceTarget ? "File replaced" : "File uploaded");
      setReplaceTarget(null);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const doDownload = async (f: RecordFile) => {
    const url = await signedUrl(f.storage_path);
    if (!url) { toast.error("Could not sign URL"); return; }
    window.open(url, "_blank", "noopener");
  };

  const doDelete = async (f: RecordFile) => {
    if (!confirm(`Remove ${f.file_name}?`)) return;
    await softDeleteFile(f);
    toast.success("File removed");
    await load();
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Files</h3>
        <div className="flex items-center gap-1.5">
          <select
            className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
            value={kind}
            onChange={e => setKind(e.target.value as FileKind)}
          >
            {FILE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <Button
            variant="outline" size="sm" className="h-6 text-[10px]"
            disabled={uploading}
            onClick={() => { setReplaceTarget(null); inputRef.current?.click(); }}
          >
            <Upload size={11} className="mr-1" /> {uploading ? "…" : "upload"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f); }}
          />
        </div>
      </div>

      {replaceTarget && (
        <div className="mb-2 text-[11px] font-mono border border-dashed border-dossier-brass/50 rounded p-2 flex items-center gap-2">
          <span className="text-dossier-brass">Replacing · {replaceTarget.file_name}</span>
          <Button variant="ghost" size="sm" className="ml-auto h-5 text-[10px]" onClick={() => inputRef.current?.click()}>
            pick file
          </Button>
          <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => setReplaceTarget(null)}>cancel</Button>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : active.length === 0 ? (
        <div className="text-xs text-muted-foreground border border-dashed border-border rounded p-3">
          No files on record.
        </div>
      ) : (
        <div className="space-y-1.5">
          {active.map(f => (
            <div key={f.id} className="group flex items-center gap-2 border border-border rounded p-2 text-xs">
              <FileText size={14} className="text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{f.file_name}</div>
                <div className="text-[10px] font-mono text-muted-foreground flex gap-2">
                  <span className="uppercase tracking-wider">{f.kind}</span>
                  <span>· {fmtSize(f.size_bytes)}</span>
                  <span>· {format(new Date(f.created_at), "MMM d, yyyy")}</span>
                </div>
              </div>
              {!compact && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Download" onClick={() => doDownload(f)}>
                    <Download size={12} />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Replace"
                          onClick={() => { setReplaceTarget(f); inputRef.current?.click(); }}>
                    <RefreshCw size={12} />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Remove" onClick={() => doDelete(f)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              )}
              {compact && (
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => doDownload(f)}>
                  <Download size={12} />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {superseded.length > 0 && (
        <div className="mt-2">
          <button
            className="text-[10px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1"
            onClick={() => setShowPrev(v => !v)}
          >
            {showPrev ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            previous versions · {superseded.length}
          </button>
          {showPrev && (
            <div className="mt-1 space-y-1">
              {superseded.map(f => (
                <div key={f.id} className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground border-l border-border pl-2">
                  <span className="truncate">{f.file_name}</span>
                  <span>· {format(new Date(f.created_at), "MMM d")}</span>
                  <Button variant="ghost" size="sm" className="h-5 ml-auto text-[10px]" onClick={() => doDownload(f)}>
                    <Download size={10} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
