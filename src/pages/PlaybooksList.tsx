import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function PlaybooksList() {
  const { workspace } = useWorkspace();
  const [playbooks, setPlaybooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [itemType, setItemType] = useState("invoice");

  const fetch = async () => {
    if (!workspace) return;
    const { data } = await supabase.from("playbooks").select("*, playbook_steps(id)").eq("workspace_id", workspace.id).order("created_at", { ascending: false });
    setPlaybooks(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, [workspace]);

  const create = async () => {
    if (!workspace || !name.trim()) return;
    const { error } = await supabase.from("playbooks").insert({ workspace_id: workspace.id, name: name.trim(), item_type: itemType });
    if (error) { toast.error(error.message); return; }
    setName(""); setOpen(false);
    fetch();
    toast.success("Playbook created");
  };

  return (
    <div>
      <PageHeader
        title="Playbooks"
        subtitle={`${playbooks.length} total`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus size={16} className="mr-1" /> New Playbook</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Playbook</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Playbook name" value={name} onChange={e => setName(e.target.value)} />
                <Input placeholder="Item type (invoice, deal...)" value={itemType} onChange={e => setItemType(e.target.value)} />
                <Button onClick={create} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      {loading ? (
        <div className="p-6 text-muted-foreground text-sm">Loading...</div>
      ) : playbooks.length === 0 ? (
        <EmptyState icon={BookOpen} title="No playbooks" description="Playbooks automate actions when item states change." />
      ) : (
        <div className="divide-y divide-border">
          {playbooks.map(p => (
            <Link key={p.id} to={`/playbooks/${p.id}`} className="block px-6 py-3 hover:bg-accent/50 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{p.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">{p.item_type}</span>
                  <span className="text-xs font-mono text-muted-foreground">{p.playbook_steps?.length || 0} steps</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
