import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LayoutTemplate, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function TemplatesList() {
  const { workspace } = useWorkspace();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [templateType, setTemplateType] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState("email");

  const fetch = async () => {
    if (!workspace) return;
    const { data } = await supabase.from("templates").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false });
    setTemplates(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, [workspace]);

  const create = async () => {
    if (!workspace || !templateType.trim() || !body.trim()) return;
    const { error } = await supabase.from("templates").insert({
      workspace_id: workspace.id,
      template_type: templateType.trim(),
      channel,
      subject: subject || null,
      body: body.trim(),
    });
    if (error) { toast.error(error.message); return; }
    setTemplateType(""); setSubject(""); setBody(""); setOpen(false);
    fetch();
    toast.success("Template created");
  };

  return (
    <div>
      <PageHeader
        title="Templates"
        subtitle={`${templates.length} total`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus size={16} className="mr-1" /> New Template</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Template</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Template type (reminder, statement...)" value={templateType} onChange={e => setTemplateType(e.target.value)} />
                <Input placeholder="Channel (email, sms...)" value={channel} onChange={e => setChannel(e.target.value)} />
                <Input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
                <Textarea placeholder="Body (use {{variable}} for merge fields)" value={body} onChange={e => setBody(e.target.value)} className="font-mono text-xs" rows={6} />
                <Button onClick={create} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      {loading ? (
        <div className="p-6 text-muted-foreground text-sm">Loading...</div>
      ) : templates.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title="No templates" description="Templates define message content for actions." />
      ) : (
        <div className="divide-y divide-border">
          {templates.map(t => (
            <div key={t.id} className="px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t.subject || t.template_type}</span>
                  <span className="text-xs font-mono text-muted-foreground">{t.template_type}</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{t.channel}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 font-mono">{t.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
