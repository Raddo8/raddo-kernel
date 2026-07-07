import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import ContactEditDialog, { deleteContactWithAudit, type ContactRow } from "@/components/dialogs/ContactEditDialog";

export default function ContactsList() {
  const { workspace, userEmail } = useWorkspace();
  const [contacts, setContacts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cRole, setCRole] = useState("");
  const [cAccountId, setCAccountId] = useState("");
  const [editContact, setEditContact] = useState<ContactRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const fetchContacts = async () => {
    if (!workspace) return;
    const { data } = await supabase
      .from("contacts")
      .select("*, accounts!inner(workspace_id, name)")
      .eq("accounts.workspace_id", workspace.id)
      .order("created_at", { ascending: false });
    setContacts(data || []);
    setLoading(false);
  };

  const fetchAccounts = async () => {
    if (!workspace) return;
    const { data } = await supabase
      .from("accounts")
      .select("id, name")
      .eq("workspace_id", workspace.id)
      .order("name");
    setAccounts(data || []);
  };

  useEffect(() => { fetchContacts(); fetchAccounts(); }, [workspace]);

  const canAdd = cName.trim() && cAccountId && (cEmail.trim() || cPhone.trim());

  const create = async () => {
    if (!canAdd) return;
    const { error } = await supabase.from("contacts").insert({
      account_id: cAccountId,
      name: cName.trim(),
      email: cEmail.trim() || null,
      phone: cPhone.trim() || null,
      role: cRole.trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    setCName(""); setCEmail(""); setCPhone(""); setCRole(""); setCAccountId("");
    setOpen(false);
    fetchContacts();
    toast.success("Contact added");
  };

  const handleDelete = async (c: ContactRow) => {
    if (!window.confirm(`Delete contact "${c.name}"?`)) return;
    if (await deleteContactWithAudit(c, userEmail)) fetchContacts();
  };

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle={`${contacts.length} total`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus size={16} className="mr-1" /> Add Contact</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Select value={cAccountId} onValueChange={setCAccountId}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input placeholder="Name" value={cName} onChange={e => setCName(e.target.value)} />
                <Input placeholder="Email" value={cEmail} onChange={e => setCEmail(e.target.value)} />
                <Input placeholder="Phone" value={cPhone} onChange={e => setCPhone(e.target.value)} />
                <Input placeholder="Role" value={cRole} onChange={e => setCRole(e.target.value)} />
                <p className="text-xs text-muted-foreground">At least email or phone is required.</p>
                <Button onClick={create} className="w-full" disabled={!canAdd}>Add</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      {loading ? (
        <div className="p-6 text-muted-foreground text-sm">Loading...</div>
      ) : contacts.length === 0 ? (
        <EmptyState icon={Users} title="No contacts" description="Add contacts to your accounts." />
      ) : (
        <ContactsTable
          contacts={contacts}
          onEdit={(c) => { setEditContact(c); setEditOpen(true); }}
          onDelete={handleDelete}
        />
      )}
      <ContactEditDialog
        contact={editContact}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={fetchContacts}
        actorEmail={userEmail}
      />
    </div>
  );
}
