import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format, addDays } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  disposition: "case_open" | "case_closed";
  onConfirm: (args: { followUpDate?: string; reason: string }) => void;
}

export default function DispositionDialog({ open, onOpenChange, disposition, onConfirm }: Props) {
  const isOpen = disposition === "case_open";
  const [date, setDate] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [reason, setReason] = useState("");

  const submit = () => {
    if (isOpen && !date) return;
    onConfirm({ followUpDate: isOpen ? date : undefined, reason: reason.trim() });
    onOpenChange(false);
    setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isOpen ? "Case Open · revisit" : "Case Closed · do not contact"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {isOpen && (
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Revisit on
              </label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              <p className="text-[10px] font-mono text-muted-foreground mt-1">
                A "revisit" task will queue for this date.
              </p>
            </div>
          )}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Reason (one line)
            </label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Timing off · circle back after board" />
          </div>
          {!isOpen && (
            <p className="text-[11px] font-mono text-destructive/80">
              Flags the account do-not-contact everywhere.
            </p>
          )}
          <Button className="w-full" onClick={submit} disabled={isOpen && !date}>
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
