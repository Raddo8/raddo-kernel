import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

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
        <div className="divide-y divide-border">
          {accounts.map((a) => (
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
      )}
    </div>
  );
}
