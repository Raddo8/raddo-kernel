import { AnimatePresence, motion, useReducedMotion, type Variants, type Transition } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import raddoLogo from "@/assets/raddo-logo-3d.png";
import vaultExhibit from "@/assets/raddo-vault-exhibit.png";
import forYourEyesOnly from "@/assets/for-your-eyes-only.png";
import { SeoHead } from "@/components/SeoHead";
import { SiteHeader } from "@/components/SiteHeader";
import { IntroducingCob } from "@/components/IntroducingCob";
import DossierIntake from "@/components/hero/DossierIntake";


// Motion doctrine · two curves only.
// EASE_OUT (out-expo) — premium settle for entrances. Quick lift, long quiet tail.
// EASE_STD (project standard) — micro-interactions, hovers, exits. Matches 220ms tokens.
const EASE_OUT: Transition["ease"] = [0.16, 1, 0.3, 1];
const EASE_STD: Transition["ease"] = [0.22, 1, 0.36, 1];
// Back-compat alias for inline usages elsewhere in this file.
const EASE = EASE_STD;

// Detect lower-powered devices once at module load · keeps cascade brisk on
// modest hardware (older phones, low-CPU laptops) while preserving the premium
// settle for capable machines. Halves delays and trims durations ~15%.
function detectLowPower(): boolean {
  if (typeof navigator === "undefined") return false;
  const cores = (navigator as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency ?? 8;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData) return true;
  if (conn?.effectiveType && /2g|slow/i.test(conn.effectiveType)) return true;
  return cores <= 4 || mem <= 4;
}

const SOURCES = [
  "Email",
  "Meetings",
  "Documents",
  "Business chat",
  "Calendar",
  "Financials",
];

const COB_TITLES = [
  "Business",
  "Strategy",
  "Operations",
  "Brand",
  "Sales",
  "People",
  "Communications",
  "Staff",
  "Books",
  "Data",
  "Counsel",
  "Capital",
  "Risk",
  "Intelligence",
  "Build",
  "Bookings",
  "Health",
  "Logistics",
  "Projects",
  "Reports",
  "Analysis",
  "Presentation",
  "Builds",
  "Recruiting",
  "Receivables",
];

const INDEX = [
  { roman: "I", label: "Clarity", body: "Six sources held in continuous synthesis · ready when you are." },
  { roman: "II", label: "Origin", body: "Every line is sourced. Email, meeting, document, ledger · labelled." },
  { roman: "III", label: "Decision", body: "Approve, escalate, redirect. The system presents the call, not the noise." },
  { roman: "IV", label: "Authority", body: "Built for the chair the day answers to. Discreet, restrained, yours." },
];

