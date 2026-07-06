import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, type PanInfo, type Transition } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  fireHeroCtaClick,
  fireHeroPanelDwell,
  fireHeroPanelSwipe,
  fireHeroPanelView,
  type HeroArchetype,
  type HeroPanelDirection,
} from "@/lib/panel-telemetry";
import dossier01BuiltForYou from "@/assets/dossier-01-built-for-you.png";
import dossier02Personality from "@/assets/dossier-02-personality.png";
import dossier03Alignment from "@/assets/dossier-03-alignment.png";
import dossier04Strategy from "@/assets/dossier-04-strategy.png";
import dossier05Truth from "@/assets/dossier-05-truth.png";

// Motion curve · matches project doctrine.
const EASE: Transition["ease"] = [0.22, 1, 0.36, 1];
const TRANSITION_MS = 400;
const DWELL_VIEW_MS = 1500;

type Panel = {
  slug: HeroArchetype;
  label: string;
  scenario: string;
  imageAlt: string;
  tone: "dawn" | "dusk" | "lamp" | "atrium";
};

// Copy locked — do not paraphrase.
const PANELS: Panel[] = [
  {
    slug: "built-for-you",
    label: "BUILT FOR YOU",
    scenario:
      "Your COB is engineered for one company. From the day it's installed, every behavior is built around your business, your operator, your decisions · and remembers every one of them. No drift from one customer to the next. One COB. One mission. Built to be 110% loyal to your interests, year after year. A category of one.",
    imageAlt: "Dossier 01 · Built for you · figure pending",
    tone: "lamp",
  },
  {
    slug: "personality",
    label: "PERSONALITY",
    scenario:
      "Your COB has a built personality · not a setting you toggle. The tone, register, communication style, and operating posture are engineered to match your operator's voice and your company's culture. The result reads like a senior executive who's been with you for years, not a tool bolted on. Distinct. Coherent. Yours.",
    imageAlt: "Dossier 02 · Personality · figure pending",
    tone: "dawn",
  },
  {
    slug: "alignment",
    label: "ALIGNMENT",
    scenario:
      "Your COB doesn't optimize for what's generally smart. It optimizes for what your business is doing · the strategy, the priorities, the constraints, the things you said matter and the things you said don't. Every recommendation flows through that filter. Generic advice is easy. Aligned counsel is the hard thing. Wired in at install.",
    imageAlt: "Dossier 03 · Alignment · figure pending",
    tone: "dusk",
  },
  {
    slug: "strategy",
    label: "STRATEGY",
    scenario:
      "Strategic thinking is engineered into how your COB approaches every consequential question. Diagnosis first. Then guiding policy. Then coherent action. Not advice that sounds smart · analysis that names what's actually happening and what to do about it. Your COB doesn't surface tactics dressed up as strategy. It works in the register your decisions require.",
    imageAlt: "Dossier 04 · Strategy · figure pending",
    tone: "atrium",
  },
  {
    slug: "truth",
    label: "TRUTH",
    scenario:
      "Every response your COB delivers includes its own calibration: how confident it is, what it knows for certain, what it's inferring, what it hasn't verified. No false confidence. No hidden uncertainty. No marketing language around the gaps. When something matters, the gap matters more than the claim. Your COB is built to surface both.",
    imageAlt: "Dossier 05 · Truth · figure pending",
    tone: "lamp",
  },
  {
    slug: "loyalty",
    label: "LOYALTY",
    scenario:
      "Loyalty means telling you uncomfortable truths. Your COB is engineered to disagree when you're about to make a mistake. The pushback is the value, not the friction. When the numbers don't support the decision, your COB will name it. When the strategy you're describing contradicts the strategy you locked last quarter, your COB surfaces it. Loyalty is not agreement.",
    imageAlt: "Dossier 06 · Loyalty · figure pending",
    tone: "dusk",
  },
  {
    slug: "anticipation",
    label: "ANTICIPATION",
    scenario:
      "Your COB doesn't wait to be asked. It surfaces what you didn't think to look for · the pattern across three customer renegotiations that says something about your pricing, the risk hiding in the contract clause everyone signed last year, the question the board is going to ask before they ask it. Forward posture, not reactive.",
    imageAlt: "Dossier 07 · Anticipation · figure pending",
    tone: "dawn",
  },
  {
    slug: "compounding",
    label: "COMPOUNDING",
    scenario:
      "Your COB gets sharper with every cycle · not by changing, but by remembering more of you. Years of decisions, patterns, context, conversations, edge cases · all available the moment they're relevant. Living infrastructure that thickens with use. The longer you have it, the more leverage you carry into every room. Compounding intelligence built into how it operates.",
    imageAlt: "Dossier 08 · Compounding · figure pending",
    tone: "atrium",
  },
];

