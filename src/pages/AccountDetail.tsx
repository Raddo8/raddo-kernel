import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import TimelineStream from "@/components/TimelineStream";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SignalsPanel from "@/components/SignalsPanel";
import { Plus, User, Trash2, Pencil, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { useLabels } from "@/lib/labels-context";
import { useWorkspace } from "@/lib/workspace-context";
import ContactEditDialog, { deleteContactWithAudit, type ContactRow } from "@/components/dialogs/ContactEditDialog";
import AccountEditDialog from "@/components/dialogs/AccountEditDialog";
import { expandOccurrences, fmtUsd, indexOverrides, type Schedule, type OccurrenceOverride } from "@/lib/revenue-math";
import { format, addMonths } from "date-fns";

export default function AccountDetail() {
  const labels = useLabels();
  const { id } = useParams();
  const { userEmail } = useWorkspace();
  const [account, setAccount] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [overrides, setOverrides] = useState<OccurrenceOverride[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cTitle, setCTitle] = useState("");
  const [cDm, setCDm] = useState(false);
  const [editContact, setEditContact] = useState<ContactRow | null>(null);
  const [editContactOpen, setEditContactOpen] = useState(false);
  const [editAccountOpen, setEditAccountOpen] = useState(false);

  const refresh = () => {
    if (!id) return;
    supabase.from("accounts").select("*").eq("id", id).maybeSingle()
      .then(({ data }) => setAccount(data));
    refreshContacts();
  };

  useEffect(() => {
    setNotFound(false); setAccount(null); setContacts([]); setItems([]);
    if (!id) return;
    let active = true;
    supabase.from("accounts").select("*").eq("id", id).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { toast.error("Failed to load account"); return; }
        if (!data) { setNotFound(true); return; }
        setAccount(data);
        supabase.from("contacts").select("*").eq("account_id", id).order("created_at")
          .then(({ data }) => { if (!active) return; setContacts(data || []); });
        supabase.from("items").select("*, item_states(name, label, color), policies(name)")
          .eq("account_id", id).order("created_at", { ascending: false })
          .then(({ data }) => { if (!active) return; setItems(data || []); });
        (supabase as any).from("revenue_schedules").select("*").eq("account_id", id)
          .then(({ data }: any) => { if (!active) return; setSchedules((data || []) as Schedule[]); });
        (supabase as any).from("revenue_occurrence_overrides").select("*")
          .in("schedule_id",
            // Two-step: fetch overrides scoped by schedules loaded above once they arrive.
            // Kept simple: over-fetch by workspace via the schedule join filter below.
            []
          );
      });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (schedules.length === 0) { setOverrides([]); return; }
    const ids = schedules.map(s => s.id);
    (supabase as any).from("revenue_occurrence_overrides").select("*").in("schedule_id", ids)
      .then(({ data }: any) => setOverrides((data || []) as OccurrenceOverride[]));
  }, [schedules]);

  const overrideIdx = useMemo(() => indexOverrides(overrides), [overrides]);
  const next3 = useMemo(() => {
    const from = new Date();
    const to = addMonths(from, 12);
    const out: { s: Schedule; date: Date; amount: number; override: any }[] = [];
    for (const s of schedules) {
      for (const o of expandOccurrences(s, from, to, overrideIdx[s.id] || [])) {
        out.push({ s, date: o.date, amount: o.amount, override: o.override });
      }
    }
    return out.sort((a, z) => a.date.getTime() - z.date.getTime()).slice(0, 6);
  }, [schedules, overrideIdx]);

  const refreshContacts = () => {
    if (!id) return;
    supabase.from("contacts").select("*").eq("account_id", id).order("created_at")
      .then(({ data }) => setContacts(data || []));
  };

  const canAddContact = cName.trim() && (cEmail.trim() || cPhone.trim());

  const addContact = async () => {
    if (!id || !canAddContact) return;
    const { error } = await supabase.from("contacts").insert({
      account_id: id, name: cName.trim(),
      email: cEmail.trim() || null, phone: cPhone.trim() || null,
      role: cTitle.trim() || null, title: cTitle.trim() || null,
      is_decision_maker: cDm,
    } as any);
    if (error) { toast.error(error.message); return; }
    setCName(""); setCEmail(""); setCPhone(""); setCTitle(""); setCDm(false); setContactOpen(false);
    refreshContacts();
    toast.success("Contact added");
  };

  const handleDeleteContact = async (c: ContactRow) => {
    if (!window.confirm(`Delete "${c.name}"?`)) return;
    if (await deleteContactWithAudit(c, userEmail)) refreshContacts();
  };

  if (notFound) {
    return (
      <div className="p-6 space-y-3">
        <h2 className="text-lg font-semibold">Account not found</h2>
        <p className="text-sm text-muted-foreground">This account does not exist or you do not have access.</p>
        <Button variant="outline" size="sm" asChild><Link to="/accounts">Back to accounts</Link></Button>
      </div>
    );
  }

  if (!account) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div>
      <PageHeader
        title={account.name}
        subtitle={`${account.type} · ${account.status}${account.metadata?.utm_slug ? ` · /${account.metadata.utm_slug}` : ""}`}
        actions={
          <Button variant="ghost" size="sm" onClick={() => setEditAccountOpen(true)}>
            <Pencil size={14} className="mr-1" /> Edit
          </Button>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-border">
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
                    <Input placeholder="Phone" value={cPhone} onChange={e => setCPhone(e.target.value)} />
                    <Input placeholder="Title" value={cTitle} onChange={e => setCTitle(e.target.value)} />
                    <label className="flex items-center gap-2 text-xs font-mono cursor-pointer">
                      <input type="checkbox" checked={cDm} onChange={e => setCDm(e.target.checked)} /> decision-maker
                    </label>
                    <p className="text-xs text-muted-foreground">At least email or phone is required.</p>
                    <Button onClick={addContact} className="w-full" disabled={!canAddContact}>Add</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No contacts yet</p>
            ) : (
              <div className="space-y-2">
                {contacts.map(c => (
                  <div key={c.id} className="flex items-center gap-2 text-sm group">
                    <User size={14} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span>{c.name}</span>
                      {c.is_decision_maker && <span className="ml-1 text-[9px] font-mono px-1 py-0 rounded border border-dossier-brass/60 text-dossier-brass">DM</span>}
                      {c.email_verified && <span className="ml-1 text-[9px] font-mono px-1 py-0 rounded border border-status-green/60 text-status-green">✓</span>}
                      {(c.title || c.role) && <span className="text-xs text-muted-foreground font-mono ml-1">({c.title || c.role})</span>}
                      {c.email && <span className="text-xs text-muted-foreground ml-1">· {c.email}</span>}
                      {c.phone && <span className="text-xs text-muted-foreground ml-1">· {c.phone}</span>}
                    </div>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => { setEditContact(c); setEditContactOpen(true); }}>
                      <Pencil size={12} />
                    </Button>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDeleteContact(c)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4">
            <h3 className="text-sm font-semibold font-mono mb-3 flex items-center gap-1">
              <DollarSign size={14} /> REVENUE
            </h3>
            {schedules.length === 0 ? (
              <p className="text-xs text-muted-foreground">No revenue schedules yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  {schedules.map(s => (
                    <div key={s.id} className="text-[11px] font-mono flex justify-between border border-border rounded px-2 py-1">
                      <span className="truncate">
                        <Link to="/app/revenue" className="hover:text-dossier-brass">{s.description || s.kind}</Link>
                        <span className="text-muted-foreground"> · {s.status}</span>
                      </span>
                      <span>{fmtUsd(Number(s.amount_usd) || 0)}{s.cadence === "monthly" ? "/mo" : ""}</span>
                    </div>
                  ))}
                </div>
                {next3.length > 0 && (
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Next occurrences</div>
                    <div className="space-y-0.5">
                      {next3.map((o, i) => (
                        <div key={i} className="text-[11px] font-mono text-muted-foreground flex justify-between">
                          <span>{format(o.date, "MMM d yyyy")} · {o.s.description}</span>
                          <span>
                            {fmtUsd(o.amount)}
                            {o.override && <span className="text-dossier-brass"> ·</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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

        <div className="lg:col-span-2">
          <Tabs defaultValue="timeline" className="w-full">
            <div className="px-4 pt-3 border-b border-border">
              <TabsList>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="signals">Signals</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="timeline" className="m-0">
              <TimelineStream accountId={id!} />
            </TabsContent>
            <TabsContent value="signals" className="m-0">
              <SignalsPanel utmSlug={account?.metadata?.utm_slug ?? null} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <ContactEditDialog
        contact={editContact}
        open={editContactOpen}
        onOpenChange={setEditContactOpen}
        onSaved={refreshContacts}
        actorEmail={userEmail}
      />
      <AccountEditDialog
        account={account}
        open={editAccountOpen}
        onOpenChange={setEditAccountOpen}
        onSaved={refresh}
        actorEmail={userEmail}
      />
    </div>
  );
}
