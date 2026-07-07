import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  title?: string | null;
  linkedin_url?: string | null;
  is_decision_maker?: boolean | null;
  email_verified?: boolean | null;
  source?: string | null;
  notes?: string | null;
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
  const [title, setTitle] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [isDm, setIsDm] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!contact) return;
    setName(contact.name ?? "");
    setEmail(contact.email ?? "");
    setPhone(contact.phone ?? "");
    setTitle(contact.title ?? contact.role ?? "");
    setLinkedin(contact.linkedin_url ?? "");
    setIsDm(!!contact.is_decision_maker);
    setEmailVerified(!!contact.email_verified);
    setSource(contact.source ?? "");
    setNotes(contact.notes ?? "");
  }, [contact?.id, open]);

  if (!contact) return null;

  const canSave = name.trim() && (email.trim() || phone.trim());

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const patch: any = {
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      title: title.trim() || null,
      role: title.trim() || null, // keep legacy role column in sync
      linkedin_url: linkedin.trim() || null,
      is_decision_maker: isDm,
      email_verified: emailVerified,
      source: source.trim() || null,
      notes: notes.trim() || null,
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
        { field: "title", before: contact.title ?? contact.role, after: patch.title },
        { field: "linkedin_url", before: contact.linkedin_url ?? null, after: patch.linkedin_url },
        { field: "is_decision_maker", before: !!contact.is_decision_maker, after: patch.is_decision_maker },
        { field: "email_verified", before: !!contact.email_verified, after: patch.email_verified },
        { field: "source", before: contact.source ?? null, after: patch.source },
        { field: "notes", before: contact.notes ?? null, after: patch.notes },
      ],
    });
    setSaving(false);
    onOpenChange(false);
    onSaved();
    toast.success("Contact updated");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit contact</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
            <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <Input placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <Input placeholder="LinkedIn URL" value={linkedin} onChange={e => setLinkedin(e.target.value)} />
          <Input placeholder="Source (how we found them)" value={source} onChange={e => setSource(e.target.value)} />
          <Textarea placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          <div className="flex flex-wrap gap-4 text-xs font-mono">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={isDm} onCheckedChange={(v) => setIsDm(v === true)} /> decision-maker
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={emailVerified} onCheckedChange={(v) => setEmailVerified(v === true)} /> email verified
            </label>
          </div>
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
