import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Search, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import cobLogo from "@/assets/cob-logo.png.asset.json";

// Customer-facing navigation only.
const NAV_LINKS: { label: string; href: string }[] = [
  { label: "Home", href: "/" },
  { label: "Consult", href: "/consult" },
  { label: "Client Sign In", href: "/signin" },
];

const EASE = [0.22, 1, 0.36, 1] as const;

function CornerMark({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const map: Record<typeof pos, string> = {
    tl: "left-1.5 top-1.5 border-l border-t",
    tr: "right-1.5 top-1.5 border-r border-t",
    bl: "left-1.5 bottom-1.5 border-l border-b",
    br: "right-1.5 bottom-1.5 border-r border-b",
  };
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-2 w-2 ${map[pos]} border-dossier-brass`}
    />
  );
}

type SiteHeaderProps = {
  /** Optional brass CTA rendered in the primary row (right of logo, left of icons). */
  cta?: { label: string; href: string; onClick?: () => void };
};

export function SiteHeader({ cta }: SiteHeaderProps = {}) {
  const reduce = useReducedMotion();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close menus on route change.
  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  // Focus search input when opened.
  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [searchOpen]);

  // ESC closes both.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <motion.header
        initial={reduce ? { y: 0, opacity: 1 } : { y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: reduce ? 0 : 0.6, ease: EASE, delay: reduce ? 0 : 0.08 }}
        className="fixed left-0 right-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4"
      >
        <div
          className="relative mx-auto max-w-[1240px]"
          style={{
            backgroundColor: "hsl(var(--dossier-paper) / 0.92)",
            border: "1px solid hsl(var(--dossier-paper-edge))",
            borderRadius: 8,
            boxShadow: scrolled
              ? "0 8px 24px -16px hsl(var(--dossier-ink-deep) / 0.18)"
              : "0 2px 8px -4px hsl(var(--dossier-ink-deep) / 0.08)",
            backdropFilter: "saturate(140%) blur(10px)",
            WebkitBackdropFilter: "saturate(140%) blur(10px)",
            transition: "box-shadow 220ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          <CornerMark pos="tl" />
          <CornerMark pos="tr" />
          <CornerMark pos="bl" />
          <CornerMark pos="br" />

          {/* Meta strip · top */}
          <div
            className="flex items-center justify-between font-mono"
            style={{
              padding: "8px 18px",
              borderBottom: "1px solid hsl(var(--dossier-paper-edge))",
              fontSize: 9.5,
              letterSpacing: "0.22em",
              color: "hsl(var(--dossier-ash))",
              textTransform: "uppercase",
            }}
          >
            <span>COB · EDITION 001</span>
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  backgroundColor: "hsl(var(--dossier-brass))",
                }}
              />
              <span className="hidden sm:inline">CLASSIFIED · FOR PRINCIPAL</span>
              <span className="sm:hidden">FOR PRINCIPAL</span>
            </span>
          </div>

          {/* Primary row */}
          <div className="flex items-center justify-between gap-3 px-4 py-1.5 sm:px-6 sm:py-2">
            <Link
              to="/"
              className="flex shrink-0 items-center gap-1.5 sm:gap-2"
              aria-label="COB · Home"
            >
              <img
                src={cobLogo.url}
                alt="COB"
                className="h-[1.5rem] w-auto sm:h-[2rem]"
                style={{ objectFit: "contain", transform: "translateY(-4px)" }}
              />
              <span
                className="font-display font-black text-[13px] sm:text-[16px]"
                style={{
                  color: "hsl(var(--dossier-brass))",
                  letterSpacing: "0.03em",
                  lineHeight: 1,
                }}
              >
                <span style={{ color: "hsl(var(--dossier-ink-deep))" }}>COB</span>{" "}
                <span style={{ color: "hsl(var(--dossier-ash))", fontWeight: 500 }}>
                  · Chief Of Business
                </span>
              </span>
            </Link>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {cta ? (
                <a
                  href={cta.href}
                  onClick={cta.onClick}
                  className="dossier-cta-brass hidden sm:inline-flex items-center gap-2 font-sans"
                  style={{
                    backgroundColor: "hsl(var(--dossier-brass))",
                    color: "hsl(var(--dossier-ink-deep))",
                    padding: "8px 14px",
                    borderRadius: 4,
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                  }}
                >
                  <span>{cta.label}</span>
                  <span aria-hidden>→</span>
                </a>
              ) : null}

              {/* The door · always visible so an invited client can find the way in. */}
              <Link
                to="/signin"
                className="dossier-cta-brass inline-flex items-center gap-2 font-sans"
                style={{
                  backgroundColor: "hsl(var(--dossier-brass))",
                  color: "hsl(var(--dossier-ink-deep))",
                  padding: "8px 14px",
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: "0.01em",
                  whiteSpace: "nowrap",
                }}
              >
                <span className="hidden sm:inline">Client Sign In</span>
                <span className="sm:hidden">Sign In</span>
              </Link>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setSearchOpen((v) => !v);
                }}
                aria-label={searchOpen ? "Close search" : "Open search"}
                aria-expanded={searchOpen}
                className="grid h-9 w-9 place-items-center rounded transition-colors"
                style={{
                  border: "1px solid hsl(var(--dossier-paper-edge))",
                  color: "hsl(var(--dossier-ink-deep))",
                  backgroundColor: searchOpen
                    ? "hsl(var(--dossier-brass) / 0.10)"
                    : "transparent",
                }}
              >
                {searchOpen ? <X size={16} strokeWidth={1.75} /> : <Search size={16} strokeWidth={1.75} />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setMenuOpen((v) => !v);
                }}
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
                aria-controls="site-header-menu"
                className="grid h-9 w-9 place-items-center rounded transition-colors"
                style={{
                  border: "1px solid hsl(var(--dossier-brass))",
                  color: "hsl(var(--dossier-brass-deep))",
                  backgroundColor: menuOpen
                    ? "hsl(var(--dossier-brass) / 0.12)"
                    : "transparent",
                }}
              >
                {menuOpen ? <X size={16} strokeWidth={1.75} /> : <Menu size={16} strokeWidth={1.75} />}
              </button>
            </div>
          </div>

          {/* Search drawer */}
          <AnimatePresence initial={false}>
            {searchOpen && (
              <motion.div
                key="search"
                initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={reduce ? { height: "auto", opacity: 0 } : { height: 0, opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.32, ease: EASE }}
                style={{ overflow: "hidden", borderTop: "1px solid hsl(var(--dossier-paper-edge))" }}
              >
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                  }}
                  className="flex items-center gap-3 px-4 py-3 sm:px-6"
                >
                  <Search size={16} strokeWidth={1.75} style={{ color: "hsl(var(--dossier-ash))" }} />
                  <input
                    ref={searchRef}
                    type="search"
                    placeholder="Search · briefings, sources, decisions"
                    className="w-full bg-transparent font-sans text-dossier-ink-deep placeholder:text-dossier-ash focus:outline-none"
                    style={{ fontSize: 15, letterSpacing: "0.01em" }}
                  />
                  <span
                    className="hidden font-mono sm:inline"
                    style={{
                      fontSize: 9.5,
                      letterSpacing: "0.22em",
                      color: "hsl(var(--dossier-ash))",
                      textTransform: "uppercase",
                    }}
                  >
                    ESC to close
                  </span>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Menu drawer */}
          <AnimatePresence initial={false}>
            {menuOpen && (
              <motion.nav
                id="site-header-menu"
                key="menu"
                initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={reduce ? { height: "auto", opacity: 0 } : { height: 0, opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.36, ease: EASE }}
                style={{ overflow: "hidden", borderTop: "1px solid hsl(var(--dossier-paper-edge))" }}
                aria-label="Primary"
              >
                <ul className="m-0 list-none p-0">
                  {NAV_LINKS.map((link, i) => {
                    const active = location.pathname === link.href;
                    return (
                      <li
                        key={link.href}
                        style={{
                          borderTop: i === 0 ? "none" : "1px solid hsl(var(--dossier-paper-edge))",
                        }}
                      >
                        <Link
                          to={link.href}
                          className="group flex items-center justify-between gap-4 px-4 py-3.5 sm:px-6"
                          style={{
                            color: "hsl(var(--dossier-ink-deep))",
                          }}
                        >
                          <span
                            className="font-mono"
                            style={{
                              fontSize: 9.5,
                              letterSpacing: "0.22em",
                              color: active
                                ? "hsl(var(--dossier-brass-deep))"
                                : "hsl(var(--dossier-ash))",
                              textTransform: "uppercase",
                              minWidth: 28,
                            }}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span
                            className="flex-1 font-display"
                            style={{
                              fontWeight: 700,
                              fontSize: 22,
                              letterSpacing: "-0.005em",
                              lineHeight: 1.1,
                            }}
                          >
                            {link.label}
                          </span>
                          <span
                            aria-hidden
                            className="grid h-7 w-7 place-items-center transition-transform group-hover:translate-x-0.5"
                            style={{
                              border: "1px solid hsl(var(--dossier-brass))",
                              borderRadius: 4,
                              color: "hsl(var(--dossier-brass-deep))",
                            }}
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path
                                d="M2 5h6M5.5 2l3 3-3 3"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="square"
                              />
                            </svg>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </motion.nav>
            )}
          </AnimatePresence>
        </div>
      </motion.header>

      {/* Spacer · keeps page content clear of the fixed header */}
      <div aria-hidden className="h-[88px] sm:h-[100px]" />
    </>
  );
}
