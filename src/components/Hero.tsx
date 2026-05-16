import { motion, useReducedMotion, type Variants, type Transition } from "framer-motion";
import { useEffect, useState } from "react";

const EASE: Transition["ease"] = [0.22, 1, 0.36, 1];

const SOURCES = [
  "Email",
  "Meetings",
  "Documents",
  "Business chat",
  "Calendar",
  "Financials",
];

const INDEX = [
  { roman: "I", label: "Clarity", body: "Six sources resolve into one brief before the day begins." },
  { roman: "II", label: "Origin", body: "Every line is sourced. Email, meeting, document, ledger — labelled." },
  { roman: "III", label: "Decision", body: "Approve, escalate, redirect. The briefing presents the call, not the noise." },
  { roman: "IV", label: "Authority", body: "Built for the chair the day answers to. Discreet, restrained, yours." },
];

export function Hero() {
  const reduce = useReducedMotion();
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

  const rise = (duration: number, delay: number): Variants => ({
    hidden: { opacity: reduce ? 1 : 0, y: reduce ? 0 : 24 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: reduce ? 0 : duration / 1000,
        delay: reduce ? 0 : delay / 1000,
        ease: EASE,
      },
    },
  });

  const fade = (duration: number, delay: number): Variants => ({
    hidden: { opacity: reduce ? 1 : 0 },
    show: {
      opacity: 1,
      transition: {
        duration: reduce ? 0 : duration / 1000,
        delay: reduce ? 0 : delay / 1000,
        ease: EASE,
      },
    },
  });

  const scaleX = (duration: number, delay: number): Variants => ({
    hidden: { opacity: reduce ? 1 : 0, scaleX: reduce ? 1 : 0 },
    show: {
      opacity: 1,
      scaleX: 1,
      transition: {
        duration: reduce ? 0 : duration / 1000,
        delay: reduce ? 0 : delay / 1000,
        ease: EASE,
      },
    },
  });

  return (
    <main className="relative w-full bg-raddo-paper text-raddo-charcoal selection:bg-raddo-brass/30">
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

      {/* ====== EDITION BAR ====== */}
      <header className="relative z-10 mx-auto flex max-w-[1240px] items-end justify-between px-8 pt-8 md:px-12 md:pt-10">
        <motion.div
          variants={fade(600, 100)}
          initial="hidden"
          animate="show"
          className="flex items-baseline gap-4"
        >
          <span className="font-display text-[22px] font-black tracking-[-0.02em] text-raddo-ink-deep">
            RADDO
          </span>
          <span className="hidden h-px w-12 bg-raddo-brass-deep/40 md:block" />
          <span
            className="hidden font-sans text-[11px] uppercase text-raddo-ash md:inline"
            style={{ letterSpacing: "0.25em" }}
          >
            Chief of Business
          </span>
        </motion.div>
        <motion.div
          variants={fade(600, 200)}
          initial="hidden"
          animate="show"
          className="text-right"
        >
          <div
            className="font-sans text-[10px] uppercase text-raddo-brass"
            style={{ letterSpacing: "0.3em" }}
          >
            Edition 01 · 2026
          </div>
          <div className="mt-1 font-display text-[13px] italic text-raddo-ash">
            {now}
          </div>
        </motion.div>
      </header>

      {/* ====== HERO ====== */}
      <section className="relative z-10 mx-auto max-w-[1240px] px-8 pt-16 pb-24 md:px-12 md:pt-24 md:pb-32">
        {/* Overline */}
        <motion.p
          variants={fade(600, 200)}
          initial="hidden"
          animate="show"
          className="font-sans uppercase text-raddo-brass"
          style={{
            fontSize: "12px",
            fontWeight: 500,
            letterSpacing: "0.32em",
          }}
        >
          Clarity · Origin · Decision.
        </motion.p>

        {/* Headline */}
        <motion.h1
          variants={rise(1200, 400)}
          initial="hidden"
          animate="show"
          className="mt-7 font-display text-raddo-ink-deep"
          style={{
            fontSize: "clamp(44px, 7.2vw, 92px)",
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: "-0.025em",
            maxWidth: "1080px",
          }}
        >
          <span className="block">Built for you day one.</span>
          <span
            className="block italic"
            style={{ color: "hsl(var(--raddo-brass))", fontWeight: 800 }}
          >
            Sharpens with every action.
          </span>
          <span className="block">Yours to wield anywhere.</span>
        </motion.h1>

        {/* Lede */}
        <motion.p
          variants={rise(800, 900)}
          initial="hidden"
          animate="show"
          className="mt-9 font-sans text-raddo-charcoal/[0.86]"
          style={{
            fontSize: "clamp(17px, 1.4vw, 20px)",
            fontWeight: 400,
            lineHeight: 1.55,
            maxWidth: "720px",
          }}
        >
          Email, meetings, documents, business chat, calendar, operations,
          finance, legal, people, and risk context resolve into briefings,
          drafts, decisions, projects, reports, presentations, and counsel.
          In the morning. Before each meeting. Through each decision. Across
          each decade. Sourced. Restrained. Yours.
        </motion.p>

        {/* Asymmetric brass hairline */}
        <motion.div
          variants={scaleX(600, 1400)}
          initial="hidden"
          animate="show"
          className="mt-10 h-px origin-left"
          style={{
            width: 280,
            backgroundColor: "hsl(var(--raddo-brass))",
            opacity: 0.7,
          }}
        />

        {/* CTA row */}
        <motion.div
          variants={rise(700, 1600)}
          initial="hidden"
          animate="show"
          className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center"
        >
          <a
            href="/setup.html"
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
          variants={rise(900, 1900)}
          initial="hidden"
          animate="show"
          className="relative mt-16 overflow-hidden bg-raddo-paper"
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
              alt="The Six-Source Mandala — RADDO's canonical brand visualization showing email, meetings, documents, business chat, calendar and financial context resolving into one briefing."
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

        {/* Six-source row */}
        <motion.div
          variants={fade(800, 2200)}
          initial="hidden"
          animate="show"
          className="mt-10 grid grid-cols-2 gap-y-3 border-y border-raddo-brass-deep/15 py-5 md:grid-cols-6 md:gap-y-0"
        >
          {SOURCES.map((src, i) => (
            <div key={src} className="flex items-baseline gap-2">
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
            </div>
          ))}
        </motion.div>
      </section>

      {/* ====== EDITORIAL INDEX ====== */}
      <section className="relative z-10 mx-auto max-w-[1240px] border-t border-raddo-paper-edge px-8 py-20 md:px-12 md:py-28">
        <motion.div
          variants={fade(600, 0)}
          initial="hidden"
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

        <div className="grid grid-cols-1 gap-x-12 gap-y-12 md:grid-cols-2 lg:grid-cols-4">
          {INDEX.map((item, i) => (
            <motion.article
              key={item.roman}
              variants={rise(700, i * 120)}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-10%" }}
              className="flex flex-col"
            >
              <div
                className="font-display text-raddo-brass-deep"
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
        </div>
      </section>

      {/* ====== CLOSING CTA ====== */}
      <section className="relative z-10 mx-auto max-w-[1240px] border-t border-raddo-paper-edge px-8 py-24 md:px-12 md:py-32">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <span
              className="font-sans uppercase text-raddo-brass-deep"
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
              <span className="block italic text-raddo-brass-deep">Walk out with a plan.</span>
            </h2>
            <p
              className="mt-6 max-w-[520px] font-sans text-raddo-charcoal/[0.84]"
              style={{ fontSize: "16px", lineHeight: 1.55 }}
            >
              A short, structured intake — theme-gap, ten word lists, fifteen
              calibration rows. Submit, and we schedule a sit-down. No demo
              reels, no decks. Just the brief you would have wanted yesterday.
            </p>
          </div>

          <div className="md:col-span-5">
            <a
              href="/setup.html"
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
