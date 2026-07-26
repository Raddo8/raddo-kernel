import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SurfaceFrame } from "@/components/SurfaceFrame";
import NotFound from "@/pages/NotFound";

export default function PanelSurface() {
  const [operator, setOperator] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("is_cob_operator").then(({ data }) => {
      if (!cancelled) setOperator(data === true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (operator === undefined) return null;
  if (!operator) return <NotFound />;
  return <SurfaceFrame surfaceKey="panel" title="Panel" />;
}
