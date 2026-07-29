import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Post-authentication router. Authority is resolved BEFORE any ?next= is
 * honoured, so a destination the subject is not entitled to is discarded.
 */
export function SignInLanding() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(location.search);
    const raw = params.get("next");
    // Same-origin paths only · never honor an absolute URL.
    const next = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : null;

    /** Where the subject belongs when no authorized `next` applies. */
    const defaultRoute = async (isOperator: boolean): Promise<string> => {
      if (isOperator) return "/control";
      const { data, error } = await supabase.rpc("resolve_tenant_context", {
        p_session_id: null,
      });
      if (error) return "/signin";
      const row = Array.isArray(data) ? data[0] : data;
      const status = row?.out_status as string | undefined;
      const cid = row?.out_cid as string | null | undefined;
      switch (status) {
        case "OK": {
          if (!cid) return "/start";
          const { data: tenant } = await supabase
            .from("tenants")
            .select("status")
            .eq("cid", cid)
            .maybeSingle();
          return tenant?.status === "live" ? "/hq" : "/start/progress";
        }
        case "NO_MEMBERSHIP":
          return "/start";
        case "AMBIGUOUS":
          return "/start/select-workspace";
        case "REVOKED":
        case "SUSPENDED":
          return "/hq"; // ClientReadinessGate renders the blocked page.
        default:
          return "/signin";
      }
    };

    const route = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return false;
      if (!data.session) return false;

      const { data: fleet } = await supabase.rpc("is_fleet_operator");
      if (cancelled) return true;
      const isOperator = fleet === true;

      const home = await defaultRoute(isOperator);
      if (cancelled) return true;

      if (next) {
        const wantsControl = next === "/control" || next.startsWith("/control/");
        const wantsHq = next === "/hq" || next.startsWith("/hq/");
        // Honour `next` only where authority for that zone is proven.
        if (wantsControl && isOperator) {
          navigate(next, { replace: true });
          return true;
        }
        if (wantsHq && home === "/hq") {
          navigate(next, { replace: true });
          return true;
        }
        if (!wantsControl && !wantsHq) {
          navigate(next, { replace: true });
          return true;
        }
      }

      navigate(home, { replace: true });
      return true;
    };



    void route().then((handled) => {
      if (handled || cancelled) return;
      // Session may still be hydrating from an OAuth redirect.
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
        if (session) void route();
      });
      const timeout = window.setTimeout(() => {
        if (!cancelled) navigate("/signin", { replace: true });
      }, 8000);
      cleanup = () => {
        subscription.unsubscribe();
        window.clearTimeout(timeout);
      };
    });

    let cleanup: (() => void) | undefined;
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [navigate, location.search]);

  return (
    <main className="min-h-screen bg-dossier-paper flex items-center justify-center">
      <p
        className="font-mono uppercase text-dossier-ash"
        style={{ fontSize: 10, letterSpacing: "0.22em" }}
      >
        signing you in…
      </p>
    </main>
  );
}

export default SignInLanding;
