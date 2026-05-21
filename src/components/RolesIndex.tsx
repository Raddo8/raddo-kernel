import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ROLES, BAND_META, type RoleBand, type Role } from "@/lib/roles-index-data";

// Brand curve.
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

// Deterministic seeded PRNG · mulberry32. Stable scatter positions per role index.
function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Hierarchy band → vertical layer (0..1) used to suggest an org-chart spread.
const BAND_LAYER: Record<RoleBand, number> = {
  executive: 0.12,
  advisory: 0.12,
  functional: 0.50,
  operating: 0.78,
};

interface Scatter {
  // Fractional coordinates relative to canvas (0..1).
  fx: number;
  fy: number;
}

// Jittered-grid scatter · guarantees no overlap by assigning each role its own
// cell, then jittering within. 10 cols × 15 rows = 150 cells. Center 2 rows
// reserved for the "Your COB" marker (roles routed around them).
function computeScatter(roles: Role[]): Scatter[] {
  const rand = rng(20260521);
  const COLS = 8;
  const ROWS = 21; // 21 rows · skip rows 10 + 11 (center) → 19 usable × 8 = 152 cells (≥150)
  const cellW = 1 / COLS;
  const cellH = 1 / ROWS;
  const cells: { cx: number; cy: number }[] = [];
  for (let row = 0; row < ROWS; row++) {
    if (row === 10 || row === 11) continue; // reserve for COB marker
    for (let col = 0; col < COLS; col++) {
      const cx = (col + 0.5) * cellW;
      const cy = (row + 0.5) * cellH;
      cells.push({ cx, cy });
    }
  }
  // Shuffle cells deterministically so roles don't line up alphabetically.
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return roles.map((_role, i) => {
    const c = cells[i % cells.length];
    // ±25 % jitter within cell — enough to feel organic, never enough to collide.
    const jx = (rand() - 0.5) * cellW * 0.5;
    const jy = (rand() - 0.5) * cellH * 0.5;
    return { fx: Math.max(0.01, Math.min(0.99, c.cx + jx)), fy: Math.max(0.01, Math.min(0.99, c.cy + jy)) };
  });
}


interface RolesIndexProps {
  /** override IntersectionObserver threshold for tests */
  threshold?: number;
}

type Phase = "scattered" | "collapsing" | "resolved";