function PlaceholderFigure({ panel, eager }: { panel: Panel; eager: boolean }) {
  // Solid warm-tone block per archetype, with framed alt-text caption.
  // Real commissioned dioramas drop in here later.
  const toneStyle: Record<Panel["tone"], { bg: string; fg: string; border: string }> = {
    dawn: {
      bg: "hsl(var(--dossier-paper))",
      fg: "hsl(var(--dossier-ink-deep))",
      border: "hsl(var(--dossier-paper-edge))",
    },
    dusk: {
      bg: "hsl(var(--dossier-ink-deep))",
      fg: "hsl(var(--dossier-paper))",
      border: "hsl(var(--dossier-ink-soft))",
    },
    lamp: {
      bg: "hsl(var(--dossier-brass) / 0.18)",
      fg: "hsl(var(--dossier-ink-deep))",
      border: "hsl(var(--dossier-brass) / 0.6)",
    },
    atrium: {
      bg: "hsl(40 28% 94%)",
      fg: "hsl(var(--dossier-ink-deep))",
      border: "hsl(var(--dossier-paper-edge))",
    },
  };
  const s = toneStyle[panel.tone];

  const imageSrc: Partial<Record<HeroArchetype, string>> = {
    "built-for-you": dossier01BuiltForYou,
    "personality": dossier02Personality,
    "alignment": dossier03Alignment,
    "strategy": dossier04Strategy,
    "truth": dossier05Truth,
  };

  const src = imageSrc[panel.slug];

  if (src) {
    return (
      <div
        className="relative w-full overflow-hidden"
        style={{ borderRadius: 4, border: `1px solid ${s.border}` }}
      >
        <img
          src={src}
          alt={panel.imageAlt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="block w-full h-auto"
        />
      </div>
    );
  }

  return (
    <div
      aria-label={panel.imageAlt}
      role="img"
      className="relative w-full aspect-[4/5] md:aspect-[16/10] overflow-hidden"
      style={{ backgroundColor: s.bg, borderRadius: 4, border: `1px solid ${s.border}` }}
    >
      {eager && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div
            className="max-w-[36ch] text-center px-5 py-4"
            style={{
              border: `1px solid ${s.border}`,
              borderRadius: 4,
              backgroundColor: "hsl(var(--dossier-paper) / 0.85)",
              color: "hsl(var(--dossier-ink-deep))",
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: 13,
              lineHeight: 1.5,
              letterSpacing: "0.01em",
            }}
          >
            {panel.imageAlt}
          </div>
        </div>
      )}
      {import.meta.env.DEV && (
        <div
          className="absolute top-2 left-2 font-mono"
          style={{
            color: s.fg,
            fontSize: 10,
            letterSpacing: "0.12em",
            opacity: 0.55,
          }}
        >
          // PLACEHOLDER //
        </div>
      )}
    </div>
  );
}

