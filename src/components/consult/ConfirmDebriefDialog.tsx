import { motion, AnimatePresence } from "framer-motion";

const BRAND_EASE = [0.22, 1, 0.36, 1] as const;

export type DebriefReviewSummary = {
  name: string;
  email: string;
  phone: string;
  occupation: string;
  challenge: string;
  currentStateCount: number;
  aspirationCount: number;
  toolsCount: number;
  decisionRowsAnswered: number;
  bucketNotesCount?: number;
};

export function ConfirmDebriefDialog({
  open,
  submitting,
  summary,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  submitting: boolean;
  summary: DebriefReviewSummary;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Name", value: summary.name || "—" },
    { label: "Email", value: summary.email || "—" },
    { label: "Phone", value: summary.phone || "—" },
    { label: "Occupation", value: summary.occupation || "—" },
    { label: "On your desk", value: summary.challenge || "—" },
    { label: "Current state words", value: String(summary.currentStateCount) },
    { label: "Aspiration words", value: String(summary.aspirationCount) },
    { label: "Tools selected", value: String(summary.toolsCount) },
    { label: "Decision rows answered", value: String(summary.decisionRowsAnswered) },
    { label: "Buckets with notes", value: `${summary.bucketNotesCount ?? 0} of 11` },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center px-6 py-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: BRAND_EASE }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-debrief-heading"
        >
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "hsl(var(--raddo-ink-deep) / 0.55)" }}
            onClick={submitting ? undefined : onCancel}
          />
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.42, ease: BRAND_EASE }}
            className="relative w-full max-w-xl p-7 max-h-[88vh] overflow-y-auto"
            style={{
              backgroundColor: "hsl(var(--raddo-paper))",
              border: "1px solid hsl(var(--raddo-paper-edge))",
              borderRadius: 8,
              boxShadow: "0 8px 24px -12px hsl(var(--raddo-ink-deep) / 0.35)",
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
              REVIEW · CONFIRM YOUR INFORMATION
            </span>
            <h2
              id="confirm-debrief-heading"
              className="font-display mt-3"
              style={{
                color: "hsl(var(--raddo-ink-deep))",
                fontSize: 24,
                lineHeight: 1.2,
                fontWeight: 700,
              }}
            >
              Does this look right?
            </h2>
            <p
              className="mt-3"
              style={{
                color: "hsl(var(--raddo-charcoal))",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              On confirm, we receive your request and follow up directly. Cancel to keep editing.
            </p>

            <dl
              className="mt-5"
              style={{
                border: "1px solid hsl(var(--raddo-paper-edge))",
                borderRadius: 8,
                backgroundColor: "white",
              }}
            >
              {rows.map((row, idx) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 px-4 py-3"
                  style={{
                    borderTop: idx === 0 ? "none" : "1px solid hsl(var(--raddo-paper-edge))",
                  }}
                >
                  <dt
                    className="font-mono"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "hsl(var(--raddo-ash))",
                    }}
                  >
                    {row.label}
                  </dt>
                  <dd
                    style={{
                      color: "hsl(var(--raddo-charcoal))",
                      fontSize: 14,
                      lineHeight: 1.5,
                      wordBreak: "break-word",
                    }}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="font-mono transition-colors disabled:opacity-50"
                style={{
                  border: "1px solid hsl(var(--raddo-paper-edge))",
                  backgroundColor: "transparent",
                  color: "hsl(var(--raddo-charcoal))",
                  borderRadius: 4,
                  padding: "10px 16px",
                  fontSize: 11,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                Edit answers
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={submitting}
                className="font-mono transition-colors disabled:opacity-60"
                style={{
                  backgroundColor: "hsl(var(--raddo-brass))",
                  color: "hsl(var(--raddo-ink-deep))",
                  border: "1px solid hsl(var(--raddo-brass-deep))",
                  borderRadius: 4,
                  padding: "10px 18px",
                  fontSize: 11,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}
              >
                {submitting ? "Sending…" : "Confirm · send request"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