function BriefingDossier({ open, setOpen }: { open: boolean; setOpen: (v: boolean | ((p: boolean) => boolean)) => void }) {
  const reduce = useReducedMotion();

  return (
    <article
      className="relative"
      style={{
        backgroundColor: "hsl(var(--raddo-paper))",
        border: "1px solid hsl(var(--raddo-paper-edge))",
        borderRadius: 8,
        boxShadow: open
          ? "0 8px 32px -16px hsl(var(--raddo-ink-deep) / 0.18)"
          : "0 2px 8px -4px hsl(var(--raddo-ink-deep) / 0.08)",
        transition: "box-shadow 220ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      {/* Brass corner registration marks */}
      <CornerMark pos="tl" />
      <CornerMark pos="tr" />
      <CornerMark pos="bl" />
      <CornerMark pos="br" />

      {/* Top meta strip */}
      <div
        className="flex items-center justify-between font-mono"
        style={{
          padding: "14px 24px",
          borderBottom: "1px solid hsl(var(--raddo-paper-edge))",
          fontSize: 10,
          letterSpacing: "0.18em",
          color: "hsl(var(--raddo-ash))",
          textTransform: "uppercase",
        }}
      >
        <span>BRIEFING · 001</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: "hsl(var(--raddo-brass))",
            }}
          />
          CLASSIFIED · FOR PRINCIPAL
        </span>
      </div>

      {/* Header · clickable */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="briefing-001-body"
          className="w-full text-left group px-6 pt-7 pb-8 md:px-10 md:pt-8 md:pb-9 bg-transparent cursor-pointer"
        >

          <div className="flex flex-col items-stretch gap-3">
            <h2
              className="font-display text-raddo-ink-deep m-0 md:whitespace-nowrap"
              style={{
                fontWeight: 800,
                fontSize: "clamp(22px, 4.2vw, 48px)",
                lineHeight: 1.05,
              }}
            >
              What is COB?
            </h2>
          </div>

          {/* Brass rule · separates title from briefing header block */}
          <div
            aria-hidden
            className="mt-5 mb-4"
            style={{
              width: 56,
              height: 1.5,
              backgroundColor: "hsl(var(--raddo-brass))",
            }}
          />

          {/* Action row · open dossier directive */}
          <div className="mb-4 flex items-center justify-between gap-4">
            <span
              className="font-mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.22em",
                color: "hsl(var(--raddo-brass-deep))",
                textTransform: "uppercase",
              }}
            >
              {open ? "Tap to seal" : "Tap dossier or exhibit to unseal"}
            </span>
            <span
              aria-hidden
              className="flex items-center gap-2 font-mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.22em",
                color: "hsl(var(--raddo-ash))",
                textTransform: "uppercase",
              }}
            >
              <span>{open ? "Close" : "Open dossier"}</span>
              <span
                className="grid place-items-center"
                style={{
                  width: 28,
                  height: 28,
                  border: "1px solid hsl(var(--raddo-brass))",
                  borderRadius: 4,
                  color: "hsl(var(--raddo-brass-deep))",
                  transition: "transform 220ms cubic-bezier(0.22,1,0.36,1), background-color 220ms",
                  transform: open ? "rotate(180deg)" : "rotate(0deg)",
                  backgroundColor: open
                    ? "hsl(var(--raddo-brass) / 0.12)"
                    : "transparent",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
                </svg>
              </span>
            </span>
          </div>

          {/* Intelligence briefing header · labelled field grid */}
          <dl
            className="font-mono grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 m-0"
            style={{
              borderTop: "1px solid hsl(var(--raddo-paper-edge))",
              padding: "12px 0 4px",
            }}
          >
            {[
              { k: "Subject", v: "Decision\nIntelligence" },
              { k: "Format", v: "6 paragraphs" },
              { k: "Read", v: "90 seconds" },
              { k: "Status", v: open ? "Unsealed" : "Sealed" },
            ].map((row) => (
              <div key={row.k} className="flex flex-col gap-1 min-w-0 items-center text-center">
                <dt
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.22em",
                    color: "hsl(var(--raddo-ash))",
                    textTransform: "uppercase",
                  }}
                >
                  {row.k}
                </dt>
                <dd
                  className="m-0 font-sans"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "hsl(var(--raddo-ink-deep))",
                    letterSpacing: "0.01em",
                    whiteSpace: "pre-line",
                    lineHeight: 1.3,
                  }}
                >
                  {row.v}
                </dd>
              </div>
            ))}
          </dl>

        </button>
      </div>

      {/* Closed-state visual · "For Your Eyes Only" envelope plate */}
      <AnimatePresence initial={false}>
        {!open && (
          <motion.div
            key="closed-plate"
            initial={reduce ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.42, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "4px 20px 20px" }}>
              <div
                className="relative overflow-hidden"
                style={{
                  borderRadius: 4,
                  border: "1px solid hsl(var(--raddo-paper-edge))",
                  backgroundColor: "hsl(var(--raddo-paper))",
                }}
              >
                <img
                  src={forYourEyesOnly}
                  alt="For your eyes only · sealed envelope on a brass-tracery topographic field"
                  loading="lazy"
                  className="block w-full h-auto select-none"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="briefing-001-body"
            key="body"
            initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { height: "auto", opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.42, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                padding: "8px 40px 40px",
                borderTop: "1px solid hsl(var(--raddo-paper-edge))",
              }}
            >
              <div
                aria-hidden
                className="mt-8 mb-8"
                style={{
                  width: 280,
                  maxWidth: "100%",
                  height: 1.5,
                  backgroundColor: "hsl(var(--raddo-brass))",
                }}
              />

              <p className="font-sans text-raddo-charcoal mb-6" style={{ fontSize: 18, lineHeight: 1.6 }}>
                COB is a system of{" "}
                <strong className="text-raddo-ink-deep font-bold">
                  intelligence, strategy, and competence
                </strong>{" "}
                built around one person · or one business. It reads what you read,
                sits in your meetings, and holds the full context of your operation:
                finance, legal, people, risk, every functional domain. It learns how
                you think, how you write, what you weigh, what you cut. From that
                foundation, it produces the briefings, drafts, projects, reports,
                presentations, and counsel that let you show up as the sharpest
                version of yourself in every room you walk into.
              </p>

              <p className="font-sans text-raddo-charcoal mb-6" style={{ fontSize: 18, lineHeight: 1.6 }}>
                Two things separate COB from any tool you have used before.
              </p>

              <p className="font-sans text-raddo-charcoal mb-6" style={{ fontSize: 18, lineHeight: 1.6 }}>
                <strong className="text-raddo-ink-deep font-bold">It is portable.</strong>{" "}
                Not locked to one app, one platform, one provider. It carries
                everything you teach it across the systems you already use.
              </p>

              <p className="font-sans text-raddo-charcoal mb-6" style={{ fontSize: 18, lineHeight: 1.6 }}>
                <strong className="text-raddo-ink-deep font-bold">It is permanent.</strong>{" "}
                It does not reset when you change roles, restructure your team, or
                move on to the next thing. The longer you use it, the more of you it
                carries.
              </p>

              <p className="font-sans text-raddo-charcoal mb-6" style={{ fontSize: 18, lineHeight: 1.6 }}>
                Executives without a COB are now competing against executives with
                one. The gap shows up quietly · in who is prepared when the question
                lands, who has the draft ready before the meeting, who remembers
                what was decided three quarters ago when it matters again, who
                carries the full operation with them instead of behind them. The
                disadvantage is small at first. It compounds.
              </p>

              <div
                aria-hidden
                className="my-7"
                style={{
                  width: 120,
                  height: 1.5,
                  backgroundColor: "hsl(var(--raddo-brass))",
                }}
              />

              <div style={{ breakInside: "avoid" }}>
                <p
                  className="font-display text-raddo-ink-deep mb-4"
                  style={{ fontStyle: "italic", fontSize: 21, lineHeight: 1.45 }}
                >
                  The question is no longer whether decision intelligence at this
                  depth becomes the standard for serious operators.
                </p>
                <p
                  className="font-display text-raddo-ink-deep"
                  style={{ fontStyle: "italic", fontSize: 21, lineHeight: 1.45 }}
                >
                  The question is whether you have one when it does.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

