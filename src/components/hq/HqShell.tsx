/** HqShell · the uniform HQ chrome.
 *
 * Tokens, rail structure, logo tile, and active-state treatment are taken
 * verbatim from the pinned client HQ document (surface_version hq v29-r28,
 * extracted into src/hq-next/styles/hq-golden.css, scoped `.hqg`).
 * Every /hq/* React page renders inside this shell so the family is uniform.
 *
 * Identity is server-derived (current_cid), never self-asserted.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import "@/hq-next/styles/hq-golden.css";
import "@/hq-next/styles/hq-records.css";
import "@/hq-next/styles/hq-brand.css";
import { CobMark } from "./CobMark";
import { CobIdentityProvider, useCob } from "@/lib/cob-identity";

import { CobDock } from "./CobDock";
import { DockContextProvider, type DockPageContext } from "./dock-context";

interface NavItem {
  n: string;
  label: string;
  to: string;
  disabled?: boolean;
}

/** Rail order is the principal's reading order, not alphabetical.
 *  Items carrying a page_key only appear when the server entitles them. */
const NAV: (NavItem & { pageKey?: string })[] = [
  { n: "01", label: "HQ", to: "/hq" },
  { n: "02", label: "The World", to: "/hq/world" },
  { n: "03", label: "Memories", to: "/hq/memories" },
  { n: "04", label: "BOB \u00b7 Blueprints", to: "/hq/blueprints" },
  { n: "05", label: "AID \u00b7 Agents", to: "/hq/agents", disabled: true },
  { n: "06", label: "The Boardroom", to: "/hq/boardroom", pageKey: "boardroom" },
  { n: "07", label: "The original HQ", to: "/hq/original" },
];

/** Control group · only ever rendered for a server-confirmed fleet operator. */
const CONTROL_NAV: NavItem[] = [{ n: "C1", label: "Records", to: "/hq/records" }];

const LENS_KEY = "hq.rail.lens";

/** Page keys the server has entitled for this principal. */
function useEntitledPages(): Set<string> {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    void supabase.rpc("hq_my_pages").then(({ data, error }) => {
      if (cancelled || error || !Array.isArray(data)) return;
      const next = new Set<string>();
      for (const row of data as { page_key?: string; enabled?: boolean }[]) {
        if (row?.page_key && row.enabled !== false) next.add(row.page_key);
      }
      setKeys(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return keys;
}

/** Plain-words label for whatever surface the principal is on. Read-only context. */
function labelForPath(pathname: string): string {
  if (pathname.startsWith("/hq/world/brief")) return "The World \u00b7 a subject brief";
  if (pathname.startsWith("/hq/world/registers")) return "The World \u00b7 records";
  if (pathname.startsWith("/hq/world")) return "The World";
  if (pathname.startsWith("/hq/memories")) return "Memories";
  if (pathname.startsWith("/hq/blueprints")) return "BOB \u00b7 Blueprints";
  if (pathname.startsWith("/hq/boardroom")) return "The Boardroom";
  if (pathname.startsWith("/hq/records")) return "Records";
  if (pathname.startsWith("/hq/original")) return "The original HQ";
  if (pathname.startsWith("/hq/profile")) return "Profile";
  return "HQ";
}

/** Server-derived operator flag. Client state never opens this gate. */
export function useIsOperator(): boolean | undefined {
  const [op, setOp] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void supabase.rpc("is_fleet_operator").then(({ data, error }) => {
      if (live) setOp(!error && data === true);
    });
    return () => {
      live = false;
    };
  }, []);
  return op;
}

/** Server-resolved client id for the rail sub-line. */
function useCid(): string | null {
  const [cid, setCid] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void supabase.rpc("current_cid").then(({ data, error }) => {
      if (live && !error) setCid((data as string | null) ?? null);
    });
    return () => {
      live = false;
    };
  }, []);
  return cid;
}

