import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * WhereCobHelps · 100-word drifting cloud of role titles COB can fulfill.
 * Magnifying-glass hover on desktop · tap-to-amplify on touch.
 * All animation via refs + rAF · zero React renders per frame.
 */

const RAW_WORDS = [
  "Chief Financial Officer", "Quiet CFO", "The Numbers Brain", "Cash Flow Watcher",
  "Budget Architect", "Quarterly Closer", "Financial Translator", "P&L Storyteller",
  "Burn-Rate Navigator", "Treasury Steward", "Margin Defender", "Revenue Orchestrator",
  "The Numbers Whisperer", "Forecast Builder", "Cost-Cutter-in-Chief",
  "Chief Operating Officer", "Process Surgeon", "The Operations Mind", "Workflow Engineer",
  "Efficiency Architect", "Throughput Captain", "Vendor Manager", "Supply Chain Conscience",
  "The Logistics Lieutenant", "Operational Backbone", "Quality Steward", "The Standardizer",
  "Process Improver",
  "Chief Strategy Officer", "The Long-Game Thinker", "Competitive Cartographer",
  "Strategy Editor", "Five-Year Architect", "Market Watcher", "The Decision Stress-Tester",
  "Scenario Modeler", "Vision Sharpener", "Pivot Counselor", "The Quiet Strategist",
  "Initiative Sequencer",
  "Chief People Officer", "Culture Architect", "The Hiring Filter", "Onboarding Captain",
  "Comp Sanity-Checker", "Performance Conversational", "People-Issue Resolver",
  "The Trust Steward", "Team Health Watcher", "The Difficult-Conversation Pre-Reader",
  "Chief Marketing Officer", "Brand Voice Keeper", "Campaign Editor", "Story Architect",
  "Positioning Sharpener", "Message Auditor", "Content Steward", "The Premium Eye",
  "Chief Revenue Officer", "Pipeline Watcher", "Deal Strategist", "Customer-Pattern Reader",
  "Forecast Honesty-Keeper", "The Quiet Closer", "Account Memory", "Growth Architect",
  "Renewal Conscience", "The Outbound Editor",
  "Chief of Staff", "Right Hand", "Executive Brain", "Calendar Defender", "Inbox Editor",
  "Meeting Prep Steward", "The Briefing Builder", "Board Liaison", "Quiet Counsel",
  "Decision Pre-Reader",
  "Chief Legal Eye", "Contract Pre-Reader", "Compliance Conscience", "Risk Translator",
  "The Litigation-Light Lawyer",
  "Chief Project Officer", "Initiative Conductor", "Deadline Steward", "Sprint Editor",
  "Cross-Functional Translator",
  "Chief Customer Officer", "Customer Memory", "NPS Whisperer", "The Quiet Listener",
  "Account Translator",
  "Institutional Memory", "The Company Historian", "Tribal Knowledge Keeper",
  "Process Archivist", "The Always-On Onboarder", "The Truth-Teller", "Loyal Dissenter",
  "The Decision Partner",
];

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface WordState {
  x: number; y: number;
  vx: number; vy: number;
  w: number; h: number;
  scale: number;
  opacity: number;
}

const REST_FONT = 16;
const MAX_FONT = 34;
const REST_OPACITY = 0.45;
const HOT_RADIUS = 24;
const COLD_RADIUS = 88;
const COLLISION_PAD = 8;
const LERP = 0.22;