function BriefingComposition() {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
      <BriefingDossier open={open} setOpen={setOpen} />
      <VaultExhibit open={open} />
    </div>
  );
}

const VAULT_LEGEND: { n: string; label: string; pos: string }[] = [
  { n: "01", label: "Email", pos: "Upper left pedestal" },
  { n: "02", label: "Documents", pos: "Mid left pedestal" },
  { n: "03", label: "Calendar", pos: "Lower left pedestal" },
  { n: "04", label: "People", pos: "Upper right pedestal" },
  { n: "05", label: "Business chat", pos: "Mid right pedestal" },
  { n: "06", label: "Financials", pos: "Lower right pedestal" },
];

function VaultExhibit({ open }: { open: boolean }) {
  const reduce = useReducedMotion();
  return (
    <article
      className="relative h-full flex flex-col"
      style={{
        backgroundColor: "hsl(var(--raddo-paper))",
        border: "1px solid hsl(var(--raddo-paper-edge))",
        borderRadius: 8,
        boxShadow: open
          ? "0 8px 32px -16px hsl(var(--raddo-ink-deep) / 0.18)"
          : "0 2px 8px -4px hsl(var(--raddo-ink-deep) / 0.08)",
        transition: "box-shadow 220ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      <CornerMark pos="tl" />
      <CornerMark pos="tr" />
      <CornerMark pos="bl" />
      <CornerMark pos="br" />

      <div
        className="flex items-center justify-between font-mono"
        style={{
          padding: "14px 24px",
          borderBottom: "1px solid hsl(var(--raddo-paper-edge))",
          fontSize: 10,
          letterSpacing: "0.18em",
          color: "hsl(var(--raddo-ash))",
          textTransform: "uppercase",
        }}
      >
        <span>EXHIBIT · 002</span>
        <span>The six · source vault</span>
      </div>

      <div style={{ padding: "20px 20px 0" }}>
        <div
          className="relative overflow-hidden"
          style={{
            borderRadius: 4,
            border: "1px solid hsl(var(--raddo-paper-edge))",
            backgroundColor: "hsl(var(--raddo-night))",
          }}
        >
          <img
            src={vaultExhibit}
            alt="The COB vault · six source pedestals connected by brass tracery to a central paper briefing plaque"
            loading="lazy"
            className="block w-full h-auto"
          />
        </div>
      </div>

      <div className="px-6 md:px-10 pt-6">
        <div
          className="font-display mb-2"
          style={{
            fontVariant: "small-caps",
            fontSize: 11,
            letterSpacing: "0.22em",
            color: "hsl(var(--raddo-brass))",
          }}
        >
          What you are seeing
        </div>
        <p
          className="font-sans text-raddo-charcoal m-0"
          style={{ fontSize: 15, lineHeight: 1.55 }}
        >
          The vault is the operation. The plaque is one expression of it.
        </p>
      </div>

      <div className="px-6 md:px-10 pt-6 pb-6 flex-1">
        <div
          className="flex items-center gap-3 font-mono mb-3"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            color: "hsl(var(--raddo-ash))",
            textTransform: "uppercase",
          }}
        >
          <span aria-hidden style={{ width: 28, height: 1.5, backgroundColor: "hsl(var(--raddo-brass))" }} />
          <span>Exhibit key</span>
        </div>
        <ul className="m-0 p-0 list-none">
          {VAULT_LEGEND.map((row, i) => (
            <li
              key={row.n}
              className="flex items-baseline gap-3 py-2"
              style={{ borderTop: i === 0 ? "none" : "1px solid hsl(var(--raddo-paper-edge))" }}
            >
              <span
                className="font-mono shrink-0"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  color: "hsl(var(--raddo-brass-deep))",
                  minWidth: 24,
                }}
              >
                {row.n}
              </span>
              <span
                className="font-sans text-raddo-ink-deep"
                style={{ fontSize: 14, fontWeight: 500, flex: 1 }}
              >
                {row.label}
              </span>
              <span
                className="font-mono hidden sm:inline"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  color: "hsl(var(--raddo-ash))",
                  textTransform: "uppercase",
                }}
              >
                {row.pos}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="decision"
            initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { height: "auto", opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.42, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="md:px-10"
              style={{
                padding: "20px 24px 28px",
                borderTop: "1px solid hsl(var(--raddo-paper-edge))",
              }}
            >
              <div
                className="font-display mb-3"
                style={{
                  fontVariant: "small-caps",
                  fontSize: 11,
                  letterSpacing: "0.22em",
                  color: "hsl(var(--raddo-brass))",
                }}
              >
                Your move
              </div>
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <a
                  href="/consult"
                  className="raddo-cta-brass group inline-flex items-center gap-2 font-sans"
                  style={{
                    backgroundColor: "hsl(var(--raddo-brass))",
                    color: "hsl(var(--raddo-ink-deep))",
                    padding: "12px 22px",
                    borderRadius: 4,
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                  }}
                >
                  <span>Begin the consult</span>
                  <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-[3px]">→</span>
                </a>
                <a
                  href="/capability-brief.html"
                  className="inline-flex items-center font-sans text-raddo-ink-deep"
                  style={{ fontSize: 13, fontWeight: 500, letterSpacing: "0.02em" }}
                >
                  <span className="border-b border-raddo-brass-deep/40 pb-[2px]">
                    Read the Capability Brief
                  </span>
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

function CornerMark({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const size = 10;
  const offset = -1;
  const style: React.CSSProperties = {
    position: "absolute",
    width: size,
    height: size,
    borderColor: "hsl(var(--raddo-brass))",
    borderStyle: "solid",
    borderWidth: 0,
  };
  if (pos === "tl") {
    style.top = offset; style.left = offset;
    style.borderTopWidth = 1.5; style.borderLeftWidth = 1.5;
  } else if (pos === "tr") {
    style.top = offset; style.right = offset;
    style.borderTopWidth = 1.5; style.borderRightWidth = 1.5;
  } else if (pos === "bl") {
    style.bottom = offset; style.left = offset;
    style.borderBottomWidth = 1.5; style.borderLeftWidth = 1.5;
  } else {
    style.bottom = offset; style.right = offset;
    style.borderBottomWidth = 1.5; style.borderRightWidth = 1.5;
  }
  return <span aria-hidden style={style} />;
}

const INTRO_FLAG = "raddo-hero-intro-played-v1";

export function Hero() {
  const reduce = useReducedMotion();

  /**
   * Hero intro cascade plays once per browser session. We persist a flag in
   * sessionStorage so internal navigation back to "/" snaps straight to the
   * final state instead of re-running the 3.8s cascade. Re-opening the site
   * in a new tab (fresh session) replays the intro.
   */
  const [introPlayed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.sessionStorage.getItem(INTRO_FLAG) === "1"; }
    catch { return false; }
  });

  // When intro has already played, render every animated element directly in
  // its "show" state · no transition, no flash.
  const INITIAL: "hidden" | "show" = introPlayed ? "show" : "hidden";

  useEffect(() => {
    if (introPlayed) return;
    try { window.sessionStorage.setItem(INTRO_FLAG, "1"); } catch { /* ignore */ }
  }, [introPlayed]);

  const [now, setNow] = useState(() =>
    new Date().toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
  );

  useEffect(() => {
    const t = setInterval(
      () =>
        setNow(
          new Date().toLocaleString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          }),
        ),
      60_000,
    );
    return () => clearInterval(t);
  }, []);

  // Rotating COB title — only the trailing word changes
  const [titleIdx, setTitleIdx] = useState(0);
  const [heroImgLoaded, setHeroImgLoaded] = useState(false);
  useEffect(() => {
    // If the preloaded image is already cached, mark it loaded on mount.
    const img = new Image();
    img.src = "/brand/corner-cubicle.png";
    if (img.complete) setHeroImgLoaded(true);
    else img.addEventListener("load", () => setHeroImgLoaded(true), { once: true });
  }, []);
  useEffect(() => {
    if (reduce) return;
    let last = 0;
    const t = setInterval(() => {
      let next = Math.floor(Math.random() * COB_TITLES.length);
      if (next === last) next = (next + 1) % COB_TITLES.length;
      last = next;
      setTitleIdx(next);
    }, 2600);
    return () => clearInterval(t);
  }, [reduce]);

  // Low-power devices get a brisker cascade (delays halved, durations -15%) so
  // the page becomes interactive sooner without abandoning the staircase rhythm.
  const lowPower = useMemo(() => detectLowPower(), []);
  const dScale = reduce ? 0 : lowPower ? 0.85 : 1;
  const tScale = reduce ? 0 : lowPower ? 0.5 : 1;

  const rise = (duration: number, delay: number): Variants => ({
    hidden: { opacity: reduce ? 1 : 0, y: reduce ? 0 : 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: (duration / 1000) * dScale,
        delay: (delay / 1000) * tScale,
        ease: EASE_OUT,
      },
    },
  });

  const fade = (duration: number, delay: number): Variants => ({
    hidden: { opacity: reduce ? 1 : 0 },
    show: {
      opacity: 1,
      transition: {
        duration: (duration / 1000) * dScale,
        delay: (delay / 1000) * tScale,
        ease: EASE_OUT,
      },
    },
  });

  const scaleX = (duration: number, delay: number): Variants => ({
    hidden: { opacity: reduce ? 1 : 0, scaleX: reduce ? 1 : 0 },
    show: {
      opacity: 1,
      scaleX: 1,
      transition: {
        duration: (duration / 1000) * dScale,
        delay: (delay / 1000) * tScale,
        ease: EASE_OUT,
      },
    },
  });

  return (
    <main className="relative w-full bg-raddo-paper text-raddo-charcoal selection:bg-raddo-brass/30">
      <SeoHead
        path="/"
        title="RADDO · Your Chief of Business"
        description="RADDO is a Chief of Business built around you · drawing on every system you run to keep you sharp across email, meetings, decisions, and direction."
      />
      {/* Top dark-blue bar · scrolls with the page */}
      <div
        aria-hidden
        className="absolute left-0 right-0 top-0 z-0"
        style={{ height: 60, backgroundColor: "hsl(var(--raddo-ink-deep))" }}
      />
      {/* Top-of-page video band · sits below the bar, scrolls away with the page */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 right-0 z-0 overflow-hidden"
        style={{ top: 60, height: "min(900px, 92vh)" }}
      >
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="h-full w-full object-cover"
          style={{ opacity: 0.7 }}
          src="/brand/still-waters.mp4"
        />
        {/* Soft paper tint so headline contrast holds */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "hsl(var(--raddo-paper) / 0.32)" }}
        />
        {/* Hovering headline · bottom third of video */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 flex items-center justify-start px-8 md:px-16 pointer-events-none">
          <p
            className="font-display text-left max-w-[34ch]"
            style={{
              color: "hsl(var(--raddo-ink-deep))",
              fontWeight: 900,
              fontSize: "48px",
              lineHeight: 1.18,
              letterSpacing: "-0.01em",
              textShadow:
                "0 0 18px hsl(0 0% 100% / 0.65), 0 0 36px hsl(0 0% 100% / 0.45), 0 0 64px hsl(0 0% 100% / 0.3)",
            }}
          >
            Imagine an executive who never forgets, never loses context, and never stops working in your best interest. <span style={{ color: "hsl(var(--raddo-brass))" }}>RADDO</span> builds that executive.
          </p>
        </div>

      </div>

      {/* Hairline paper grain */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.04] mix-blend-multiply"
        style={{
          backgroundImage:
            "radial-gradient(hsl(var(--raddo-charcoal)) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
        }}
      />

      {/* ====== PINNED SITE HEADER ====== */}
      <SiteHeader />





      {/* ====== HERO ====== */}
      <section
        className="relative z-10 mx-auto w-full max-w-[1240px] px-6 pb-32 sm:px-8 md:px-12 md:pb-40 lg:px-16"
        style={{ paddingTop: "calc(min(900px, 92vh) + 200px)" }}
      >

        {/* Introducing COB heading + Dossier Intake chat · first below the video */}
        <motion.div
          variants={rise(800, 2400)}
          initial={INITIAL}
          animate="show"
        >
          <h2
            className="font-display"
            style={{
              color: "hsl(var(--raddo-ink-deep))",
              fontWeight: 800,
              fontSize: "clamp(2rem, 4.4vw, 3.75rem)",
              lineHeight: 1.08,
              letterSpacing: "-0.01em",
              maxWidth: "22ch",
              marginBottom: 32,
            }}
          >
            <span style={{ color: "hsl(var(--raddo-brass))", display: "block" }}>
              Introducing COB.
            </span>
            Not just in your corner.<br />
            Building your corner.
          </h2>
          <DossierIntake />
        </motion.div>

        {/* Headline with Six-Source Mandala backdrop · middle */}
        <div className="relative mt-40 md:mt-52">
          {/* Mandala backdrop · leads the page */}
          <motion.div
            aria-hidden
            variants={fade(800, 0)}
            initial={INITIAL}
            animate="show"
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
            style={{
              borderRadius: 8,
              border: "1.5px solid hsl(var(--raddo-brass-deep) / 0.55)",
              boxShadow:
                "0 1px 0 hsl(var(--raddo-paper-edge)) inset, 0 8px 24px -16px hsl(var(--raddo-ink-deep) / 0.2)",
            }}
          >
            {/* Skeleton · paper-toned blur-up while the image decodes */}
            <AnimatePresence>
              {!heroImgLoaded && (
                <motion.div
                  key="hero-skeleton"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(110deg, hsl(var(--raddo-paper-edge)) 0%, hsl(var(--raddo-paper)) 40%, hsl(var(--raddo-brass) / 0.08) 55%, hsl(var(--raddo-paper)) 70%, hsl(var(--raddo-paper-edge)) 100%)",
                    backgroundSize: "200% 100%",
                    animation: "raddo-shimmer 2.4s ease-in-out infinite",
                    filter: "blur(8px)",
                  }}
                />
              )}
            </AnimatePresence>
            <motion.img
              src="/brand/corner-cubicle.png"
              alt=""
              loading="eager"
              decoding="async"
              // @ts-expect-error · fetchpriority is a valid HTML attr not yet in React types
              fetchpriority="high"
              onLoad={() => setHeroImgLoaded(true)}
              initial={{ opacity: 0, filter: "blur(12px)", scale: 1.02 }}
              animate={
                heroImgLoaded
                  ? { opacity: 0.7, filter: "blur(0px)", scale: 1 }
                  : { opacity: 0, filter: "blur(12px)", scale: 1.02 }
              }
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="h-full w-full object-cover"
            />
            {/* Paper wash to keep text crisp */}
            <div
              className="absolute inset-0"
              style={{
                background: "hsl(var(--raddo-paper) / 0.5)",
              }}
            />
            {/* Brass frame corners */}
            <span className="pointer-events-none absolute left-3 top-3 h-3 w-3 border-l border-t border-raddo-brass-deep/60" />
            <span className="pointer-events-none absolute right-3 top-3 h-3 w-3 border-r border-t border-raddo-brass-deep/60" />
            <span className="pointer-events-none absolute bottom-3 left-3 h-3 w-3 border-b border-l border-raddo-brass-deep/60" />
            <span className="pointer-events-none absolute bottom-3 right-3 h-3 w-3 border-b border-r border-raddo-brass-deep/60" />
          </motion.div>

          {/* Headline · waits for image, then cascades in (300 / 600 / 900ms after reveal) */}
          <motion.h1
            initial={INITIAL}
            animate={heroImgLoaded ? "show" : "hidden"}
            className="relative font-display text-raddo-ink-deep px-6 py-10 md:px-10 md:py-14"
            style={{
              fontSize: "clamp(35px, 5.76vw, 74px)",
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.025em",
              maxWidth: "1080px",
            }}
          >
            <motion.span className="block" variants={rise(900, 300)}>
              Built for you day one.
            </motion.span>
            <motion.span
              className="block italic mt-20 md:mt-28"
              variants={rise(900, 600)}
              style={{ color: "hsl(var(--raddo-brass))", fontWeight: 800 }}
            >
              Sharpens with
              <br />
              every action.
            </motion.span>
            <motion.span className="block mt-20 md:mt-28" variants={rise(900, 900)}>
              Yours to wield anywhere.
            </motion.span>
          </motion.h1>
        </div>


        {/* Introducing COB · folder system · after the headline image */}
        <motion.div
          variants={rise(800, 2600)}
          initial={INITIAL}
          animate="show"
          className="mt-40 md:mt-52"
        >
          <IntroducingCob />
        </motion.div>




        {/* Briefing · Exhibit composition · 2600ms */}
        <motion.section
          variants={rise(800, 2600)}
          initial={INITIAL}
          animate="show"
          className="mt-40 md:mt-52 mx-auto"
          style={{ maxWidth: "1180px" }}
        >
          <BriefingComposition />
        </motion.section>

        {/* Asymmetric brass hairline · 3000ms */}
        <motion.div
          variants={scaleX(600, 3000)}
          initial={INITIAL}
          animate="show"
          className="mt-32 md:mt-40 h-px origin-left"
          style={{
            width: 280,
            backgroundColor: "hsl(var(--raddo-brass))",
            opacity: 0.7,
          }}
        />

        {/* CTA row · 3200ms */}
        <motion.div
          variants={rise(700, 3200)}
          initial={INITIAL}
          animate="show"
          className="mt-12 flex flex-col items-start gap-5 sm:flex-row sm:items-center"
        >
          <a
            href="/consult"
            className="raddo-cta-brass group inline-flex items-center gap-3 font-sans"
            style={{
              backgroundColor: "hsl(var(--raddo-brass))",
              color: "hsl(var(--raddo-ink-deep))",
              padding: "16px 28px",
              borderRadius: "4px",
              fontSize: "15px",
              fontWeight: 600,
              letterSpacing: "0.01em",
            }}
          >
            <span>Begin your 5-minute consult</span>
            <span aria-hidden className="transition-transform duration-220 group-hover:translate-x-[3px]">→</span>
          </a>
          <a
            href="/capability-brief.html"
            className="raddo-cta-ghost inline-flex items-center gap-2 font-sans text-raddo-ink-deep"
            style={{
              fontSize: "14px",
              fontWeight: 500,
              letterSpacing: "0.02em",
              padding: "12px 4px",
            }}
          >
            <span className="border-b border-raddo-brass-deep/40 pb-[2px]">
              Read the Capability Brief
            </span>
            <span aria-hidden>→</span>
          </a>
        </motion.div>

        {/* ====== HERO FILM PANEL ====== */}
        <motion.figure
          variants={rise(900, 3500)}
          initial={INITIAL}
          animate="show"
          className="relative mt-40 md:mt-52 overflow-hidden bg-raddo-paper"
          style={{
            borderRadius: 8,
            border: "1.5px solid hsl(var(--raddo-brass-deep) / 0.55)",
            boxShadow:
              "0 1px 0 hsl(var(--raddo-paper-edge)) inset, 0 8px 24px -16px hsl(var(--raddo-ink-deep) / 0.25)",
            aspectRatio: "1100 / 620",
          }}
        >
          {reduce ? (
            <img
              src="/brand/video/hero-poster.jpg"
              alt="The Six-Source Mandala · RADDO's canonical brand visualization showing email, meetings, documents, business chat, calendar and financial context held in continuous synthesis as one Chief Of Business."
              className="h-full w-full object-cover"
            />
          ) : (
            <video
              autoPlay
              muted
              loop
              playsInline
              poster="/brand/video/hero-poster.jpg"
              aria-label="Six-source mandala animation"
              className="h-full w-full object-cover"
            >
              <source src="/brand/video/hero.webm" type="video/webm" />
              <source src="/brand/video/hero.mp4" type="video/mp4" />
            </video>
          )}
          {/* Brass frame corners */}
          <span aria-hidden className="pointer-events-none absolute left-3 top-3 h-3 w-3 border-l border-t border-raddo-brass-deep/60" />
          <span aria-hidden className="pointer-events-none absolute right-3 top-3 h-3 w-3 border-r border-t border-raddo-brass-deep/60" />
          <span aria-hidden className="pointer-events-none absolute bottom-3 left-3 h-3 w-3 border-b border-l border-raddo-brass-deep/60" />
          <span aria-hidden className="pointer-events-none absolute bottom-3 right-3 h-3 w-3 border-b border-r border-raddo-brass-deep/60" />
          {/* Caption */}
          <figcaption
            className="absolute bottom-4 left-4 font-sans uppercase text-raddo-ink-deep/70"
            style={{ fontSize: "10px", letterSpacing: "0.28em" }}
          >
            PLATE I · The Six-Source Mandala
          </figcaption>
        </motion.figure>

        {/* Six-source row · scroll-triggered, per-chip stagger */}
        <motion.div
          initial={INITIAL === "show" ? "show" : "hidden"}
          whileInView="show"
          viewport={{ once: true, margin: "-12% 0px -12% 0px", amount: 0.3 }}
          variants={{
            hidden: {},
            show: {
              transition: {
                staggerChildren: reduce ? 0 : lowPower ? 0.04 : 0.07,
                delayChildren: reduce ? 0 : 0.05,
              },
            },
          }}
          className="mt-16 md:mt-20 grid grid-cols-2 gap-y-3 border-y border-raddo-brass-deep/15 py-6 md:grid-cols-6 md:gap-y-0"
        >
          {SOURCES.map((src, i) => (
            <motion.div
              key={src}
              variants={{
                hidden: { opacity: reduce ? 1 : 0, y: reduce ? 0 : 12 },
                show: {
                  opacity: 1,
                  y: 0,
                  transition: {
                    duration: (reduce ? 0 : 0.55) * (lowPower ? 0.85 : 1),
                    ease: EASE_OUT,
                  },
                },
              }}
              className="flex items-baseline gap-2"
            >
              <span
                className="font-sans text-raddo-brass tabular-nums"
                style={{ fontSize: "10px", letterSpacing: "0.18em" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className="font-sans uppercase text-raddo-charcoal"
                style={{ fontSize: "11px", letterSpacing: "0.18em", fontWeight: 500 }}
              >
                {src}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ====== EDITORIAL INDEX ====== */}
      <section className="relative z-10 mx-auto max-w-[1240px] border-t border-raddo-paper-edge px-8 py-20 md:px-12 md:py-28">

        <motion.div
          variants={fade(600, 0)}
          initial={INITIAL}
          whileInView="show"
          viewport={{ once: true, margin: "-15%" }}
          className="mb-12 flex items-baseline justify-between"
        >
          <span
            className="font-sans uppercase text-raddo-brass"
            style={{ fontSize: "11px", letterSpacing: "0.3em" }}
          >
            The Index
          </span>
          <span
            className="font-display italic text-raddo-ash"
            style={{ fontSize: "13px" }}
          >
            Four movements
          </span>
        </motion.div>

        <motion.div
          initial={INITIAL === "show" ? "show" : "hidden"}
          whileInView="show"
          viewport={{ once: true, margin: "-10% 0px -10% 0px", amount: 0.2 }}
          variants={{
            hidden: {},
            show: {
              transition: {
                staggerChildren: reduce ? 0 : lowPower ? 0.07 : 0.12,
                delayChildren: reduce ? 0 : 0.05,
              },
            },
          }}
          className="grid grid-cols-1 gap-x-12 gap-y-12 md:grid-cols-2 lg:grid-cols-4"
        >
          {INDEX.map((item) => (
            <motion.article
              key={item.roman}
              variants={{
                hidden: { opacity: reduce ? 1 : 0, y: reduce ? 0 : 22 },
                show: {
                  opacity: 1,
                  y: 0,
                  transition: {
                    duration: (reduce ? 0 : 0.7) * (lowPower ? 0.85 : 1),
                    ease: EASE_OUT,
                  },
                },
              }}
              className="flex flex-col"
            >
              <div
                className="font-display text-raddo-brass"
                style={{ fontSize: "44px", fontWeight: 800, lineHeight: 1 }}
              >
                {item.roman}
              </div>
              <div className="mt-1 h-px w-8 bg-raddo-brass-deep/60" />
              <h3
                className="mt-5 font-display text-raddo-ink-deep"
                style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.01em" }}
              >
                {item.label}
              </h3>
              <p
                className="mt-3 font-sans text-raddo-charcoal/[0.82]"
                style={{ fontSize: "15px", lineHeight: 1.55 }}
              >
                {item.body}
              </p>
            </motion.article>
          ))}
        </motion.div>
      </section>

      {/* ====== CLOSING CTA ====== */}
      <section className="relative z-10 mx-auto max-w-[1240px] border-t border-raddo-paper-edge px-8 py-24 md:px-12 md:py-32">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <span
              className="font-sans uppercase text-raddo-brass"
              style={{ fontSize: "11px", letterSpacing: "0.3em" }}
            >
              Begin
            </span>
            <h2
              className="mt-5 font-display text-raddo-ink-deep"
              style={{
                fontSize: "clamp(32px, 4.4vw, 56px)",
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
              }}
            >
              Sit down with us for five minutes.
              <span className="block italic text-raddo-brass">Walk out with a plan.</span>
            </h2>
            <p
              className="mt-6 max-w-[520px] font-sans text-raddo-charcoal/[0.84]"
              style={{ fontSize: "16px", lineHeight: 1.55 }}
            >
              A short, structured intake · theme-gap, ten word lists, fifteen
              calibration rows. Submit, and we schedule a sit-down. No demo
              reels, no decks. Just your COB starting to form around you.
            </p>
          </div>

          <div className="md:col-span-5">
            <a
              href="/consult"
              className="raddo-cta-brass group block w-full"
              style={{
                backgroundColor: "hsl(var(--raddo-brass))",
                color: "hsl(var(--raddo-ink-deep))",
                borderRadius: 8,
                padding: "28px 32px",
                textDecoration: "none",
              }}
            >
              <div
                className="font-sans uppercase"
                style={{ fontSize: "10px", letterSpacing: "0.3em", opacity: 0.7 }}
              >
                Begin · 5 minutes
              </div>
              <div
                className="mt-3 font-display"
                style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.1 }}
              >
                Set up your COB
              </div>
              <div
                className="mt-2 font-sans"
                style={{ fontSize: "14px", opacity: 0.85 }}
              >
                Theme-gap · ten lists · fifteen-row calibration.
              </div>
              <div
                className="mt-6 inline-flex items-center gap-2 font-sans"
                style={{ fontSize: "14px", fontWeight: 600 }}
              >
                <span className="border-b border-raddo-ink-deep/50 pb-[1px]">Begin setup</span>
                <span aria-hidden className="transition-transform duration-220 group-hover:translate-x-[3px]">→</span>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* ====== FOOTER ====== */}
      <footer className="relative z-10 mx-auto flex max-w-[1240px] flex-col gap-3 border-t border-raddo-paper-edge px-8 py-8 md:flex-row md:items-center md:justify-between md:px-12">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-[15px] font-black tracking-[-0.02em] text-raddo-ink-deep">
            RADDO
          </span>
          <span
            className="font-sans uppercase text-raddo-ash"
            style={{ fontSize: "10px", letterSpacing: "0.28em" }}
          >
            raddo.ai
          </span>
        </div>
        <div
          className="font-sans text-raddo-ash"
          style={{ fontSize: "11px", letterSpacing: "0.18em" }}
        >
          © 2026 · Built for the chair the day answers to.
        </div>
      </footer>

      <style>{`
        .raddo-cta-brass {
          transition: background-color 220ms cubic-bezier(0.22,1,0.36,1),
                      box-shadow 220ms cubic-bezier(0.22,1,0.36,1),
                      transform 120ms cubic-bezier(0.22,1,0.36,1);
          box-shadow: 0 1px 0 hsl(var(--raddo-brass-deep) / 0.4) inset,
                      0 4px 12px -8px hsl(var(--raddo-ink-deep) / 0.3);
        }
        .raddo-cta-brass:hover {
          background-color: hsl(var(--raddo-brass-deep) / 0.95) !important;
          color: hsl(var(--raddo-paper)) !important;
        }
        .raddo-cta-brass:focus-visible {
          outline: 2px solid hsl(var(--raddo-ink-deep));
          outline-offset: 3px;
        }
        .raddo-cta-brass:active {
          transform: translateY(1px);
        }
        .raddo-cta-ghost:hover {
          color: hsl(var(--raddo-brass-deep));
        }
        .raddo-cta-ghost:focus-visible {
          outline: 2px solid hsl(var(--raddo-brass));
          outline-offset: 3px;
          border-radius: 2px;
        }
        .duration-220 { transition-duration: 220ms; }
        @media (prefers-reduced-motion: reduce) {
          .raddo-cta-brass, .raddo-cta-ghost { transition: none; }
        }
      `}</style>
    </main>
  );
}
