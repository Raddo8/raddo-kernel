import { motion, useReducedMotion, type Variants, type Transition } from "framer-motion";

const EASE: Transition["ease"] = [0.22, 1, 0.36, 1];

export function Hero() {
  const reduce = useReducedMotion();

  const rise = (duration: number, delay: number): Variants => ({
    hidden: { opacity: reduce ? 1 : 0, y: reduce ? 0 : 24 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: reduce ? 0 : duration / 1000, delay: reduce ? 0 : delay / 1000, ease: EASE },
    },
  });

  const fade = (duration: number, delay: number): Variants => ({
    hidden: { opacity: reduce ? 1 : 0 },
    show: {
      opacity: 1,
      transition: { duration: reduce ? 0 : duration / 1000, delay: reduce ? 0 : delay / 1000, ease: EASE },
    },
  });

  return (
    <section
      className="relative w-full min-h-screen overflow-hidden bg-raddo-paper"
      aria-label="RADDO hero"
    >
      {/* Full-bleed background mandala */}
      <motion.div
        className="absolute inset-0 z-0"
        initial={{ opacity: reduce ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0 : 0.8, ease: EASE }}
      >
        {/* TODO: replace with /brand/hero-six-source-mandala.png — currently present */}
        <img
          src="/brand/hero-six-source-mandala.png"
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover object-center select-none"
          draggable={false}
        />
        {/* Paper overlay */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(250,248,244,0.50)" }}
        />
      </motion.div>

      {/* Content stack — anchored ~38% from top */}
      <div className="relative z-10 flex justify-center px-6 pt-[38vh] pb-24 md:pt-[38vh]">
        <div className="flex flex-col items-center text-center max-w-[880px]">
          <motion.p
            variants={fade(600, 200)}
            initial="hidden"
            animate="show"
            className="font-sans uppercase text-raddo-brass mb-6"
            style={{
              fontSize: "clamp(12px, 1.05vw, 13px)",
              fontWeight: 500,
              letterSpacing: "0.25em",
            }}
          >
            Clarity. Origin. Decision.
          </motion.p>

          <motion.h1
            variants={rise(1200, 600)}
            initial="hidden"
            animate="show"
            className="font-display text-raddo-ink"
            style={{
              fontSize: "clamp(40px, 6vw, 64px)",
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              maxWidth: "880px",
            }}
          >
            Your morning decision packet, assembled before the day starts.
          </motion.h1>

          <motion.p
            variants={rise(800, 1600)}
            initial="hidden"
            animate="show"
            className="font-sans mt-6 text-raddo-charcoal/[0.88]"
            style={{
              fontSize: "clamp(17px, 1.4vw, 20px)",
              fontWeight: 400,
              lineHeight: 1.5,
              maxWidth: "640px",
            }}
          >
            Email, meetings, documents, business chat, calendar and financial context resolve into one clear briefing.
          </motion.p>

          <motion.div
            variants={rise(600, 2200)}
            initial="hidden"
            animate="show"
            className="mt-10"
          >
            <a
              href="#consult"
              className="raddo-cta inline-flex items-center justify-center font-sans text-raddo-ink bg-raddo-brass focus-visible:outline-none"
              style={{
                fontSize: "16px",
                fontWeight: 500,
                padding: "14px 28px",
                borderRadius: "4px",
              }}
            >
              See your first brief
            </a>
          </motion.div>

          <motion.p
            variants={fade(800, 2600)}
            initial="hidden"
            animate="show"
            className="font-sans uppercase mt-8 text-raddo-ash/70"
            style={{
              fontSize: "13px",
              fontWeight: 400,
              letterSpacing: "0.05em",
            }}
          >
            <span className="hidden md:inline">
              Email · Meetings · Documents · Business chat · Calendar · Financials
            </span>
            <span className="md:hidden">
              Email · Meetings · Documents · +3 more signals
            </span>
          </motion.p>
        </div>
      </div>

      <style>{`
        .raddo-cta {
          transition: background-color 220ms cubic-bezier(0.22,1,0.36,1),
                      box-shadow 220ms cubic-bezier(0.22,1,0.36,1),
                      transform 120ms cubic-bezier(0.22,1,0.36,1);
        }
        .raddo-cta:hover {
          background-color: hsl(var(--raddo-brass-deep) / 0.92);
          box-shadow: 0 4px 8px hsl(var(--raddo-ink) / 0.12);
        }
        .raddo-cta:focus-visible {
          outline: 2px solid hsl(var(--raddo-brass));
          outline-offset: 3px;
        }
        .raddo-cta:active {
          background-color: hsl(var(--raddo-brass-deep));
          transform: translateY(1px);
        }
        @media (prefers-reduced-motion: reduce) {
          .raddo-cta { transition: none; }
        }
      `}</style>
    </section>
  );
}
