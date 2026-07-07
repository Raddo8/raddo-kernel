/**
 * Shared helpers for record-files (attachments on accounts/pursuits).
 * Storage path convention: {workspace_id}/{account_id}/{uuid}-{filename}
 */
import { supabase } from "@/integrations/supabase/client";
import { writeTimelineEvent } from "@/lib/timeline-events";

export type FileKind = "deck" | "site" | "email_draft" | "agreement" | "other";

export interface RecordFile {
  id: string;
  workspace_id: string;
  account_id: string;
  item_id: string | null;
  file_name: string;
  storage_path: string;
  kind: FileKind;
  size_bytes: number;
  uploaded_by: string | null;
  superseded_by: string | null;
  created_at: string;
}

export const FILE_KINDS: FileKind[] = ["deck", "site", "email_draft", "agreement", "other"];

export async function listRecordFiles(args: { accountId?: string; itemId?: string }) {
  let q = (supabase as any).from("record_files").select("*").order("created_at", { ascending: false });
  if (args.itemId) q = q.eq("item_id", args.itemId);
  else if (args.accountId) q = q.eq("account_id", args.accountId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as RecordFile[];
}

export async function uploadRecordFile(args: {
  workspaceId: string;
  accountId: string;
  itemId?: string | null;
  file: File;
  kind: FileKind;
  replacesId?: string;
  actorEmail?: string | null;
}): Promise<RecordFile> {
  const safeName = args.file.name.replace(/[^\w.\-]+/g, "_");
  const uuid = crypto.randomUUID();
  const path = `${args.workspaceId}/${args.accountId}/${uuid}-${safeName}`;
  const { error: upErr } = await supabase.storage.from("record-files").upload(path, args.file, {
    contentType: args.file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) throw upErr;

  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await (supabase as any).from("record_files").insert({
    workspace_id: args.workspaceId,
    account_id: args.accountId,
    item_id: args.itemId ?? null,
    file_name: args.file.name,
    storage_path: path,
    kind: args.kind,
    size_bytes: args.file.size,
    uploaded_by: user?.user?.id ?? null,
  }).select("*").single();
  if (error) throw error;

  if (args.replacesId) {
    await (supabase as any).from("record_files")
      .update({ superseded_by: data.id })
      .eq("id", args.replacesId);
  }

  await writeTimelineEvent({
    accountId: args.accountId,
    itemId: args.itemId ?? undefined,
    direction: "system",
    channel: "system",
    summary: args.replacesId
      ? `File replaced · ${args.file.name}${args.actorEmail ? ` by ${args.actorEmail}` : ""}`
      : `File uploaded · ${args.file.name}${args.actorEmail ? ` by ${args.actorEmail}` : ""}`,
    rawJson: { kind: args.kind, size: args.file.size, replaces: args.replacesId ?? null, record_file_id: data.id },
  });

  return data as RecordFile;
}

export async function signedUrl(storagePath: string, expiresSec = 300): Promise<string | null> {
  const { data, error } = await supabase.storage.from("record-files").createSignedUrl(storagePath, expiresSec);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function softDeleteFile(f: RecordFile) {
  // "Delete" = mark superseded_by=self so it disappears from active view but stays recoverable.
  await (supabase as any).from("record_files").update({ superseded_by: f.id }).eq("id", f.id);
  await writeTimelineEvent({
    accountId: f.account_id,
    itemId: f.item_id ?? undefined,
    direction: "system",
    channel: "system",
    summary: `File removed · ${f.file_name}`,
    rawJson: { record_file_id: f.id, soft_delete: true },
  });
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