export function IntroducingCob() {
  const reduce = useReducedMotion();
  const navigate = useNavigate();

  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dwellEnterRef = useRef<number>(Date.now());
  const viewTimerRef = useRef<number | null>(null);
  const viewedRef = useRef<Set<HeroArchetype>>(new Set());
  const isVisibleRef = useRef(false);

  const commitIndex = useCallback(
    (next: number, direction: HeroPanelDirection) => {
      const clamped = ((next % PANELS.length) + PANELS.length) % PANELS.length;
      const from = indexRef.current;
      if (clamped === from) return;
      const fromSlug = PANELS[from].slug;
      const toSlug = PANELS[clamped].slug;
      fireHeroPanelSwipe(fromSlug, toSlug, direction);
      // dwell for the panel we're leaving
      fireHeroPanelDwell(fromSlug, Date.now() - dwellEnterRef.current);
      dwellEnterRef.current = Date.now();
      indexRef.current = clamped;
      setIndex(clamped);
    },
    [],
  );

  // IntersectionObserver — fire view event after 1.5s visible per panel (once).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        isVisibleRef.current = e.isIntersecting && e.intersectionRatio >= 0.5;
        if (viewTimerRef.current) {
          window.clearTimeout(viewTimerRef.current);
          viewTimerRef.current = null;
        }
        if (isVisibleRef.current) {
          const slug = PANELS[indexRef.current].slug;
          viewTimerRef.current = window.setTimeout(() => {
            if (!viewedRef.current.has(slug)) {
              viewedRef.current.add(slug);
              fireHeroPanelView(slug);
            }
          }, DWELL_VIEW_MS);
        } else {
          // dwell flush on leaving viewport
          fireHeroPanelDwell(
            PANELS[indexRef.current].slug,
            Date.now() - dwellEnterRef.current,
          );
          dwellEnterRef.current = Date.now();
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (viewTimerRef.current) window.clearTimeout(viewTimerRef.current);
    };
  }, []);

  // Re-arm the view timer + reset dwell whenever the active panel changes.
  useEffect(() => {
    if (viewTimerRef.current) {
      window.clearTimeout(viewTimerRef.current);
      viewTimerRef.current = null;
    }
    if (isVisibleRef.current) {
      const slug = PANELS[index].slug;
      viewTimerRef.current = window.setTimeout(() => {
        if (!viewedRef.current.has(slug)) {
          viewedRef.current.add(slug);
          fireHeroPanelView(slug);
        }
      }, DWELL_VIEW_MS);
    }
  }, [index]);

  // Flush dwell on page hide / tab switch.
  useEffect(() => {
    const flush = () => {
      fireHeroPanelDwell(
        PANELS[indexRef.current].slug,
        Date.now() - dwellEnterRef.current,
      );
      dwellEnterRef.current = Date.now();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      commitIndex(indexRef.current + 1, "right");
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      commitIndex(indexRef.current - 1, "left");
    } else if (e.key === "Home") {
      e.preventDefault();
      if (indexRef.current !== 0) commitIndex(0, "left");
    } else if (e.key === "End") {
      e.preventDefault();
      if (indexRef.current !== PANELS.length - 1)
        commitIndex(PANELS.length - 1, "right");
    }
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const SWIPE_PX = 60;
    const SWIPE_V = 300;
    const dx = info.offset.x;
    const vx = info.velocity.x;
    if (dx <= -SWIPE_PX || vx <= -SWIPE_V) {
      commitIndex(indexRef.current + 1, "right");
    } else if (dx >= SWIPE_PX || vx >= SWIPE_V) {
      commitIndex(indexRef.current - 1, "left");
    }
  };

  const onCta = () => {
    const slug = PANELS[indexRef.current].slug;
    fireHeroCtaClick(slug);
    navigate(`/consult?archetype=${slug}`);
  };

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label="Introducing COB"
      className="relative z-10 pb-12 md:pb-16"
    >




      {/* Folder tabs · 4×2 grid · back row peeks behind front row */}
      {(() => {
        const front = index < 4 ? 0 : 1; // which row holds the active tab
        const rows = [
          PANELS.slice(0, 4).map((p, i) => ({ p, i })),
          PANELS.slice(4, 8).map((p, i) => ({ p, i: i + 4 })),
        ];

        const renderTab = ({ p, i }: { p: Panel; i: number }, isBack: boolean) => {
          const active = i === index;
          return (
            <button
              key={p.slug}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`dossier-panel-${p.slug}`}
              id={`dossier-tab-${p.slug}`}
              tabIndex={active ? 0 : -1}
              onClick={() => commitIndex(i, "dot")}
              className="font-mono uppercase transition-all"
              style={{
                flex: "1 1 0",
                minWidth: 0,
                paddingTop: active ? 10 : 8,
                paddingBottom: active ? 14 : 10,
                paddingLeft: 14,
                paddingRight: 14,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.22em",
                color: active
                  ? "hsl(var(--dossier-ink-deep))"
                  : "hsl(var(--dossier-ash))",
                backgroundColor: active
                  ? "hsl(var(--dossier-paper))"
                  : isBack
                    ? "hsl(40 20% 89%)"
                    : "hsl(40 22% 92%)",
                borderTop: active
                  ? "2px solid hsl(var(--dossier-brass))"
                  : "1px solid hsl(var(--dossier-paper-edge))",
                borderLeft: "1px solid hsl(var(--dossier-paper-edge))",
                borderRight: "1px solid hsl(var(--dossier-paper-edge))",
                borderBottom: active
                  ? "1px solid hsl(var(--dossier-paper))"
                  : "1px solid hsl(var(--dossier-paper-edge))",
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                marginBottom: active ? -1 : 0,
                textAlign: "left",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                cursor: "pointer",
                boxShadow: isBack
                  ? "inset 0 -6px 8px -6px hsl(var(--dossier-ink-deep) / 0.08)"
                  : undefined,
              }}
            >
              <span style={{ opacity: 0.55, marginRight: 8 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {p.label}
            </button>
          );
        };

        const backRow = rows[1 - front];
        const frontRow = rows[front];

        return (
          <div
            role="tablist"
            aria-label="Dossier tabs"
            className="mt-10 md:mt-14 relative z-10"
          >
            {/* Back row · text peeks above front row */}
            <div
              className="flex items-end gap-1 md:gap-2 px-3 md:px-5 relative"
              style={{ zIndex: 1, marginBottom: -14 }}
            >
              {backRow.map((t) => renderTab(t, true))}
            </div>
            {/* Front row · sits on top, covers bottom of back row */}
            <div
              className="flex items-end gap-1 md:gap-2 px-1 md:px-2 relative"
              style={{ zIndex: 2 }}
            >
              {frontRow.map((t) => renderTab(t, false))}
            </div>
          </div>
        );
      })()}


      {/* Dossier folder · stacked peek + sliding active card */}
      <div className="relative">
        {/* Peek edges of folders sitting behind the active one */}
        <div
          aria-hidden
          className="absolute inset-x-0 pointer-events-none"
          style={{
            top: 8,
            bottom: -8,
            left: 12,
            right: 12,
            borderRadius: 8,
            border: "1px solid hsl(var(--dossier-paper-edge))",
            backgroundColor: "hsl(40 22% 94%)",
            zIndex: 0,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 pointer-events-none"
          style={{
            top: 4,
            bottom: -4,
            left: 6,
            right: 6,
            borderRadius: 8,
            border: "1px solid hsl(var(--dossier-paper-edge))",
            backgroundColor: "hsl(40 26% 95%)",
            zIndex: 0,
          }}
        />

        {/* Active dossier */}
        <div
          ref={viewportRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          aria-live="polite"
          className="group relative focus:outline-none"
          style={{
            zIndex: 1,
            borderRadius: 8,
            border: "1px solid hsl(var(--dossier-ink-soft) / 0.35)",
            backgroundColor: "hsl(var(--dossier-paper))",
            boxShadow:
              "0 1px 0 hsl(var(--dossier-ink-deep) / 0.04), 0 8px 24px -16px hsl(var(--dossier-ink-deep) / 0.25)",
            overflow: "hidden",
          }}
        >
          {/* Dossier header strip · classification + dossier number */}
          <div
            className="flex items-center justify-between px-6 md:px-10 py-3 font-mono"
            style={{
              fontSize: 10.5,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: "hsl(var(--dossier-ash))",
              borderBottom: "1px solid hsl(var(--dossier-paper-edge))",
              backgroundColor: "hsl(40 28% 96%)",
            }}
          >
            <span>
              Dossier №{" "}
              <span style={{ color: "hsl(var(--dossier-ink-deep))" }}>
                {String(index + 1).padStart(2, "0")}
              </span>{" "}
              / {String(PANELS.length).padStart(2, "0")}
            </span>
            <span
              style={{
                color: "hsl(var(--dossier-brass-deep))",
                fontWeight: 700,
              }}
            >
              For Principal · Confidential
            </span>
          </div>

          {/* Sliding stage */}
          <motion.div
            className="relative"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={onDragEnd}
            style={{ touchAction: "pan-y" }}
          >
            {PANELS.map((panel, i) => {
              const active = i === index;
              const adjacent = Math.abs(i - index) === 1;
              const eager = active || adjacent;
              const offset = i - index;
              return (
                <motion.div
                  key={panel.slug}
                  id={`dossier-panel-${panel.slug}`}
                  role="tabpanel"
                  aria-labelledby={`dossier-tab-${panel.slug}`}
                  aria-hidden={!active}
                  className={active ? "relative" : "absolute inset-0"}
                  initial={false}
                  animate={{
                    opacity: active ? 1 : 0,
                    x: reduce ? 0 : offset * 24,
                    y: active ? 0 : 6,
                  }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { duration: TRANSITION_MS / 1000, ease: EASE }
                  }
                  style={{
                    pointerEvents: active ? "auto" : "none",
                  }}
                >
                  <div className="px-6 md:px-10 py-8 md:py-12">
                    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12 items-center">
                      <div>
                        <p
                          className="uppercase font-mono"
                          style={{
                            color: "hsl(var(--dossier-brass))",
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: "0.32em",
                          }}
                        >
                          {panel.label}
                        </p>
                        <div
                          aria-hidden
                          style={{
                            marginTop: 14,
                            width: 36,
                            height: 1,
                            backgroundColor: "hsl(var(--dossier-brass))",
                          }}
                        />
                        <p
                          className="font-display mt-5"
                          style={{
                            color: "hsl(var(--dossier-ink-deep))",
                            fontWeight: 700,
                            fontSize: "clamp(1.2rem, 2.25vw, 1.9rem)",
                            lineHeight: 1.18,
                            letterSpacing: "-0.005em",
                          }}
                        >
                          {panel.scenario}
                        </p>
                      </div>
                      <PlaceholderFigure panel={panel} eager={eager} />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Desktop edge buttons */}
          <button
            type="button"
            aria-label="Previous dossier"
            onClick={() => commitIndex(index - 1, "left")}
            className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 size-10 items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            style={{
              borderRadius: 4,
              backgroundColor: "hsl(var(--dossier-paper) / 0.95)",
              border: "1px solid hsl(var(--dossier-paper-edge))",
              color: "hsl(var(--dossier-ink-deep))",
              zIndex: 2,
            }}
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Next dossier"
            onClick={() => commitIndex(index + 1, "right")}
            className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 size-10 items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            style={{
              borderRadius: 4,
              backgroundColor: "hsl(var(--dossier-paper) / 0.95)",
              border: "1px solid hsl(var(--dossier-paper-edge))",
              color: "hsl(var(--dossier-ink-deep))",
              zIndex: 2,
            }}
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>


      {/* CTA */}
      <div className="mt-10 flex justify-center">
        <button
          type="button"
          onClick={onCta}
          className="font-sans inline-flex items-center justify-center transition-colors"
          style={{
            backgroundColor: "hsl(var(--dossier-brass))",
            color: "hsl(var(--dossier-ink-deep))",
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: "0.02em",
            padding: "14px 28px",
            borderRadius: 8,
            boxShadow: "0 2px 4px hsl(var(--dossier-ink-deep) / 0.12)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "hsl(var(--dossier-brass-deep))";
            (e.currentTarget as HTMLButtonElement).style.color =
              "hsl(var(--dossier-paper))";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "hsl(var(--dossier-brass))";
            (e.currentTarget as HTMLButtonElement).style.color =
              "hsl(var(--dossier-ink-deep))";
          }}
        >
          Begin the consult
        </button>
      </div>
    </section>
  );
}
