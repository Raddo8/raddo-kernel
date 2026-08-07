/** COB identity · one fetch of the client's own COB name for the whole tree.
 *
 * The name has exactly one owner: tenants.cob_name, normalized server side.
 * We read it with the RPC my_cob(), which resolves the caller's own tenant.
 * While it is loading we expose null so callers can render nothing rather
 * than flashing a default.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/integrations/supabase/client";

export interface CobIdentity {
  cid: string | null;
  cobName: string | null;
  named: boolean;
  displayName: string | null;
  principal: string | null;
  status: string | null;
}

interface CobCtx extends CobIdentity {
  /** True until the first resolution settles. */
  loading: boolean;
  refresh: () => Promise<void>;
}

const EMPTY: CobIdentity = {
  cid: null,
  cobName: null,
  named: false,
  displayName: null,
  principal: null,
  status: null,
};

const Ctx = createContext<CobCtx | null>(null);

type MyCobRow = {
  cid?: string | null;
  cob_name?: string | null;
  named?: boolean | null;
  display_name?: string | null;
  principal?: string | null;
  status?: string | null;
};

export function CobIdentityProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<CobIdentity>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("my_cob");
    if (error || !data) {
      setValue(EMPTY);
      setLoading(false);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as MyCobRow;
    setValue({
      cid: row?.cid ?? null,
      cobName: row?.cob_name ?? null,
      named: row?.named === true,
      displayName: row?.display_name ?? null,
      principal: row?.principal ?? null,
      status: row?.status ?? null,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ctx = useMemo<CobCtx>(
    () => ({ ...value, loading, refresh: load }),
    [value, loading, load],
  );

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

/** The client's COB by name. Returns null while unresolved: render nothing, not a default. */
export function useCob(): CobCtx {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  // A component used outside the provider reads as unresolved rather than throwing.
  return { ...EMPTY, loading: true, refresh: async () => {} };
}

/** The client's COB name for prose. Falls back to a plain phrase, never the literal "your COB". */
export function useCobLabel(): string {
  return useCob().cobName ?? "your chief of business";
}
