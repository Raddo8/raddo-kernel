import { motion } from "framer-motion";

const BRAND_EASE = [0.22, 1, 0.36, 1] as const;

export function MeetYourCobLaunch({
  firstName,
  onLaunch,
}: {
  firstName?: string;
  onLaunch: () => void;
}) {
  const opener = firstName?.trim()
    ? `${firstName.trim()} · your COB is ready.`
    : "Your COB is ready.";

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: BRAND_EASE }}
      className="mx-auto max-w-3xl px-6 py-12 md:py-16"
      aria-labelledby="meet-cob-launch-heading"
    >
      <div
        className="relative p-8 md:p-10"
        style={{
          backgroundColor: "hsl(var(--raddo-paper))",
          border: "1px solid hsl(var(--raddo-paper-edge))",
          borderRadius: 8,
          boxShadow: "0 6px 20px -10px hsl(var(--raddo-ink-deep) / 0.2)",
        }}
      >
        <span
          className="font-mono"
          style={{
            color: "hsl(var(--raddo-brass-deep))",
            fontSize: 10,
            letterSpacing: "0.18em",
            fontWeight: 600,
            textTransform: "uppercase",
          }}
        >
          CONSULT RECEIVED · ROOM OPEN
        </span>
        <h2
          id="meet-cob-launch-heading"
          className="font-display mt-4"
          style={{
            color: "hsl(var(--raddo-ink-deep))",
            fontSize: "clamp(28px, 3.6vw, 40px)",
            lineHeight: 1.15,
            fontWeight: 800,
          }}
        >
          {opener}
        </h2>
        <p
          className="mt-4 max-w-2xl"
          style={{
            color: "hsl(var(--raddo-charcoal))",
            fontSize: 16,
            lineHeight: 1.6,
          }}
        >
          What you shared is in your COB's hands. Open the room and start with the first move you want made.
        </p>
        <div className="mt-7">
          <button
            type="button"
            onClick={onLaunch}
            className="inline-flex items-center justify-center font-mono transition-transform duration-150 active:translate-y-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-raddo-brass"
            style={{
              backgroundColor: "hsl(var(--raddo-brass))",
              color: "hsl(var(--raddo-ink-deep))",
              border: "1px solid hsl(var(--raddo-brass-deep))",
              borderRadius: 4,
              padding: "14px 24px",
              fontSize: 12,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 700,
              minWidth: 220,
              boxShadow: "0 4px 12px -6px hsl(var(--raddo-brass-deep) / 0.4)",
            }}
          >
            Meet your COB
          </button>
        </div>
      </div>
    </motion.section>
  );
}
