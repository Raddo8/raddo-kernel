import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { writeAuditEvent } from "@/lib/audit";

export interface ContactRow {
  id: string;
  account_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
}

export default function ContactEditDialog({
  contact, open, onOpenChange, onSaved, actorEmail,
}: {
  contact: ContactRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  actorEmail?: string | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!contact) return;
    setName(contact.name ?? "");
    setEmail(contact.email ?? "");
    setPhone(contact.phone ?? "");
    setRole(contact.role ?? "");
  }, [contact?.id, open]);

  if (!contact) return null;

  const canSave = name.trim() && (email.trim() || phone.trim());

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const patch = {
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      role: role.trim() || null,
    };
    const { error } = await supabase.from("contacts").update(patch).eq("id", contact.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    await writeAuditEvent({
      accountId: contact.account_id,
      contactId: contact.id,
      subject: "contact updated",
      actorEmail: actorEmail ?? null,
      changes: [
        { field: "name", before: contact.name, after: patch.name },
        { field: "email", before: contact.email, after: patch.email },
        { field: "phone", before: contact.phone, after: patch.phone },
        { field: "role", before: contact.role, after: patch.role },
      ],
    });
    setSaving(false);
    onOpenChange(false);
    onSaved();
    toast.success("Contact updated");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit contact</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
          <Input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} />
          <Input placeholder="Role · title" value={role} onChange={e => setRole(e.target.value)} />
          <p className="text-xs text-muted-foreground">At least email or phone is required.</p>
          <Button onClick={save} className="w-full" disabled={!canSave || saving}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export async function deleteContactWithAudit(contact: ContactRow, actorEmail?: string | null) {
  const { error } = await supabase.from("contacts").delete().eq("id", contact.id);
  if (error) { toast.error(error.message); return false; }
  await writeAuditEvent({
    accountId: contact.account_id,
    subject: "contact deleted",
    actorEmail: actorEmail ?? null,
    changes: [
      { field: "name", before: contact.name, after: null },
      { field: "email", before: contact.email, after: null },
      { field: "phone", before: contact.phone, after: null },
    ],
  });
  toast.success("Contact deleted");
  return true;
}
