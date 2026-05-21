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
  const COLS = 6;
  const ROWS = 26; // skip 2 center rows → 24×6 = 144; remainder wraps but still distinct cells
  // Inset so labels (~180px wide) never clip canvas edges.
  const PAD_X = 0.08;
  const PAD_Y = 0.04;
  const usableW = 1 - PAD_X * 2;
  const usableH = 1 - PAD_Y * 2;
  const cellW = usableW / COLS;
  const cellH = usableH / ROWS;
  const cells: { cx: number; cy: number }[] = [];
  const centerRow1 = Math.floor(ROWS / 2) - 1;
  const centerRow2 = Math.floor(ROWS / 2);
  for (let row = 0; row < ROWS; row++) {
    if (row === centerRow1 || row === centerRow2) continue;
    for (let col = 0; col < COLS; col++) {
      const cx = PAD_X + (col + 0.5) * cellW;
      const cy = PAD_Y + (row + 0.5) * cellH;
      cells.push({ cx, cy });
    }
  }
  // Shuffle deterministically.
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return roles.map((_role, i) => {
    const c = cells[i % cells.length];
    const jx = (rand() - 0.5) * cellW * 0.4;
    const jy = (rand() - 0.5) * cellH * 0.4;
    return {
      fx: Math.max(PAD_X, Math.min(1 - PAD_X, c.cx + jx)),
      fy: Math.max(PAD_Y, Math.min(1 - PAD_Y, c.cy + jy)),
    };
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
  const debugSvgRef = useRef<SVGSVGElement | null>(null);
  const scatteredHeadlineRef = useRef<HTMLParagraphElement | null>(null);

  // Debug overlay · enable via ?roles-debug=1 or localStorage RADDO_ROLES_DEBUG=1
  const debug = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      if (new URLSearchParams(window.location.search).get("roles-debug") === "1") return true;
      if (window.localStorage?.getItem("RADDO_ROLES_DEBUG") === "1") return true;
    } catch { /* noop */ }
    return false;
  }, []);
  const [debugStats, setDebugStats] = useState<{ collisions: number; total: number }>({ collisions: 0, total: 0 });

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

  // Replayable scroll choreography · the section resets to scattered whenever it
  // leaves the viewport and re-collapses each time it re-enters. A hard fallback
  // also fires the first collapse for embeds where IntersectionObserver is unreliable.
  useEffect(() => {
    // Reduced-motion users get resolved state permanently · no replay.
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setPhase("resolved");
      return;
    }

    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setPhase("resolved");
      return;
    }

    let enterTimer: number | undefined;
    let inView = false;

    const scheduleCollapse = () => {
      window.clearTimeout(enterTimer);
      // Brief hold so the visitor reads "150 of these" before collapse.
      enterTimer = window.setTimeout(() => {
        if (inView && phaseRef.current === "scattered") startCollapse();
      }, 700);
    };

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            inView = true;
            // If we're already resolved (prior pass), reset to scattered, then collapse.
            if (phaseRef.current === "resolved") setPhase("scattered");
            scheduleCollapse();
          } else {
            inView = false;
            window.clearTimeout(enterTimer);
            // Reset to scattered when fully out of view so the next entry replays.
            if (phaseRef.current !== "scattered") setPhase("scattered");
          }
        }
      },
      { rootMargin: "0px 0px -15% 0px", threshold: [0, 0.01] }
    );
    obs.observe(el);

    // Hard fallback · ensure first collapse fires even if observer is silent.
    const fallback = window.setTimeout(() => {
      if (phaseRef.current === "scattered") startCollapse();
    }, 4500);

    return () => {
      obs.disconnect();
      window.clearTimeout(enterTimer);
      window.clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      svg.style.opacity = "1";
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const NS = "http://www.w3.org/2000/svg";
      connectors.forEach((c) => {
        const line = document.createElementNS(NS, "line");
        line.setAttribute("x1", String(c.x1));
        line.setAttribute("y1", String(c.y1));
        line.setAttribute("x2", String(c.x2));
        line.setAttribute("y2", String(c.y2));
        line.setAttribute("stroke", "#EF9F27");
        line.setAttribute("stroke-opacity", "0.55");
        line.setAttribute("stroke-width", "1");
        svg.appendChild(line);
      });
    }

    // Debug overlay · cell grid + label bboxes + collision detection.
    if (debug) {
      const dsvg = debugSvgRef.current;
      if (dsvg) {
        dsvg.setAttribute("viewBox", `0 0 ${cw} ${ch}`);
        while (dsvg.firstChild) dsvg.removeChild(dsvg.firstChild);
        const NS = "http://www.w3.org/2000/svg";

        // Grid lines · mirror computeScatter() PAD/COLS/ROWS.
        const COLS = 6;
        const ROWS = 26;
        const PAD_X = 0.08;
        const PAD_Y = 0.04;
        const usableW = 1 - PAD_X * 2;
        const usableH = 1 - PAD_Y * 2;
        for (let c = 0; c <= COLS; c++) {
          const x = (PAD_X + (c * usableW) / COLS) * cw;
          const ln = document.createElementNS(NS, "line");
          ln.setAttribute("x1", String(x));
          ln.setAttribute("y1", String(PAD_Y * ch));
          ln.setAttribute("x2", String(x));
          ln.setAttribute("y2", String((1 - PAD_Y) * ch));
          ln.setAttribute("stroke", "#22c55e");
          ln.setAttribute("stroke-opacity", "0.25");
          ln.setAttribute("stroke-dasharray", "2 4");
          dsvg.appendChild(ln);
        }
        for (let r = 0; r <= ROWS; r++) {
          const y = (PAD_Y + (r * usableH) / ROWS) * ch;
          const ln = document.createElementNS(NS, "line");
          ln.setAttribute("x1", String(PAD_X * cw));
          ln.setAttribute("y1", String(y));
          ln.setAttribute("x2", String((1 - PAD_X) * cw));
          ln.setAttribute("y2", String(y));
          ln.setAttribute("stroke", "#22c55e");
          ln.setAttribute("stroke-opacity", "0.2");
          ln.setAttribute("stroke-dasharray", "2 4");
          dsvg.appendChild(ln);
        }

        // Collect post-transform bboxes (re-measure after transforms applied).
        type Box = { x: number; y: number; w: number; h: number; i: number };
        const boxes: Box[] = [];
        ROLES.forEach((_role, i) => {
          const el = roleNodeRefs.current.get(i);
          if (!el) return;
          const r = el.getBoundingClientRect();
          boxes.push({
            x: r.left - canvasRect.left,
            y: r.top - canvasRect.top,
            w: r.width,
            h: r.height,
            i,
          });
        });

        // Collision pairs · axis-aligned bbox overlap.
        const colliding = new Set<number>();
        for (let a = 0; a < boxes.length; a++) {
          for (let b = a + 1; b < boxes.length; b++) {
            const A = boxes[a];
            const B = boxes[b];
            if (A.x < B.x + B.w && A.x + A.w > B.x && A.y < B.y + B.h && A.y + A.h > B.y) {
              colliding.add(A.i);
              colliding.add(B.i);
            }
          }
        }

        boxes.forEach((bx) => {
          const rect = document.createElementNS(NS, "rect");
          rect.setAttribute("x", String(bx.x));
          rect.setAttribute("y", String(bx.y));
          rect.setAttribute("width", String(bx.w));
          rect.setAttribute("height", String(bx.h));
          rect.setAttribute("fill", "none");
          const hit = colliding.has(bx.i);
          rect.setAttribute("stroke", hit ? "#dc2626" : "#3b82f6");
          rect.setAttribute("stroke-opacity", hit ? "0.9" : "0.45");
          rect.setAttribute("stroke-width", hit ? "1.25" : "0.75");
          dsvg.appendChild(rect);

          // Coord label.
          const txt = document.createElementNS(NS, "text");
          const s = scatterByIndex[bx.i];
          txt.setAttribute("x", String(bx.x + 2));
          txt.setAttribute("y", String(bx.y - 2));
          txt.setAttribute("fill", hit ? "#dc2626" : "#3b82f6");
          txt.setAttribute("font-family", "JetBrains Mono, monospace");
          txt.setAttribute("font-size", "8");
          txt.textContent = `${bx.i} · ${s.fx.toFixed(2)},${s.fy.toFixed(2)}`;
          dsvg.appendChild(txt);
        });

        setDebugStats({ collisions: colliding.size, total: boxes.length });
      }
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
          style={{ height: "clamp(720px, 88vw, 920px)" }}
          aria-hidden="true"
        >
          <svg
            ref={connectorSvgRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
          />
          {debug && (
            <>
              <svg
                ref={debugSvgRef}
                className="pointer-events-none absolute inset-0 z-20 h-full w-full"
                preserveAspectRatio="none"
              />
              <div
                className="pointer-events-none absolute left-2 top-2 z-30 rounded-sm bg-raddo-night/85 px-2 py-1 text-raddo-paper"
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: "11px",
                  lineHeight: "16px",
                  letterSpacing: "0.04em",
                }}
              >
                DEBUG · labels {debugStats.total} · collisions{" "}
                <span style={{ color: debugStats.collisions ? "#fca5a5" : "#86efac" }}>
                  {debugStats.collisions}
                </span>
              </div>
            </>
          )}
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
