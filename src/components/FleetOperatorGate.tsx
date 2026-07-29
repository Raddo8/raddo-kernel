import { ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * The only authority check for the operator zone. Authentication alone is not
 * authorization · `is_fleet_operator()` is the single source of truth.
 */
export function FleetOperatorGate({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("is_fleet_operator")
      .then(({ data, error }) => {
        if (cancelled) return;
        setAllowed(!error && data === true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (allowed === undefined) {
    return (
      <main className="min-h-screen bg-dossier-paper flex items-center justify-center">
        <p
          className="font-mono uppercase text-dossier-ash"
          style={{ fontSize: 10, letterSpacing: "0.22em" }}
        >
          checking authority…
        </p>
      </main>
    );
  }

  if (!allowed) return <Navigate to="/hq" replace />;
  return <>{children}</>;
}

export default FleetOperatorGate;
