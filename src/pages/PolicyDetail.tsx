import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function PolicyDetail() {
  const { id } = useParams();
  const [policy, setPolicy] = useState<any>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [open, setOpen] = useState(false);
  const [ruleType, setRuleType] = useState("");
  const [ruleJson, setRuleJson] = useState("{}");

  useEffect(() => {
    setNotFound(false);
    setPolicy(null);
    setRules([]);
    if (!id) return;

    let active = true;

    supabase.from("policies").select("*").eq("id", id).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { toast.error("Failed to load policy"); return; }
        if (!data) { setNotFound(true); return; }
        setPolicy(data);

        supabase.from("policy_rate_rules").select("*")
          .eq("policy_id", id).order("sort_order")
          .then(({ data }) => { if (active) setRules(data || []); });
      });

    return () => { active = false; };
  }, [id]);

  const refreshRules = () => {
    if (!id) return;
    supabase.from("policy_rate_rules").select("*")
      .eq("policy_id", id).order("sort_order")
      .then(({ data }) => setRules(data || []));
  };

  const addRule = async () => {
    if (!id || !ruleType.trim()) return;
    let parsed;
    try { parsed = JSON.parse(ruleJson); } catch { toast.error("Invalid JSON"); return; }
    const { error } = await supabase.from("policy_rate_rules").insert({
      policy_id: id,
      rule_type: ruleType.trim(),
      rule_json: parsed,
      sort_order: rules.length,
    });
    if (error) { toast.error(error.message); return; }
    setRuleType(""); setRuleJson("{}"); setOpen(false);
    refreshRules();
    toast.success("Rule added");
  };

  const deleteRule = async (ruleId: string) => {
    await supabase.from("policy_rate_rules").delete().eq("id", ruleId);
    refreshRules();
  };

  if (notFound) {
    return (
      <div className="p-6 space-y-3">
        <h2 className="text-lg font-semibold">Policy not found</h2>
        <p className="text-sm text-muted-foreground">
          This policy does not exist or you do not have access.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/policies">Back to policies</Link>
        </Button>
      </div>
    );
  }

  if (!policy) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div>
      <PageHeader
        title={policy.name}
        subtitle={policy.description || "No description"}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus size={16} className="mr-1" /> Add Rule</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Rule</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Rule type (e.g. escalation_trigger)" value={ruleType} onChange={e => setRuleType(e.target.value)} />
                <Textarea placeholder='Rule JSON (e.g. {"days_overdue": 30})' value={ruleJson} onChange={e => setRuleJson(e.target.value)} className="font-mono text-xs" rows={5} />
                <Button onClick={addRule} className="w-full">Add Rule</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      {rules.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">No rules defined yet.</div>
      ) : (
        <div className="divide-y divide-border">
          {rules.map((r, i) => (
            <div key={r.id} className="flex items-start justify-between px-6 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                  <span className="text-sm font-medium">{r.rule_type}</span>
                </div>
                <pre className="text-xs text-muted-foreground mt-1 font-mono">{JSON.stringify(r.rule_json, null, 2)}</pre>
              </div>
              <Button variant="ghost" size="sm" onClick={() => deleteRule(r.id)}>
                <Trash2 size={14} className="text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
