/** HOST COMPOSITIONS · the only hq-next files that touch app auth.
 *
 * Identity is resolved from the existing authenticated server context only:
 *   cid      → supabase.rpc("current_cid")   (same pattern as src/lib/surface.ts)
 *   tenant   → public.tenants row for that cid
 *   operator → supabase.rpc("is_fleet_operator")
 *
 * There is no hardcoded viewer, CID, tenant, email, or display name anywhere in
 * this graph. While identity resolves we render a loading state; if it fails we
 * render UNAUTHORIZED and pass nothing to the surfaces.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import HqNext from "./HqNext";
import type { Viewer } from "./useHqRead";
import { Section, StateBlock } from "./components/primitives";
import "./styles/hq-next.css";

type Resolution =
  | { kind: "loading" }
  | { kind: "ready"; viewer: Viewer }
  | { kind: "unauthorized" };

/** Server-derived viewer. Never self-asserted, never defaulted. */
function useResolvedViewer(): Resolution {
  const [state, setState] = useState<Resolution>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    const resolve = async (): Promise<Resolution> => {
      const cidRes = await supabase.rpc("current_cid");
      const cid = cidRes.error ? null : (cidRes.data as string | null);
      if (!cid) return { kind: "unauthorized" };

      const tenantRes = await supabase
        .from("tenants")
        .select("cid, cob_name")
        .eq("cid", cid)
        .maybeSingle();
      if (tenantRes.error) return { kind: "unauthorized" };

      const opRes = await supabase.rpc("is_fleet_operator");
      const isOperator = !opRes.error && opRes.data === true;

      return {
        kind: "ready",
        viewer: { isOperator, cid, tenant: tenantRes.data?.cob_name ?? cid },
      };
    };

    void resolve().then((r) => {
      if (!cancelled) setState(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

function HqNextHost() {
  const resolution = useResolvedViewer();

  if (resolution.kind === "loading") {
    return (
      <div className="hqx">
        <div className="hqx-app">
          <main className="hqx-main">
            <Section title="Identity">
              <p className="hqx-sub">resolving viewer from server context…</p>
            </Section>
          </main>
        </div>
      </div>
    );
  }

  if (resolution.kind === "unauthorized") {
    return (
      <div className="hqx">
        <div className="hqx-app">
          <main className="hqx-main">
            <Section title="Access">
              <StateBlock
                state="UNAUTHORIZED"
                reasons={["server context did not resolve a viewer"]}
              />
            </Section>
          </main>
        </div>
      </div>
    );
  }

  return <HqNext viewer={resolution.viewer} />;
}

/** /hq-next · client plane. Wrapped by AuthGate + ClientReadinessGate in App.tsx. */
export function HqNextClient() {
  return <HqNextHost />;
}

/** /control/hq-next · operator plane. Inherits AuthGate + FleetOperatorGate from ControlShell. */
export function HqNextOperator() {
  return <HqNextHost />;
}
