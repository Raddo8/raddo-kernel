import { ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type Verdict =
  | { kind: "loading" }
  | { kind: "allow" }
  | { kind: "redirect"; to: string }
  | { kind: "blocked"; status: "REVOKED" | "SUSPENDED" };

/**
 * A surface pin is not an entitlement. HQ opens only for a resolved, ACTIVE
 * membership whose tenant has actually gone live.
 */
export function ClientReadinessGate({ children }: { children: ReactNode }) {
  const [verdict, setVerdict] = useState<Verdict>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    const resolve = async (): Promise<Verdict> => {
      const { data, error } = await supabase.rpc("resolve_tenant_context", {
        p_session_id: null,
      });
      if (error) return { kind: "redirect", to: "/signin" };

      const row = Array.isArray(data) ? data[0] : data;
      const status = row?.out_status as string | undefined;
      const cid = row?.out_cid as string | null | undefined;

      switch (status) {
        case "OK": {
          if (!cid) return { kind: "redirect", to: "/start" };
          const { data: tenant } = await supabase
            .from("tenants")
            .select("status")
            .eq("cid", cid)
            .maybeSingle();
          return tenant?.status === "live"
            ? { kind: "allow" }
            : { kind: "redirect", to: "/start/progress" };
        }
        case "NO_MEMBERSHIP":
          return { kind: "redirect", to: "/start" };
        case "AMBIGUOUS":
          return { kind: "redirect", to: "/start/select-workspace" };
        case "REVOKED":
        case "SUSPENDED":
          return { kind: "blocked", status };
        default:
          return { kind: "redirect", to: "/signin" };
      }
    };

    void resolve().then((v) => {
      if (!cancelled) setVerdict(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (verdict.kind === "loading") {
    return (
      <main className="min-h-screen bg-dossier-paper flex items-center justify-center">
        <p
          className="font-mono uppercase text-dossier-ash"
          style={{ fontSize: 10, letterSpacing: "0.22em" }}
        >
          opening your COB…
        </p>
      </main>
    );
  }

  if (verdict.kind === "redirect") return <Navigate to={verdict.to} replace />;

  if (verdict.kind === "blocked") {
    return (
      <main className="min-h-screen bg-dossier-paper flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p
            className="font-mono uppercase mb-3"
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              color: "hsl(var(--dossier-brass-deep))",
              fontWeight: 700,
            }}
          >
            access · not active
          </p>
          <h1
            className="font-display text-dossier-ink-deep"
            style={{ fontWeight: 800, fontSize: "1.75rem", lineHeight: 1.15 }}
          >
            This COB is not active right now
          </h1>
          <p className="mt-4 text-sm text-dossier-ash">
            Access for your account has been paused. If you think that is a mistake,
            write to cob@chiefofbusiness.ai and we will look into it.
          </p>
        </div>
      </main>
    );
  }


  return <>{children}</>;
}

export default ClientReadinessGate;
