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

// Copy locked — do not paraphrase. "Remember" frame is intentional.
const PANELS: Panel[] = [
  {
    slug: "professional",
    label: "THE PROFESSIONAL",
    scenario:
      "Remember the Tuesday morning when you woke up to a one-page brief that already knew every meeting today, every commitment you owe, and every fire that started while you slept · written in your voice.",
    imageAlt:
      "A leather notebook open on a cream-paper desk at dawn, brass desk lamp casting warm light on a one-page brief",
    tone: "dawn",
  },
  {
    slug: "executive",
    label: "THE EXECUTIVE",
    scenario:
      "Remember walking into the board meeting knowing exactly which of your three strategic priorities actually moved last month · and the SVP conversation you've been avoiding for six weeks already drafted on your phone.",
    imageAlt:
      "A walnut boardroom table at dusk, single one-pager glowing at the head chair, glass doors opening to the room beyond",
    tone: "dusk",
  },
  {
    slug: "owner",
    label: "THE OWNER",
    scenario:
      "Remember the Tuesday you got back · the hire-vs-vendor math already done, the customer about to churn already flagged, the vendor whose pricing crept up over four quarters on your screen by 7am.",
    imageAlt:
      "A warm workshop-meets-office desk with org chart, vendor list, and cash projection spread under a brass lamp",
    tone: "lamp",
  },
  {
    slug: "enterprise",
    label: "THE ENTERPRISE",
    scenario:
      "Remember the board meeting that didn't surprise you · every C-suite seat running with their own Chief of Business, and the synthesis surfacing where their decisions would collide three days before they did.",
    imageAlt:
      "A vast atrium with multiple distant desks each holding a single dossier, central podium with a master synthesis under brass nameplate",
    tone: "atrium",
  },
];

