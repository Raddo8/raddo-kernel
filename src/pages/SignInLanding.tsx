import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Post-authentication router. Waits for a session, then sends operators to
 * /control and everyone else to /hq.
 */
export function SignInLanding() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const route = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return false;
      if (!data.session) return false;
      const { data: isOperator } = await supabase.rpc("is_cob_operator");
      if (cancelled) return true;
      navigate(isOperator === true ? "/control" : "/hq", { replace: true });
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
  }, [navigate]);

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
