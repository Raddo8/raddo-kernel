import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import TimelineStream from "@/components/TimelineStream";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, User } from "lucide-react";
import { toast } from "sonner";
import { useLabels } from "@/lib/labels-context";

export default function AccountDetail() {
  const labels = useLabels();
  const { id } = useParams();
  const [account, setAccount] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [contactOpen, setContactOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cRole, setCRole] = useState("");

  useEffect(() => {
    if (!id) return;
    supabase.from("accounts").select("*").eq("id", id).maybeSingle().then(({ data }) => setAccount(data));
    supabase.from("contacts").select("*").eq("account_id", id).order("created_at").then(({ data }) => setContacts(data || []));
    supabase.from("items").select("*, item_states(name, label, color), policies(name)").eq("account_id", id).order("created_at", { ascending: false }).then(({ data }) => setItems(data || []));
  }, [id]);

  const addContact = async () => {
    if (!id || !cName.trim()) return;
    const { error } = await supabase.from("contacts").insert({
      account_id: id,
      name: cName.trim(),
      email: cEmail || null,
      role: cRole || null,
    });
    if (error) { toast.error(error.message); return; }
    setCName(""); setCEmail(""); setCRole(""); setContactOpen(false);
    supabase.from("contacts").select("*").eq("account_id", id).order("created_at").then(({ data }) => setContacts(data || []));
    toast.success("Contact added");
  };

  if (!account) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div>
      <PageHeader
        title={account.name}
        subtitle={`${account.type} · ${account.status}`}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-border">
        {/* Left: contacts & items */}
        <div className="lg:col-span-1 divide-y divide-border">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold font-mono">CONTACTS</h3>
              <Dialog open={contactOpen} onOpenChange={setContactOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm"><Plus size={14} /></Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <Input placeholder="Name" value={cName} onChange={e => setCName(e.target.value)} />
                    <Input placeholder="Email" value={cEmail} onChange={e => setCEmail(e.target.value)} />
                    <Input placeholder="Role" value={cRole} onChange={e => setCRole(e.target.value)} />
                    <Button onClick={addContact} className="w-full">Add</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No contacts yet</p>
            ) : (
              <div className="space-y-2">
                {contacts.map(c => (
                  <div key={c.id} className="flex items-center gap-2 text-sm">
                    <User size={14} className="text-muted-foreground" />
                    <span>{c.name}</span>
                    {c.role && <span className="text-xs text-muted-foreground font-mono">({c.role})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4">
            <h3 className="text-sm font-semibold font-mono mb-3">{labels.itemsUpper}</h3>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No {labels.itemsLower} yet</p>
            ) : (
              <div className="space-y-2">
                {items.map(item => (
                  <a key={item.id} href={`/items/${item.id}`} className="block p-2 rounded hover:bg-accent/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{item.title}</span>
                      {item.amount && <span className="font-mono text-xs">${Number(item.amount).toLocaleString()}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {item.item_states && (
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: item.item_states.color + '22', color: item.item_states.color }}>
                          {item.item_states.label}
                        </span>
                      )}
                      {item.policies && <span className="text-xs text-muted-foreground">{item.policies.name}</span>}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: timeline */}
        <div className="lg:col-span-2">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold font-mono">TIMELINE</h3>
          </div>
          <TimelineStream accountId={id!} />
        </div>
      </div>
    </div>
  );
}