function PlaceholderFigure({ panel, eager }: { panel: Panel; eager: boolean }) {
  // Solid warm-tone block per archetype, with framed alt-text caption.
  // Real commissioned dioramas drop in here later.
  const toneStyle: Record<Panel["tone"], { bg: string; fg: string; border: string }> = {
    dawn: {
      bg: "hsl(var(--raddo-paper))",
      fg: "hsl(var(--raddo-ink-deep))",
      border: "hsl(var(--raddo-paper-edge))",
    },
    dusk: {
      bg: "hsl(var(--raddo-ink-deep))",
      fg: "hsl(var(--raddo-paper))",
      border: "hsl(var(--raddo-ink-soft))",
    },
    lamp: {
      bg: "hsl(var(--raddo-brass) / 0.18)",
      fg: "hsl(var(--raddo-ink-deep))",
      border: "hsl(var(--raddo-brass) / 0.6)",
    },
    atrium: {
      bg: "hsl(40 28% 94%)",
      fg: "hsl(var(--raddo-ink-deep))",
      border: "hsl(var(--raddo-paper-edge))",
    },
  };
  const s = toneStyle[panel.tone];

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
              backgroundColor: "hsl(var(--raddo-paper) / 0.85)",
              color: "hsl(var(--raddo-ink-deep))",
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
      className="relative z-10 mx-auto max-w-[1240px] px-8 pt-12 pb-12 md:px-12 md:pt-20 md:pb-16"
      style={{ backgroundColor: "hsl(var(--raddo-paper))" }}
    >
      {/* Eyebrow */}
      <p
        className="uppercase font-mono"
        style={{
          color: "hsl(var(--raddo-brass))",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.32em",
        }}
      >
        Introducing COB
      </p>

      {/* Meta-headline */}
      <h1
        className="font-display"
        style={{
          color: "hsl(var(--raddo-ink-deep))",
          fontWeight: 800,
          fontSize: "clamp(2rem, 4.4vw, 3.75rem)",
          lineHeight: 1.08,
          letterSpacing: "-0.01em",
          marginTop: 18,
          maxWidth: "22ch",
        }}
      >
        What if your toughest decisions had already been solved? Even before you knew about them.
      </h1>

      {/* Carousel viewport */}
      <div
        ref={viewportRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-live="polite"
        className="group relative mt-10 md:mt-14 overflow-hidden focus:outline-none"
        style={{
          borderRadius: 8,
          boxShadow: "inset 0 0 0 1px hsl(var(--raddo-paper-edge))",
        }}
      >
        <motion.div
          className="flex"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={onDragEnd}
          animate={{ x: `${-index * 100}%` }}
          transition={
            reduce
              ? { duration: 0 }
              : { duration: TRANSITION_MS / 1000, ease: EASE }
          }
          style={{ width: `${PANELS.length * 100}%` }}
        >
          {PANELS.map((panel, i) => {
            const active = i === index;
            const adjacent = Math.abs(i - index) === 1;
            const eager = active || adjacent;
            return (
              <div
                key={panel.slug}
                role="group"
                aria-roledescription="slide"
                aria-label={panel.label}
                aria-hidden={!active}
                className="shrink-0 px-6 py-8 md:px-12 md:py-12"
                style={{ width: `${100 / PANELS.length}%` }}
              >
                <div className="grid gap-8 md:grid-cols-2 md:gap-12 items-center">
                  <div>
                    <p
                      className="uppercase font-mono"
                      style={{
                        color: "hsl(var(--raddo-brass))",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.32em",
                      }}
                    >
                      {panel.label}
                    </p>
                    <p
                      className="font-display mt-5"
                      style={{
                        color: "hsl(var(--raddo-ink-deep))",
                        fontWeight: 700,
                        fontSize: "clamp(1.5rem, 2.6vw, 2.25rem)",
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
            );
          })}
        </motion.div>

        {/* Desktop edge buttons */}
        <button
          type="button"
          aria-label="Previous panel"
          onClick={() => commitIndex(index - 1, "left")}
          className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 size-11 items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          style={{
            borderRadius: 4,
            backgroundColor: "hsl(var(--raddo-paper) / 0.9)",
            border: "1px solid hsl(var(--raddo-paper-edge))",
            color: "hsl(var(--raddo-ink-deep))",
          }}
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Next panel"
          onClick={() => commitIndex(index + 1, "right")}
          className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 size-11 items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          style={{
            borderRadius: 4,
            backgroundColor: "hsl(var(--raddo-paper) / 0.9)",
            border: "1px solid hsl(var(--raddo-paper-edge))",
            color: "hsl(var(--raddo-ink-deep))",
          }}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {/* Dot pagination */}
      <div className="mt-6 flex items-center justify-center gap-3">
        {PANELS.map((p, i) => {
          const active = i === index;
          return (
            <button
              key={p.slug}
              type="button"
              aria-label={`Go to ${p.label} panel`}
              aria-current={active}
              onClick={() => commitIndex(i, "dot")}
              className="transition-colors"
              style={{
                width: active ? 28 : 10,
                height: 10,
                borderRadius: 4,
                backgroundColor: active
                  ? "hsl(var(--raddo-brass))"
                  : "transparent",
                border: `1px solid ${
                  active
                    ? "hsl(var(--raddo-brass))"
                    : "hsl(var(--raddo-ink-soft) / 0.55)"
                }`,
              }}
            />
          );
        })}
      </div>

      {/* CTA */}
      <div className="mt-10 flex justify-center">
        <button
          type="button"
          onClick={onCta}
          className="font-sans inline-flex items-center justify-center transition-colors"
          style={{
            backgroundColor: "hsl(var(--raddo-brass))",
            color: "hsl(var(--raddo-ink-deep))",
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: "0.02em",
            padding: "14px 28px",
            borderRadius: 8,
            boxShadow: "0 2px 4px hsl(var(--raddo-ink-deep) / 0.12)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "hsl(var(--raddo-brass-deep))";
            (e.currentTarget as HTMLButtonElement).style.color =
              "hsl(var(--raddo-paper))";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "hsl(var(--raddo-brass))";
            (e.currentTarget as HTMLButtonElement).style.color =
              "hsl(var(--raddo-ink-deep))";
          }}
        >
          Begin the consult
        </button>
      </div>
    </section>
  );
}
