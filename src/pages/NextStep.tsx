import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { SeoHead } from "@/components/SeoHead";

const BRAND_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const BOOKING_URL =
  (import.meta.env.VITE_CAL_BOOKING_URL as string | undefined) ?? "https://cal.com/chiefofbusiness";

export default function NextStep() {
  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  return (
    <main
      className="min-h-screen flex items-center justify-center px-6 py-16"
      style={{ backgroundColor: "hsl(var(--raddo-paper))" }}
    >
      <SeoHead
        title="You're on the list · COB"
        description="Your COB conversation is in. Someone from the deployment team will reach out within one business day."
        path="/next-step"
      />

      <motion.section
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: BRAND_EASE }}
        className="w-full max-w-xl"
        aria-labelledby="next-step-heading"
      >
        <span
          className="font-sans"
          style={{
            color: "hsl(var(--raddo-brass-deep))",
            fontSize: "10px",
            letterSpacing: "0.18em",
            fontWeight: 600,
          }}
        >
          DEPLOYMENT · RECEIVED
        </span>

        <h1
          id="next-step-heading"
          className="font-display mt-3"
          style={{
            color: "hsl(var(--raddo-ink))",
            fontSize: "clamp(32px, 5vw, 48px)",
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          You're on the list.
        </h1>

        <div
          className="font-sans mt-6 space-y-4"
          style={{
            color: "hsl(var(--raddo-ink))",
            fontSize: "16px",
            lineHeight: 1.6,
          }}
        >
          <p>
            Transcript on its way · should arrive in the next 5 minutes from{" "}
            <span style={{ color: "hsl(var(--raddo-ink-deep))", fontWeight: 600 }}>
              cob@chiefofbusiness.ai
            </span>
            .
          </p>
          <p>
            Someone from the deployment team will read through what you sent and reach out within one business day.
          </p>
          <p>If you'd rather skip the email back-and-forth and grab a slot directly:</p>
        </div>

        <div className="mt-7">
          <a
            href={BOOKING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-6 py-3 font-sans transition-transform duration-150 active:translate-y-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-raddo-brass"
            style={{
              backgroundColor: "hsl(var(--raddo-brass))",
              color: "hsl(var(--raddo-ink-deep))",
              border: "1px solid hsl(var(--raddo-brass-deep))",
              borderRadius: "4px",
              fontSize: "13px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Book a 30-min slot
          </a>
        </div>

        <div className="mt-10">
          <Link
            to="/"
            className="font-sans"
            style={{
              color: "hsl(var(--raddo-ash))",
              fontSize: "13px",
              letterSpacing: "0.04em",
              borderBottom: "1px solid hsl(var(--raddo-paper-edge))",
              paddingBottom: "1px",
            }}
          >
            Back to home
          </Link>
        </div>
      </motion.section>
    </main>
  );
}