export function RolesIndex({ threshold = 0.35 }: RolesIndexProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const roleNodeRefs = useRef<Map<number, HTMLLIElement>>(new Map());
  const cobMarkerRef = useRef<HTMLDivElement | null>(null);
  const connectorSvgRef = useRef<SVGSVGElement | null>(null);
  const scatteredHeadlineRef = useRef<HTMLParagraphElement | null>(null);

  // Detect reduced motion + already-scrolled · resolved on first paint when either is true.
  const initialResolved = useMemo(() => {
    if (typeof window === "undefined") return true;
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    return Boolean(prefersReduced);
  }, []);

  const [phase, setPhase] = useState<Phase>(initialResolved ? "resolved" : "scattered");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const rolesByBand = useMemo(() => {
    const grouped: Record<RoleBand, Role[]> = {
      executive: [],
      operating: [],
      functional: [],
      advisory: [],
    };
    for (const r of ROLES) grouped[r.band].push(r);
    (Object.keys(grouped) as RoleBand[]).forEach((b) =>
      grouped[b].sort((a, c) => a.title.localeCompare(c.title))
    );
    return grouped;
  }, []);

  // Render order matches ROLES; need stable index for scatter map.
  const scatterByIndex = useMemo(() => computeScatter(ROLES), []);
  const indexByTitle = useMemo(() => {
    const m = new Map<string, number>();
    ROLES.forEach((r, i) => m.set(r.title, i));
    return m;
  }, []);

  // IntersectionObserver · fire collapse once when section crosses threshold.
  useEffect(() => {
    if (phaseRef.current === "resolved") return;
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setPhase("resolved");
      return;
    }

    // If already past threshold on mount, skip the scattered intro.
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    const visibleRatio = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0)) / Math.min(rect.height, vh);
    if (visibleRatio >= threshold) {
      // Defer one frame so layout is settled, then start collapse.
      requestAnimationFrame(() => startCollapse());
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= threshold) {
            obs.disconnect();
            startCollapse();
            break;
          }
        }
      },
      { threshold: [threshold] }
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold]);

  // FLIP collapse: nodes are rendered in their RESOLVED positions; in scattered phase
  // we apply per-node transforms to push them out to scatter coordinates. The collapse
  // is simply removing the transform (back to identity) with a transition.
  useLayoutEffect(() => {
    if (phase !== "scattered") return;
    applyScatterTransforms();
    // Reapply on resize while scattered.
    const onResize = () => {
      if (phaseRef.current === "scattered") applyScatterTransforms();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function applyScatterTransforms() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const cw = canvasRect.width;
    const ch = canvasRect.height;

    // COB marker scatter position: dead center of canvas.
    const cob = cobMarkerRef.current;
    let cobCenterX = cw / 2;
    let cobCenterY = ch / 2;
    if (cob) {
      const cobRect = cob.getBoundingClientRect();
      const cobRestX = cobRect.left - canvasRect.left + cobRect.width / 2;
      const cobRestY = cobRect.top - canvasRect.top + cobRect.height / 2;
      const dx = cobCenterX - cobRestX;
      const dy = cobCenterY - cobRestY;
      // Slight scale-up at scattered state to sell the consolidation.
      cob.style.transition = "none";
      cob.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.15)`;
    }

    // Role labels.
    const connectors: { x1: number; y1: number; x2: number; y2: number }[] = [];
    ROLES.forEach((_role, i) => {
      const el = roleNodeRefs.current.get(i);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const restX = rect.left - canvasRect.left + rect.width / 2;
      const restY = rect.top - canvasRect.top + rect.height / 2;
      const s = scatterByIndex[i];
      const targetX = s.fx * cw;
      const targetY = s.fy * ch;
      const dx = targetX - restX;
      const dy = targetY - restY;
      el.style.transition = "none";
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      el.style.opacity = "0.88";
      connectors.push({ x1: cobCenterX, y1: cobCenterY, x2: targetX, y2: targetY });
    });

    // Connectors.
    const svg = connectorSvgRef.current;
    if (svg) {
      svg.setAttribute("viewBox", `0 0 ${cw} ${ch}`);
      svg.style.opacity = "0.32";
      // Replace lines.
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const NS = "http://www.w3.org/2000/svg";
      connectors.forEach((c) => {
        const line = document.createElementNS(NS, "line");
        line.setAttribute("x1", String(c.x1));
        line.setAttribute("y1", String(c.y1));
        line.setAttribute("x2", String(c.x2));
        line.setAttribute("y2", String(c.y2));
        line.setAttribute("stroke", "#EF9F27");
        line.setAttribute("stroke-width", "1");
        svg.appendChild(line);
      });
    }

    // Force a reflow so the next phase change animates from these starts.
    void canvas.offsetHeight;
  }

  function startCollapse() {
    if (phaseRef.current !== "scattered") return;
    setPhase("collapsing");

    // Next frame · flip transitions on, then clear transforms to identity.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const cob = cobMarkerRef.current;
        if (cob) {
          cob.style.transition = `transform 1400ms ${EASE}`;
          cob.style.transform = "translate3d(0,0,0) scale(1)";
        }
        ROLES.forEach((_r, i) => {
          const el = roleNodeRefs.current.get(i);
          if (!el) return;
          el.style.transition = `transform 1200ms ${EASE} 200ms, opacity 400ms ${EASE} 800ms`;
          el.style.transform = "translate3d(0,0,0)";
          el.style.opacity = "1";
        });
        // Fade connectors.
        const svg = connectorSvgRef.current;
        if (svg) {
          svg.style.transition = `opacity 400ms ${EASE}`;
          svg.style.opacity = "0";
        }
        // Crossfade scattered headline out.
        const sh = scatteredHeadlineRef.current;
        if (sh) {
          sh.style.transition = `opacity 400ms ${EASE} 1000ms`;
          sh.style.opacity = "0";
        }

        window.setTimeout(() => setPhase("resolved"), 1650);
      });
    });
  }

  const showScattered = phase !== "resolved";

  return (
    <section
      ref={sectionRef}
      aria-labelledby="roles-index-heading"
      className="relative z-10 mx-auto w-[88%] max-w-[1240px] border-t border-raddo-paper-edge px-0 py-24 md:py-28"
      style={{ contentVisibility: "auto" }}
    >
      {/* Top brass hairline rule */}
      <div className="mx-auto h-px w-full bg-raddo-brass/40" aria-hidden="true" />

      {/* Eyebrow */}
      <p
        className="mt-8 text-raddo-ash"
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: "11px",
          lineHeight: "16px",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        Index · 150 Executive Lenses · One COB
      </p>

      {/* Headlines (stacked · scattered fades, resolved is the h2) */}
      <div className="relative mt-6">
        {phase !== "resolved" && (
          <p
            ref={scatteredHeadlineRef}
            className="text-raddo-ink-deep"
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: "44px",
              lineHeight: "52px",
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
            aria-hidden="true"
          >
            Right now you'd need 150 of these.
          </p>
        )}
        {phase === "resolved" && (
          <h2
            id="roles-index-heading"
            className="text-raddo-ink-deep"
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: "44px",
              lineHeight: "52px",
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            One COB. Every lens.
          </h2>
        )}
        {/* Hidden h2 during scattered so the section always has its accessible heading */}
        {phase !== "resolved" && (
          <h2
            id="roles-index-heading"
            className="sr-only"
          >
            One COB. Every lens.
          </h2>
        )}
      </div>

      {/* Scatter canvas · only present pre-resolved. Once resolved we don't need it. */}
      {showScattered && (
        <div
          ref={canvasRef}
          className="relative mt-10 w-full overflow-hidden"
          style={{ height: "clamp(520px, 64vw, 680px)" }}
          aria-hidden="true"
        >
          <svg
            ref={connectorSvgRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
          />
        </div>
      )}

      {/* COB marker · persistent. During scattered it's transformed to canvas center. */}
      <div className="mt-10 flex justify-center">
        <div
          ref={cobMarkerRef}
          role="img"
          aria-label="Your COB · the single entity performing all 150 lenses"
          className="flex flex-col items-center"
          style={{ willChange: "transform", transformOrigin: "center" }}
        >
          <span
            className="block rounded-full bg-raddo-brass"
            style={{ width: "8px", height: "8px" }}
            aria-hidden="true"
          />
          <span
            className="mt-2 text-raddo-ink-deep"
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: "16px",
              lineHeight: "22px",
              fontWeight: 700,
              letterSpacing: "-0.005em",
            }}
          >
            Your COB
          </span>
          <span
            className="mt-2 block bg-raddo-brass/70"
            style={{ width: "16px", height: "1px" }}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* The Index · resolved 3-column editorial spread.
          Always rendered AND visible (DOM source of truth for FLIP). During scatter,
          the <li> labels are transformed up into the canvas region; the band
          headings + rules fade in only at resolved. */}
      <div
        className="relative z-10 mt-14"
        style={{
          marginTop: phase === "resolved" ? "3.5rem" : "-1rem",
          transition: `margin-top 600ms cubic-bezier(0.22, 1, 0.36, 1)`,
        }}
      >
        <div className="space-y-12">
          {(Object.keys(BAND_META) as RoleBand[])
            .sort((a, b) => BAND_META[a].order - BAND_META[b].order)
            .map((bandKey) => {
              const meta = BAND_META[bandKey];
              const roles = rolesByBand[bandKey];
              return (
                <section
                  key={bandKey}
                  aria-labelledby={`band-${bandKey}-heading`}
                >
                  <div
                    className="mb-4 flex items-baseline gap-4 border-b border-raddo-paper-edge pb-2"
                    style={{
                      opacity: phase === "resolved" ? 1 : 0,
                      transition: `opacity 400ms cubic-bezier(0.22, 1, 0.36, 1) ${phase === "resolved" ? "1200ms" : "0ms"}`,
                    }}
                  >
                    <h3
                      id={`band-${bandKey}-heading`}
                      className="text-raddo-ash"
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: "11px",
                        lineHeight: "16px",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        fontWeight: 500,
                      }}
                    >
                      {meta.label}
                    </h3>
                    <span
                      className="text-raddo-ash/60"
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: "11px",
                        fontVariantNumeric: "tabular-nums",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {roles.length}
                    </span>
                  </div>
                  <ul
                    role="list"
                    className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    {roles.map((role) => {
                      const i = indexByTitle.get(role.title)!;
                      return (
                        <li
                          key={role.title}
                          ref={(node) => {
                            if (node) roleNodeRefs.current.set(i, node);
                            else roleNodeRefs.current.delete(i);
                          }}
                          className="text-raddo-ink-deep"
                          style={{
                            fontFamily: "Inter, sans-serif",
                            fontSize: "13px",
                            lineHeight: "20px",
                            fontWeight: 400,
                            willChange: phase === "scattered" || phase === "collapsing" ? "transform" : "auto",
                          }}
                        >
                          {role.title}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
        </div>
      </div>

      {/* Bottom brass hairline rule */}
      <div className="mx-auto mt-16 h-px w-full bg-raddo-brass/40" aria-hidden="true" />
    </section>
  );
}

export default RolesIndex;
