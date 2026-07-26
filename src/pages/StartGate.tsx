import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { DossierFieldLabel } from "@/components/dossier/DossierSplit";

type MyTenant = { cid: string | null };
type RedeemResult = { ok: boolean; cid?: string; display_name?: string; reason?: string };

const REASON_COPY: Record<string, string> = {
  "invalid-code": "That code isn't recognized.",
  expired: "That code has expired.",
  "used-up": "That code has already been used.",
  "name-too-short": "Give your business name at least two characters.",
  "not-signed-in": "Sign in first, then enter your code.",
};

/**
 * Access-code gate in front of onboarding. Returning clients (tenant already
 * minted) pass straight through; everyone else redeems a code first.
 */
export function StartGate({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [cleared, setCleared] = useState(false);

  const [code, setCode] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [chiefName, setChiefName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.rpc("my_tenant").then(({ data }) => {
      if (cancelled) return;
      const cid = (data as MyTenant | null)?.cid ?? null;
      setCleared(Boolean(cid));
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("redeem_access_code", {
        p_code: code.trim(),
        p_display_name: businessName.trim(),
        p_cob_name: chiefName.trim() || "COB",
      });
      if (rpcError) throw new Error("unknown");
      const result = data as unknown as RedeemResult | null;
      if (result?.ok) {
        toast.success("Welcome. Your workspace is being prepared.");
        setCleared(true);
        return;
      }
      setError(REASON_COPY[result?.reason ?? ""] ?? "We couldn't accept that code.");
    } catch {
      setError("We couldn't accept that code.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!checked) return null;
  if (cleared) return <>{children}</>;

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-6 py-12"
      style={{ background: "hsl(var(--dossier-paper))" }}
    >
      <div
        className="dossier-navy-shadow w-full max-w-md bg-white p-8 md:p-10"
        style={{ border: "1px solid hsl(var(--dossier-paper-edge))", borderRadius: 8 }}
      >
        <p
          className="font-mono uppercase mb-3"
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            color: "hsl(var(--dossier-brass-deep))",
            fontWeight: 700,
          }}
        >
          welcome · one step first
        </p>
        <h1
          className="font-display text-dossier-ink-deep"
          style={{ fontWeight: 800, fontSize: "1.75rem", lineHeight: 1.15 }}
        >
          You're on the list?
        </h1>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <DossierFieldLabel htmlFor="start-code">Access code</DossierFieldLabel>
            <Input
              id="start-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              required
              className="bg-white border-dossier-paper-edge text-dossier-ink-deep font-mono"
              style={{ borderRadius: 4, letterSpacing: "0.08em" }}
            />
          </div>

          <div>
            <DossierFieldLabel htmlFor="start-business">Your business name</DossierFieldLabel>
            <Input
              id="start-business"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
              minLength={2}
              className="bg-white border-dossier-paper-edge text-dossier-ink-deep"
              style={{ borderRadius: 4 }}
            />
            <p className="mt-2 text-sm text-dossier-ash">How your workspace will be titled.</p>
          </div>

          <div>
            <DossierFieldLabel htmlFor="start-chief">Name your Chief</DossierFieldLabel>
            <Input
              id="start-chief"
              value={chiefName}
              onChange={(e) => setChiefName(e.target.value)}
              placeholder="COB"
              className="bg-white border-dossier-paper-edge text-dossier-ink-deep"
              style={{ borderRadius: 4 }}
            />
            <p className="mt-2 text-sm text-dossier-ash">You can change this later.</p>
          </div>

          {error ? (
            <p role="alert" className="text-sm" style={{ color: "hsl(var(--dossier-brass-deep))" }}>
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
            style={{ borderRadius: 4, fontWeight: 600 }}
          >
            {submitting ? "…" : "Enter"}
          </Button>
        </form>
      </div>

      <p className="mt-6 max-w-md text-center text-sm text-dossier-ash">
        No code? Ask the person who sent you here, or write to us from the home page.
      </p>
    </main>
  );
}

export default StartGate;
