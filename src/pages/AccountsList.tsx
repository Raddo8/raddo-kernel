import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useTableSort, sortIndicator } from "@/lib/table-sort";

export default function AccountsList() {
  const { workspace } = useWorkspace();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [type, setType] = useState("customer");
  const [open, setOpen] = useState(false);

  const fetch = async () => {
    if (!workspace) return;
    const { data } = await supabase
      .from("accounts")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false });
    setAccounts(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, [workspace]);

  const create = async () => {
    if (!workspace || !name.trim()) return;
    const { error } = await supabase.from("accounts").insert({
      workspace_id: workspace.id,
      name: name.trim(),
      type,
    });
    if (error) { toast.error(error.message); return; }
    setName(""); setType("customer"); setOpen(false);
    fetch();
    toast.success("Account created");
  };

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle={`${accounts.length} total`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus size={16} className="mr-1" /> New Account</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Account</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Account name" value={name} onChange={e => setName(e.target.value)} />
                <Input placeholder="Type (customer, vendor...)" value={type} onChange={e => setType(e.target.value)} />
                <Button onClick={create} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      {loading ? (
        <div className="p-6 text-muted-foreground text-sm">Loading...</div>
      ) : accounts.length === 0 ? (
        <EmptyState icon={Building2} title="No accounts" description="Create your first account to start tracking relationships." />
      ) : (
        <AccountsTable accounts={accounts} />
      )}
    </div>
  );
}

function AccountsTable({ accounts }: { accounts: any[] }) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const filtered = accounts.filter(a =>
    (typeFilter === "all" || a.type === typeFilter) &&
    (statusFilter === "all" || a.status === statusFilter)
  );
  const { sort, toggle, filter, setFilter, sorted } = useTableSort(filtered, {
    storageKey: "accounts.list",
    defaultSort: { key: "name", dir: "asc" },
    getters: {
      name:   (a) => a.name ?? "",
      type:   (a) => a.type ?? "",
      status: (a) => a.status ?? "",
      created: (a) => a.created_at ?? "",
    },
    filterFn: (a, needle) => (a.name ?? "").toLowerCase().includes(needle),
  });
  const H = ({ k, label }: { k: string; label: string }) => (
    <button className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground" onClick={() => toggle(k)}>
      {label} <span className="text-muted-foreground/60">{sortIndicator(sort.key === k, sort.dir)}</span>
    </button>
  );
  const types = Array.from(new Set(accounts.map(a => a.type).filter(Boolean)));
  const statuses = Array.from(new Set(accounts.map(a => a.status).filter(Boolean)));
  return (
    <div>
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border">
        <Input placeholder="Filter name…" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-7 w-64 text-xs font-mono" />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-7 w-32 text-xs font-mono"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all types</SelectItem>
            {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-7 w-32 text-xs font-mono"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all statuses</SelectItem>
            {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-4">
          <H k="name" label="Name" />
          <H k="type" label="Type" />
          <H k="status" label="Status" />
          <H k="created" label="Created" />
        </div>
      </div>
      <div className="divide-y divide-border">
        {sorted.map((a) => (
          <Link
            key={a.id}
            to={`/accounts/${a.id}`}
            className="flex items-center justify-between px-6 py-3 hover:bg-accent/50 transition-colors"
          >
            <div>
              <span className="font-medium text-sm">{a.name}</span>
              <span className="text-xs text-muted-foreground ml-3 font-mono">{a.type}</span>
            </div>
            <StatusBadge status={a.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
