import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { writeAuditEvent } from "@/lib/audit";

export default function AccountEditDialog({
  account, open, onOpenChange, onSaved, actorEmail,
}: {
  account: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  actorEmail?: string | null;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [utmSlug, setUtmSlug] = useState("");
  const [billingMode, setBillingMode] = useState<"manual"|"auto_draft">("manual");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!account) return;
    setName(account.name ?? "");
    setType(account.type ?? "prospect");
    setStatus(account.status ?? "active");
    setUtmSlug(account.metadata?.utm_slug ?? "");
    setBillingMode((account.billing_mode as any) ?? "manual");
  }, [account?.id, open]);

  if (!account) return null;

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const nextMeta = { ...(account.metadata || {}), utm_slug: utmSlug.trim() || undefined };
    if (!utmSlug.trim()) delete (nextMeta as any).utm_slug;
    const patch = { name: name.trim(), type, status, metadata: nextMeta };
    const { error } = await supabase.from("accounts").update(patch).eq("id", account.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    await writeAuditEvent({
      accountId: account.id,
      subject: "account updated",
      actorEmail: actorEmail ?? null,
      changes: [
        { field: "name", before: account.name, after: patch.name },
        { field: "type", before: account.type, after: patch.type },
        { field: "status", before: account.status, after: patch.status },
        { field: "utm_slug", before: account.metadata?.utm_slug ?? null, after: nextMeta.utm_slug ?? null },
      ],
    });
    setSaving(false);
    onOpenChange(false);
    onSaved();
    toast.success("Account updated");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit account</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                {["prospect","customer","partner","vendor","internal"].map(v => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {["active","paused","closed","archived"].map(v => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input placeholder="UTM slug (e.g. pinnacle)" value={utmSlug} onChange={e => setUtmSlug(e.target.value)} />
          <Button onClick={save} className="w-full" disabled={!name.trim() || saving}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
