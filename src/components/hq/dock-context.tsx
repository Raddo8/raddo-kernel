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

/** A message handed to the dock composer. The nonce lets the dock react to the
 *  same text being composed twice. Nothing is sent until the client presses send. */
export type DockCompose = { text: string; nonce: number };

type Ctx = {
  page: DockPageContext;
  setPage: (next: DockPageContext) => void;
  compose: DockCompose | null;
  composeMessage: (text: string) => void;
};

const DockCtx = createContext<Ctx | null>(null);

/** Pages render `<HqShell>` themselves, so a page component sits ABOVE this
 *  provider in the tree and cannot read the context. A tiny module bus carries
 *  a composed message down to the dock. It is still read-only: the text lands
 *  in the composer and the client presses send. */
const composeListeners = new Set<(text: string) => void>();

export function composeToDock(text: string) {
  composeListeners.forEach((fn) => fn(text));
}

export function DockContextProvider({
  initial,
  children,
}: {
  initial: DockPageContext;
  children: ReactNode;
}) {
  const [page, setPage] = useState<DockPageContext>(initial);
  const [compose, setCompose] = useState<DockCompose | null>(null);

  const composeMessage = useCallback((text: string) => {
    setCompose((prev) => ({ text, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    composeListeners.add(composeMessage);
    return () => {
      composeListeners.delete(composeMessage);
    };
  }, [composeMessage]);

  // Route changes re-seed the label; a page may then refine it.
  useEffect(() => {
    setPage(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.label]);

  const value = useMemo<Ctx>(() => ({ page, setPage, compose, composeMessage }), [page, compose, composeMessage]);
  return <DockCtx.Provider value={value}>{children}</DockCtx.Provider>;
}

export function useDockContext(): Ctx {
  const ctx = useContext(DockCtx);
  if (!ctx) throw new Error("useDockContext must be used inside DockContextProvider");
  return ctx;
}

/** Page-side helper · hand a composed message to the dock. Safe anywhere. */
export function useComposeToDock(): (text: string) => void {
  return composeToDock;
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
