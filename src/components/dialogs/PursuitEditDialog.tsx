import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { writeAuditEvent } from "@/lib/audit";

/**
 * Editing pursuit metadata. Money fields here (setup_usd, ongoing_monthly_usd,
 * etc.) live under `metadata.pricing` as historical seed context ONLY — the
 * board rollup and revenue timeline derive from `revenue_schedules` when any
 * exist for this pursuit.
 */
export default function PursuitEditDialog({
  item, open, onOpenChange, onSaved, actorEmail,
}: {
  item: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  actorEmail?: string | null;
}) {
  const [cohort, setCohort] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [setupUsd, setSetupUsd] = useState("");
  const [monthlyUsd, setMonthlyUsd] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    const md = item.metadata || {};
    setCohort(md.cohort ?? "");
    setSubdomain(md.subdomain_slug ?? "");
    const p = md.pricing || {};
    const setup = p.setup_usd ?? p.build_usd ?? p.deposit_usd ?? "";
    const monthly = p.ongoing_monthly_usd ?? p.platform_monthly_usd ?? p.consulting_monthly_usd ?? "";
    setSetupUsd(setup === "" ? "" : String(setup));
    setMonthlyUsd(monthly === "" ? "" : String(monthly));
  }, [item?.id, open]);

  if (!item) return null;

  const save = async () => {
    setSaving(true);
    const md = { ...(item.metadata || {}) };
    if (cohort.trim()) md.cohort = cohort.trim(); else delete md.cohort;
    if (subdomain.trim()) md.subdomain_slug = subdomain.trim(); else delete md.subdomain_slug;

    const pricing: any = { ...(md.pricing || {}) };
    if (setupUsd !== "") pricing.setup_usd = Number(setupUsd);
    else delete pricing.setup_usd;
    if (monthlyUsd !== "") pricing.ongoing_monthly_usd = Number(monthlyUsd);
    else delete pricing.ongoing_monthly_usd;
    if (Object.keys(pricing).length === 0) delete md.pricing;
    else md.pricing = pricing;

    const { error } = await supabase.from("items").update({ metadata: md }).eq("id", item.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    await writeAuditEvent({
      accountId: item.account_id,
      itemId: item.id,
      subject: "pursuit details updated",
      actorEmail: actorEmail ?? null,
      changes: [
        { field: "cohort", before: item.metadata?.cohort ?? null, after: md.cohort ?? null },
        { field: "subdomain_slug", before: item.metadata?.subdomain_slug ?? null, after: md.subdomain_slug ?? null },
        { field: "pricing.setup_usd (historical seed)", before: item.metadata?.pricing?.setup_usd ?? null, after: pricing.setup_usd ?? null },
        { field: "pricing.ongoing_monthly_usd (historical seed)", before: item.metadata?.pricing?.ongoing_monthly_usd ?? null, after: pricing.ongoing_monthly_usd ?? null },
      ],
    });
    setSaving(false);
    onOpenChange(false);
    onSaved();
    toast.success("Pursuit updated");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit pursuit details</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Cohort" value={cohort} onChange={e => setCohort(e.target.value)} />
            <Input placeholder="Subdomain slug" value={subdomain} onChange={e => setSubdomain(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" placeholder="Setup (one-time USD)" value={setupUsd} onChange={e => setSetupUsd(e.target.value)} />
            <Input type="number" placeholder="Monthly (USD)" value={monthlyUsd} onChange={e => setMonthlyUsd(e.target.value)} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Pricing here is historical seed context. Once any revenue schedule is
            created for this pursuit, the board rollup, forecast and calendar
            derive from those schedules — this metadata is ignored.
          </p>
          <Button onClick={save} className="w-full" disabled={saving}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
