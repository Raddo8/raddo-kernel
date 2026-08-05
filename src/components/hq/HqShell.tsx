/** HqShell · the uniform HQ chrome.
 *
 * Tokens, rail structure, logo tile, and active-state treatment are taken
 * verbatim from the pinned client HQ document (surface_version hq v29-r28,
 * extracted into src/hq-next/styles/hq-golden.css, scoped `.hqg`).
 * Every /hq/* React page renders inside this shell so the family is uniform.
 *
 * Identity is server-derived (current_cid), never self-asserted.
 */
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import "@/hq-next/styles/hq-golden.css";
import "@/hq-next/styles/hq-records.css";
import cobMark from "@/assets/cob-mark.png.asset.json";

interface NavItem {
  n: string;
  label: string;
  to: string;
  disabled?: boolean;
}

/** Rail order is the principal's reading order, not alphabetical. */
const NAV: NavItem[] = [
  { n: "01", label: "HQ", to: "/hq" },
  { n: "02", label: "The World", to: "/hq/world" },
  { n: "03", label: "BOB \u00b7 Blueprints", to: "/hq/blueprints" },
  { n: "04", label: "Memories", to: "/hq/memories" },
  { n: "05", label: "AID \u00b7 Agents", to: "/hq/agents", disabled: true },
];

/** Control group · only ever rendered for a server-confirmed fleet operator. */
const CONTROL_NAV: NavItem[] = [{ n: "C1", label: "Records", to: "/hq/records" }];

const LENS_KEY = "hq.rail.lens";

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

export function HqShell({ children }: { children: ReactNode }) {
  const cid = useCid();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const isOperator = useIsOperator();
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

  return (
    <div className="hqg">
      <button
        type="button"
        className="rail-toggle"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <img className="shmark" src={cobMark.url} alt="" />
        <span>Menu</span>
      </button>

      <aside className={`rail ${open ? "open" : ""}`}>
        <div className="rail-brand">
          <div className="mark">
            <div className="mark-tile">
              <img src={cobMark.url} alt="COB" />
            </div>
            <div>
              <div className="mark-name">COB &middot; HQ</div>
              <div className="mark-sub">{cid ?? "resolving\u2026"}</div>
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
          {NAV.map((item) =>
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


        <div className="rail-foot">
          <span className="dot" />
          read live &middot; read only
        </div>
      </aside>

      {open && <div className="rail-scrim" onClick={() => setOpen(false)} />}

      <div className="main">{children}</div>
    </div>
  );
}

export default HqShell;