export default function WhereCobHelps() {
  const wordsRef = useRef<string[]>(shuffle(RAW_WORDS));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lensRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const underlineLeaderRef = useRef<number>(-1);

  const stateRef = useRef<WordState[]>([]);
  const cursorRef = useRef({ x: 0, y: 0, active: false });
  const lensPosRef = useRef({ x: 0, y: 0 });
  const tapRef = useRef<{ x: number; y: number; until: number } | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const isTouchRef = useRef(false);
  const reducedRef = useRef(false);
  const visibleRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const lastNowRef = useRef<number>(0);

  useLayoutEffect(() => {
    const c = containerRef.current;
    if (!c) return;

    isTouchRef.current = window.matchMedia("(hover: none)").matches;
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const repack = () => {
      const rect = c.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
      const placed: WordState[] = [];

      for (let i = 0; i < wordsRef.current.length; i++) {
        const el = itemRefs.current[i];
        if (!el) continue;
        el.style.transform = "translate3d(0,0,0) scale(1)";
        const b = el.getBoundingClientRect();
        const w = b.width;
        const h = b.height;

        let x = 0, y = 0, ok = false;
        for (let attempt = 0; attempt < 250; attempt++) {
          x = Math.random() * Math.max(1, rect.width - w);
          y = Math.random() * Math.max(1, rect.height - h);
          ok = true;
          for (const p of placed) {
            if (
              x < p.x + p.w + COLLISION_PAD &&
              x + w + COLLISION_PAD > p.x &&
              y < p.y + p.h + COLLISION_PAD &&
              y + h + COLLISION_PAD > p.y
            ) { ok = false; break; }
          }
          if (ok) break;
        }
        const angle = Math.random() * Math.PI * 2;
        const speed = reducedRef.current ? 0 : 8 + Math.random() * 12;
        placed.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          w, h,
          scale: 1, opacity: REST_OPACITY,
        });
      }
      stateRef.current = placed;
    };

    repack();

    const ro = new ResizeObserver(() => repack());
    ro.observe(c);

    const io = new IntersectionObserver(
      ([entry]) => { visibleRef.current = entry.isIntersecting; },
      { threshold: 0 }
    );
    io.observe(c);

    return () => { ro.disconnect(); io.disconnect(); };
  }, []);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (!visibleRef.current) { lastNowRef.current = now; return; }

      const last = lastNowRef.current || now;
      let dt = (now - last) / 1000;
      if (dt > 0.033) dt = 0.033;
      lastNowRef.current = now;

      const W = sizeRef.current.w;
      const H = sizeRef.current.h;
      const states = stateRef.current;
      if (!states.length || W === 0) return;

      for (let i = 0; i < states.length; i++) {
        const s = states[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.x < 0) { s.x = 0; s.vx = -s.vx; }
        else if (s.x + s.w > W) { s.x = W - s.w; s.vx = -s.vx; }
        if (s.y < 0) { s.y = 0; s.vy = -s.vy; }
        else if (s.y + s.h > H) { s.y = H - s.h; s.vy = -s.vy; }
      }

      for (let i = 0; i < states.length; i++) {
        const a = states[i];
        const acx = a.x + a.w / 2;
        const acy = a.y + a.h / 2;
        for (let j = i + 1; j < states.length; j++) {
          const b = states[j];
          const bcx = b.x + b.w / 2;
          const bcy = b.y + b.h / 2;
          const dx = acx - bcx;
          const dy = acy - bcy;
          const minX = (a.w + b.w) / 2 + COLLISION_PAD;
          const minY = (a.h + b.h) / 2 + COLLISION_PAD;
          if (Math.abs(dx) < minX && Math.abs(dy) < minY) {
            const ox = minX - Math.abs(dx);
            const oy = minY - Math.abs(dy);
            if (ox < oy) {
              const push = (dx >= 0 ? 1 : -1) * (ox / 2);
              a.x += push; b.x -= push;
            } else {
              const push = (dy >= 0 ? 1 : -1) * (oy / 2);
              a.y += push; b.y -= push;
            }
          }
        }
      }

      let ex = -9999, ey = -9999, hasFocus = false;
      if (isTouchRef.current) {
        if (tapRef.current && now < tapRef.current.until) {
          ex = tapRef.current.x; ey = tapRef.current.y; hasFocus = true;
        }
      } else if (cursorRef.current.active) {
        ex = cursorRef.current.x; ey = cursorRef.current.y; hasFocus = true;
      }

      const MAX_RATIO = MAX_FONT / REST_FONT;
      let leader = -1;
      let leaderScale = -1;
      for (let i = 0; i < states.length; i++) {
        const s = states[i];
        let tScale = 1, tOpac = REST_OPACITY;
        if (hasFocus) {
          const cx = s.x + s.w / 2;
          const cy = s.y + s.h / 2;
          const d = Math.hypot(cx - ex, cy - ey);
          if (d <= HOT_RADIUS) {
            tScale = MAX_RATIO; tOpac = 1;
          } else if (d <= COLD_RADIUS) {
            const t = 1 - (d - HOT_RADIUS) / (COLD_RADIUS - HOT_RADIUS);
            const e = t * t * t * (t * (t * 6 - 15) + 10);
            tScale = 1 + (MAX_RATIO - 1) * e;
            tOpac = REST_OPACITY + (1 - REST_OPACITY) * e;
          }
        }
        const lerp = reducedRef.current ? 1 : LERP;
        s.scale += (tScale - s.scale) * lerp;
        s.opacity += (tOpac - s.opacity) * lerp;

        const el = itemRefs.current[i];
        if (el) {
          // Render at true font-size for crisp glyphs; offset translate so the
          // word grows from its physics center instead of its top-left corner.
          const grow = s.scale - 1;
          const offX = -(s.w * grow) / 2;
          const offY = -(s.h * grow) / 2;
          el.style.fontSize = `${(REST_FONT * s.scale).toFixed(2)}px`;
          el.style.transform = `translate3d(${(s.x + offX).toFixed(2)}px, ${(s.y + offY).toFixed(2)}px, 0)`;
          el.style.opacity = s.opacity.toFixed(3);
          el.style.zIndex = s.scale > 1.05 ? "2" : "1";
        }
        if (s.scale > leaderScale) { leaderScale = s.scale; leader = i; }
      }


      const newLeader = leaderScale > 1.05 ? leader : -1;
      if (newLeader !== underlineLeaderRef.current) {
        const prev = underlineLeaderRef.current;
        if (prev >= 0 && itemRefs.current[prev]) {
          itemRefs.current[prev]!.dataset.leader = "false";
        }
        if (newLeader >= 0 && itemRefs.current[newLeader]) {
          itemRefs.current[newLeader]!.dataset.leader = "true";
        }
        underlineLeaderRef.current = newLeader;
      }

      if (!isTouchRef.current && lensRef.current) {
        const lp = lensPosRef.current;
        lp.x += (cursorRef.current.x - lp.x) * 0.25;
        lp.y += (cursorRef.current.y - lp.y) * 0.25;
        lensRef.current.style.transform =
          `translate3d(${lp.x - 20}px, ${lp.y - 20}px, 0)`;
        lensRef.current.style.opacity = cursorRef.current.active ? "1" : "0";
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isTouchRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    cursorRef.current.x = e.clientX - r.left;
    cursorRef.current.y = e.clientY - r.top;
    cursorRef.current.active = true;
  };
  const onPointerEnter = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isTouchRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    lensPosRef.current.x = e.clientX - r.left;
    lensPosRef.current.y = e.clientY - r.top;
    cursorRef.current.x = lensPosRef.current.x;
    cursorRef.current.y = lensPosRef.current.y;
    cursorRef.current.active = true;
  };
  const onPointerLeave = () => { cursorRef.current.active = false; };

  const onTap = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isTouchRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const target = e.target as HTMLElement;
    if (target && target.dataset && target.dataset.word === "1") {
      tapRef.current = { x, y, until: performance.now() + 1500 };
    } else {
      tapRef.current = null;
    }
  };

  return (
    <section
      aria-labelledby="where-cob-helps-heading"
      className="relative w-full bg-raddo-paper py-20 md:py-28"
    >
      <div className="mx-auto max-w-[1240px] px-6 md:px-12">
        <h2
          id="where-cob-helps-heading"
          className="text-center font-display text-raddo-ink"
          style={{
            fontWeight: 400,
            letterSpacing: "-0.02em",
            fontSize: "clamp(36px, 5vw, 56px)",
            lineHeight: 1.08,
            marginBottom: "64px",
          }}
        >
          Where can COB help?
        </h2>
      </div>

      <div
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerDown={onTap}
        className="relative w-full overflow-hidden border-y border-raddo-paper-edge bg-raddo-paper"
        style={{
          height: "min(600px, 70vh)",
          minHeight: "480px",
          cursor: isTouchRef.current ? "default" : "none",
          touchAction: "manipulation",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: 0.1,
            mixBlendMode: "multiply",
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.05 0 0 0 0 0.05 0 0 0 0 0.1 0 0 0 0.6 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
            backgroundSize: "200px 200px",
          }}
        />

        {wordsRef.current.map((w, i) => (
          <div
            key={i}
            ref={(el) => { itemRefs.current[i] = el; }}
            data-word="1"
            data-leader="false"
            className="absolute left-0 top-0 select-none font-display whitespace-nowrap"
            style={{
              fontSize: `${REST_FONT}px`,
              fontWeight: 400,
              color: "hsl(var(--raddo-ink))",
              opacity: REST_OPACITY,
              willChange: "transform, font-size",
              textRendering: "geometricPrecision",
              WebkitFontSmoothing: "antialiased",
              MozOsxFontSmoothing: "grayscale",
              transition: "none",
              pointerEvents: "auto",
            }}

          >
            {w}
          </div>
        ))}

        {!isTouchRef.current && (
          <div
            ref={lensRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0"
            style={{
              width: 40, height: 40, borderRadius: "9999px",
              background: "hsl(var(--raddo-brass) / 0.18)",
              border: "1px solid hsl(var(--raddo-brass) / 0.55)",
              boxShadow: "inset 0 0 0 1px hsl(var(--raddo-paper) / 0.6)",
              opacity: 0,
              transition: "opacity 220ms cubic-bezier(0.22, 1, 0.36, 1)",
              willChange: "transform",
            }}
          />
        )}

        <style>{`
          [data-word="1"]::after {
            content: "";
            display: block;
            height: 1px;
            background: hsl(var(--raddo-brass));
            opacity: 0;
            transform: scaleX(0.6);
            transform-origin: center;
            transition: opacity 220ms cubic-bezier(0.22, 1, 0.36, 1),
                        transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
            margin-top: 1px;
          }
          [data-word="1"][data-leader="true"]::after {
            opacity: 1;
            transform: scaleX(1);
          }
        `}</style>

        <ul className="sr-only">
          {wordsRef.current.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      </div>

      <div className="mx-auto max-w-[720px] px-6 md:px-12" style={{ marginTop: "64px" }}>
        <p
          className="text-center font-display"
          style={{
            color: "hsl(var(--raddo-ink) / 0.75)",
            fontWeight: 400,
            fontSize: "clamp(18px, 2vw, 24px)",
            lineHeight: 1.4,
          }}
        >
          Why can't COB be whichever of these things for you and your team?
        </p>
      </div>
    </section>
  );
}
