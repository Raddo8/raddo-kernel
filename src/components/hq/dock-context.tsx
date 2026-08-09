/** Dock page context · lets an HQ page tell the dock what the principal is looking at.
 *
 * Read-only by construction. The dock carries this as conversation context;
 * it never writes it anywhere. COB is the only pen.
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

export type DockPageContext = {
  /** Human label for the surface, e.g. "Your World · Lane: Revenue". */
  label: string;
  /** Optional record the principal has open. */
  record?: string | null;
};

type Ctx = {
  page: DockPageContext;
  setPage: (next: DockPageContext) => void;
};

const DockCtx = createContext<Ctx | null>(null);

export function DockContextProvider({
  initial,
  children,
}: {
  initial: DockPageContext;
  children: ReactNode;
}) {
  const [page, setPage] = useState<DockPageContext>(initial);

  // Route changes re-seed the label; a page may then refine it.
  useEffect(() => {
    setPage(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.label]);

  const value = useMemo<Ctx>(() => ({ page, setPage }), [page]);
  return <DockCtx.Provider value={value}>{children}</DockCtx.Provider>;
}

export function useDockContext(): Ctx {
  const ctx = useContext(DockCtx);
  if (!ctx) throw new Error("useDockContext must be used inside DockContextProvider");
  return ctx;
}

/** Page-side helper · declare what this surface is showing. Safe outside the provider. */
export function useDeclareDockContext(next: DockPageContext) {
  const ctx = useContext(DockCtx);
  const setPage = ctx?.setPage;
  const label = next.label;
  const record = next.record ?? null;
  const declare = useCallback(() => {
    setPage?.({ label, record });
  }, [setPage, label, record]);
  useEffect(declare, [declare]);
}
