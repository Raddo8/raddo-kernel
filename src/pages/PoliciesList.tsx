import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Shield, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function PoliciesList() {
  const { workspace } = useWorkspace();
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const fetch = async () => {
    if (!workspace) return;
    const { data } = await supabase.from("policies").select("*, policy_rules(id)").eq("workspace_id", workspace.id).order("created_at", { ascending: false });
    setPolicies(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, [workspace]);

  const create = async () => {
    if (!workspace || !name.trim()) return;
    const { error } = await supabase.from("policies").insert({ workspace_id: workspace.id, name: name.trim(), description: desc || null });
    if (error) { toast.error(error.message); return; }
    setName(""); setDesc(""); setOpen(false);
    fetch();
    toast.success("Policy created");
  };

  return (
    <div>
      <PageHeader
        title="Policies"
        subtitle={`${policies.length} total`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus size={16} className="mr-1" /> New Policy</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Policy</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Policy name" value={name} onChange={e => setName(e.target.value)} />
                <Textarea placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} />
                <Button onClick={create} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      {loading ? (
        <div className="p-6 text-muted-foreground text-sm">Loading...</div>
      ) : policies.length === 0 ? (
        <EmptyState icon={Shield} title="No policies" description="Policies define the rules for how items are handled." />
      ) : (
        <div className="divide-y divide-border">
          {policies.map(p => (
            <Link key={p.id} to={`/policies/${p.id}`} className="block px-6 py-3 hover:bg-accent/50 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{p.name}</span>
                <span className="text-xs font-mono text-muted-foreground">{p.policy_rules?.length || 0} rules</span>
              </div>
              {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