function HqShellInner({ children }: { children: ReactNode }) {
  const cid = useCid();
  const { cobName } = useCob();

  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const isOperator = useIsOperator();
  const entitledPages = useEntitledPages();
  const [lens, setLens] = useState<"admin" | "me">(() => {
    try {
      return localStorage.getItem(LENS_KEY) === "me" ? "me" : "admin";
    } catch {
      return "admin";
    }
  });

  const setLensPersisted = (next: "admin" | "me") => {
    setLens(next);
    try {
      localStorage.setItem(LENS_KEY, next);
    } catch {
      /* a private-mode browser simply does not remember the lens */
    }
  };

  const dockSeed = useMemo<DockPageContext>(
    () => ({ label: labelForPath(pathname), record: null }),
    [pathname],
  );

  return (
    <DockContextProvider initial={dockSeed}>
    <div className="hqg">

      <button
        type="button"
        className="rail-toggle"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <CobMark className="shmark" />
        <span>Menu</span>
      </button>

      <aside className={`rail ${open ? "open" : ""}`}>
        <div className="rail-brand">
          <div className="mark">
            <div className="mark-tile">
              <CobMark />
            </div>
            <div>
              {/* The name is the client's own. Blank beats flashing a default. */}
              <div className="mark-name">{cobName ? `${cobName} \u00b7 HQ` : "\u00a0"}</div>
              <div className="mark-sub" title={cobName ? `Your account number with ${cobName}` : "Your account number"}>

                {cid ?? "loading\u2026"}
              </div>
            </div>
          </div>

          {isOperator === true && (
            <div className="rec-toggle" role="group" aria-label="Rail lens">
              <button
                type="button"
                className={lens === "admin" ? "on" : ""}
                aria-pressed={lens === "admin"}
                onClick={() => setLensPersisted("admin")}
              >
                Admin
              </button>
              <button
                type="button"
                className={lens === "me" ? "on" : ""}
                aria-pressed={lens === "me"}
                onClick={() => setLensPersisted("me")}
              >
                Me
              </button>
            </div>
          )}
        </div>


        <nav className="rail-nav" aria-label="HQ">
          <div className="nav-k">Your HQ</div>
          {NAV.filter((item) => !item.pageKey || entitledPages.has(item.pageKey)).map((item) =>
            item.disabled ? (
              <span key={item.label} className="nl off" aria-disabled="true">
                <span className="nn">{item.n}</span>
                <span>{item.label}</span>
                <span className="soon">soon</span>
              </span>
            ) : (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.to === "/hq"}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `nl ${isActive || pathname === item.to ? "on" : ""}`
                }
              >
                <span className="nn">{item.n}</span>
                <span>{item.label}</span>
              </NavLink>
            ),
          )}

          {isOperator === true && lens === "admin" && (
            <>
              <div className="nav-k">Control &middot; admin only</div>
              {CONTROL_NAV.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `nl ${isActive || pathname === item.to ? "on" : ""}`
                  }
                >
                  <span className="nn">{item.n}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>


        <div
          className="rail-foot"
          title={
            cobName
              ? `These pages show live information. To change anything, ask ${cobName}.`
              : "These pages show live information."
          }
        >
          <NavLink to="/hq/profile" className="nl" onClick={() => setOpen(false)}>
            <span className="nn">&middot;</span>
            <span>Profile</span>
          </NavLink>
          <span className="dot" />
          always up to date &middot; you can read, not change
          {cobName ? (
            <>
              <br />
              to change anything, ask {cobName}
            </>
          ) : null}
        </div>
      </aside>

      {open && <div className="rail-scrim" onClick={() => setOpen(false)} />}

      <div className="main">{children}</div>

      <CobDock />
    </div>
    </DockContextProvider>
  );
}

/** One provider at the top of the HQ chrome so a single name fetch serves the tree. */
export function HqShell({ children }: { children: ReactNode }) {
  return (
    <CobIdentityProvider>
      <HqShellInner>{children}</HqShellInner>
    </CobIdentityProvider>
  );
}

export default HqShell;

