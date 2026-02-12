import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";

type PageState = "loading" | "valid" | "expired" | "responded" | "invalid" | "submitted";

interface Option {
  key: string;
  label: string;
}

export default function RespondPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>("loading");
  const [options, setOptions] = useState<Option[]>([]);
  const [itemRef, setItemRef] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }

    supabase.functions.invoke("get-response", { body: { token } }).then(({ data, error }) => {
      if (error || !data) { setState("invalid"); return; }
      if (data.valid) {
        setOptions(data.options || []);
        setItemRef(data.item_ref || "");
        setState("valid");
      } else {
        const map: Record<string, PageState> = {
          TOKEN_EXPIRED: "expired",
          ALREADY_RESPONDED: "responded",
        };
        setState(map[data.reason_code] || "invalid");
      }
    });
  }, [token]);

  const handleSelect = async (key: string) => {
    if (!token || submitting) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("submit-response", {
      body: { token, selected_option: key },
    });
    if (error || !data?.valid) {
      setState(data?.reason_code === "ALREADY_RESPONDED" ? "responded" : "invalid");
    } else {
      setState("submitted");
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {state === "loading" && (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Loading…</p>
          </div>
        )}

        {state === "valid" && (
          <>
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground font-mono">Reference: {itemRef}</p>
              <h1 className="text-lg font-semibold">Please select an option</h1>
            </div>
            <div className="space-y-2">
              {options.map((o) => (
                <Button
                  key={o.key}
                  variant="outline"
                  className="w-full justify-start h-12"
                  disabled={submitting}
                  onClick={() => handleSelect(o.key)}
                >
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {o.label}
                </Button>
              ))}
            </div>
          </>
        )}

        {state === "submitted" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-primary" />
            <h1 className="text-lg font-semibold">Response received</h1>
            <p className="text-sm text-muted-foreground">Thank you. You may close this page.</p>
          </div>
        )}

        {state === "expired" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Clock className="h-10 w-10 text-muted-foreground" />
            <h1 className="text-lg font-semibold">This link has expired</h1>
            <p className="text-sm text-muted-foreground">Please contact the sender for a new link.</p>
          </div>
        )}

        {state === "responded" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-muted-foreground" />
            <h1 className="text-lg font-semibold">You have already responded</h1>
            <p className="text-sm text-muted-foreground">Your response was recorded.</p>
          </div>
        )}

        {state === "invalid" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <h1 className="text-lg font-semibold">This link is not valid</h1>
            <p className="text-sm text-muted-foreground">Please check the link and try again.</p>
          </div>
        )}
      </div>
    </div>
  );
}
