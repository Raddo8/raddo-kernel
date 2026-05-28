import { motion, AnimatePresence } from "framer-motion";

const BRAND_EASE = [0.22, 1, 0.36, 1] as const;

export function ConfirmMeetDialog({
  open,
  submitting,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: BRAND_EASE }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-meet-heading"
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
            className="relative w-full max-w-md p-7"
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
              READY TO MEET
            </span>
            <h2
              id="confirm-meet-heading"
              className="font-display mt-3"
              style={{
                color: "hsl(var(--raddo-ink-deep))",
                fontSize: 24,
                lineHeight: 1.2,
                fontWeight: 700,
              }}
            >
              Submit and meet your COB?
            </h2>
            <p
              className="mt-3"
              style={{
                color: "hsl(var(--raddo-charcoal))",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              On confirm, your consult is sent and your COB · pre-install · will open ready to work with what you shared. No back step.
            </p>
            <p
              className="mt-2"
              style={{
                color: "hsl(var(--raddo-ash))",
                fontSize: 12,
                lineHeight: 1.55,
              }}
            >
              Take another minute if anything is unfinished. Cancel keeps the form open.
            </p>

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
                Cancel
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
                {submitting ? "Sending…" : "Confirm · meet COB"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
