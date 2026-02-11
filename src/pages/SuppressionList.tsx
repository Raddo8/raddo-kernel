import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import { useToast } from "@/hooks/use-toast";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableHead, TableBody, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ShieldOff, Plus, Trash2, Search } from "lucide-react";
import { format } from "date-fns";

type Suppression = {
  id: string;
  email: string;
  reason: string;
  source: string;
  created_at: string;
  workspace_id: string;
  contact_id: string | null;
  scope: string;
};

const REASON_STYLES: Record<string, string> = {
  bounce: "bg-destructive/15 text-destructive",
  complaint: "bg-destructive/15 text-destructive",
  manual: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  unsubscribe: "bg-muted text-muted-foreground",
};

const SOURCE_STYLES: Record<string, string> = {
  webhook: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  manual: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  system: "bg-muted text-muted-foreground",
};

function InlineBadge({ label, styles }: { label: string; styles: Record<string, string> }) {
  const cls = styles[label] || "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export default function SuppressionList() {
  const { workspace, userRole } = useWorkspace();
  const { toast } = useToast();
  const [items, setItems] = useState<Suppression[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const isAdmin = userRole === "owner" || userRole === "admin";

  const fetchList = async () => {
    if (!workspace) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("suppression_list")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast({ title: "Error loading suppressions", description: error.message, variant: "destructive" });
    }
    setItems((data as Suppression[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchList(); }, [workspace?.id]);

  const filtered = useMemo(() => {
    let result = items;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((s) => s.email.includes(q));
    }
    if (reasonFilter !== "all") result = result.filter((s) => s.reason === reasonFilter);
    if (sourceFilter !== "all") result = result.filter((s) => s.source === sourceFilter);
    return result;
  }, [items, search, reasonFilter, sourceFilter]);

  const handleAdd = async () => {
    if (!workspace) return;
    const email = addEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Invalid email", variant: "destructive" });
      return;
    }
    setAdding(true);
    const { error } = await supabase.from("suppression_list").insert({
      workspace_id: workspace.id,
      email,
      reason: "manual",
      source: "manual",
    });
    setAdding(false);
    if (error) {
      toast({ title: "Failed to add", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Suppression added" });
      setAddEmail("");
      setAddOpen(false);
      fetchList();
    }
  };

  const handleRemove = async (id: string) => {
    if (!workspace) return;
    setRemoving(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suppression-admin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ action: "remove", suppression_id: id, workspace_id: workspace.id }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Remove failed");
      toast({ title: "Suppression removed" });
      fetchList();
    } catch (err: any) {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    }
    setRemoving(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppressions"
        subtitle="Manage suppressed email recipients"
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus size={16} /> Add
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Reason" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reasons</SelectItem>
            <SelectItem value="bounce">Bounce</SelectItem>
            <SelectItem value="complaint">Complaint</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="unsubscribe">Unsubscribe</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table or empty */}
      {!loading && filtered.length === 0 ? (
        <EmptyState icon={ShieldOff} title="No suppressed recipients" description="Suppressed addresses won't receive outbound messages." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Added</TableHead>
              {isAdmin && <TableHead className="w-[60px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-sm">{s.email}</TableCell>
                <TableCell><InlineBadge label={s.reason} styles={REASON_STYLES} /></TableCell>
                <TableCell><InlineBadge label={s.source} styles={SOURCE_STYLES} /></TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(s.created_at), "MMM d, yyyy")}
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(s.id)}
                      disabled={removing === s.id}
                    >
                      <Trash2 size={14} className="text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Suppression</DialogTitle>
            <DialogDescription>Manually suppress an email address from receiving messages.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="recipient@example.com"
            type="email"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <DialogFooter>
            <Button onClick={handleAdd} disabled={adding}>
              {adding ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
