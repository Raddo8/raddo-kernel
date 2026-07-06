import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";
import { SeoHead } from "@/components/SeoHead";
import { DossierPageBand } from "@/components/dossier/DossierPageBand";

type PageState = "loading" | "valid" | "expired" | "responded" | "invalid" | "submitted";

interface Option {
  key: string;
  label: string;
}

/**
 * Public single-use response surface. Reskinned to the dossier identity;
 * token/get-response/submit-response wiring is unchanged.
 */
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
    <main className="min-h-screen bg-raddo-paper">
      <SeoHead
        path="/respond"
        title="Respond · COB"
        description="Secure single-use response surface."
        robots="noindex,nofollow"
      />
      <DossierPageBand
        chip={itemRef ? `respond · ${itemRef}` : "respond · single-use"}
        headline="Register your"
        keyword="decision"
        headlineTrail="."
        subhead="A single-use response surface. Your selection is recorded once and cannot be changed."
        backHref={null}
      />
      <section className="mx-auto flex max-w-lg items-center justify-center px-6 py-16 md:py-20">
        <div
          className="dossier-navy-shadow w-full bg-white p-8 md:p-10"
          style={{ border: "1px solid hsl(var(--raddo-paper-edge))", borderRadius: 8 }}
        >
          {state === "loading" && (
            <div className="flex flex-col items-center gap-3 text-raddo-ash">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Loading…</p>
            </div>
          )}

          {state === "valid" && (
            <>
              <p
                className="font-mono uppercase text-raddo-brass-deep mb-2"
                style={{ fontSize: 10, letterSpacing: "0.22em", fontWeight: 700 }}
              >
                select an option
              </p>
              <h2
                className="font-display text-raddo-ink-deep mb-6"
                style={{ fontWeight: 700, fontSize: 22, lineHeight: 1.2 }}
              >
                One decision · one record.
              </h2>
              <div className="space-y-2">
                {options.map((o) => (
                  <button
                    key={o.key}
                    onClick={() => handleSelect(o.key)}
                    disabled={submitting}
                    className="w-full text-left px-4 py-3 font-sans text-raddo-ink-deep hover:bg-raddo-paper-edge/40 disabled:opacity-60"
                    style={{
                      border: "1px solid hsl(var(--raddo-paper-edge))",
                      borderRadius: 4,
                      fontSize: 14,
                    }}
                  >
                    {submitting ? <Loader2 className="inline h-4 w-4 mr-2 animate-spin" /> : null}
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {state === "submitted" && (
            <div className="flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="h-10 w-10 text-raddo-brass" />
              <h1 className="font-display text-raddo-ink-deep" style={{ fontSize: 20, fontWeight: 700 }}>
                Response received
              </h1>
              <p className="text-sm text-raddo-ash">Thank you. You may close this page.</p>
            </div>
          )}

          {state === "expired" && (
            <div className="flex flex-col items-center gap-3 text-center">
              <Clock className="h-10 w-10 text-raddo-ash" />
              <h1 className="font-display text-raddo-ink-deep" style={{ fontSize: 20, fontWeight: 700 }}>
                This link has expired
              </h1>
              <p className="text-sm text-raddo-ash">Please contact the sender for a new link.</p>
            </div>
          )}

          {state === "responded" && (
            <div className="flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="h-10 w-10 text-raddo-ash" />
              <h1 className="font-display text-raddo-ink-deep" style={{ fontSize: 20, fontWeight: 700 }}>
                You have already responded
              </h1>
              <p className="text-sm text-raddo-ash">Your response was recorded.</p>
            </div>
          )}

          {state === "invalid" && (
            <div className="flex flex-col items-center gap-3 text-center">
              <AlertCircle className="h-10 w-10 text-raddo-ash" />
              <h1 className="font-display text-raddo-ink-deep" style={{ fontSize: 20, fontWeight: 700 }}>
                This link is not valid
              </h1>
              <p className="text-sm text-raddo-ash">Please check the link and try again.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
