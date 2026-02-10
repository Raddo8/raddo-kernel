import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLabels } from "@/lib/labels-context";

export default function ItemsList() {
  const labels = useLabels();
  const { workspace } = useWorkspace();
  const [items, setItems] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // Form
  const [title, setTitle] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("invoice");
  const [stateId, setStateId] = useState("");
  const [policyId, setPolicyId] = useState("");

  const fetchAll = async () => {
    if (!workspace) return;
    const [itemsRes, accRes, statesRes, polRes] = await Promise.all([
      supabase.from("items").select("*, accounts(name), item_states(name, label, color), policies(name)").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
      supabase.from("accounts").select("id, name").eq("workspace_id", workspace.id),
      supabase.from("item_states").select("*").eq("workspace_id", workspace.id).order("sort_order"),
      supabase.from("policies").select("id, name").eq("workspace_id", workspace.id),
    ]);
    setItems(itemsRes.data || []);
    setAccounts(accRes.data || []);
    setStates(statesRes.data || []);
    setPolicies(polRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [workspace]);

  const create = async () => {
    if (!workspace || !title.trim() || !accountId) return;
    const { error } = await supabase.from("items").insert({
      workspace_id: workspace.id,
      account_id: accountId,
      title: title.trim(),
      type,
      amount: amount ? parseFloat(amount) : null,
      state_id: stateId || null,
      policy_id: policyId || null,
    });
    if (error) { toast.error(error.message); return; }
    setTitle(""); setAmount(""); setOpen(false);
    fetchAll();
    toast.success(`${labels.item} created`);
  };

  return (
    <div>
      <PageHeader
        title={labels.items}
        subtitle={`${items.length} total`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus size={16} className="mr-1" /> {labels.newItem}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{labels.newItem}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder={labels.title} value={title} onChange={e => setTitle(e.target.value)} />
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input placeholder={labels.amount} type="number" value={amount} onChange={e => setAmount(e.target.value)} />
                <Input placeholder="Type (invoice, deal...)" value={type} onChange={e => setType(e.target.value)} />
                {states.length > 0 && (
                  <Select value={stateId} onValueChange={setStateId}>
                    <SelectTrigger><SelectValue placeholder="State (optional)" /></SelectTrigger>
                    <SelectContent>
                      {states.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {policies.length > 0 && (
                  <Select value={policyId} onValueChange={setPolicyId}>
                    <SelectTrigger><SelectValue placeholder="Policy (optional)" /></SelectTrigger>
                    <SelectContent>
                      {policies.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Button onClick={create} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      {loading ? (
        <div className="p-6 text-muted-foreground text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <EmptyState icon={FileText} title={`No ${labels.itemsLower}`} description={`Create your first ${labels.itemLower} to begin tracking.`} />
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <Link
              key={item.id}
              to={`/items/${item.id}`}
              className="flex items-center justify-between px-6 py-3 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div>
                  <span className="text-sm font-medium">{item.title}</span>
                  <span className="text-xs text-muted-foreground ml-2 font-mono">{item.type}</span>
                  {item.accounts && <span className="text-xs text-muted-foreground ml-2">· {item.accounts.name}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {item.amount && <span className="font-mono text-sm">${Number(item.amount).toLocaleString()}</span>}
                {item.item_states && (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: item.item_states.color + '22', color: item.item_states.color }}>
                    {item.item_states.label}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
