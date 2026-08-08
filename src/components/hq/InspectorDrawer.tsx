/** InspectorDrawer · the one right-hand inspector used by every HQ surface.
 *
 * Non destructive: it never navigates, never writes, and closes on Escape or
 * on a scrim click. Both the Boardroom minute and the fleet activity event
 * render through this single primitive so the two pages read as one product.
 */
import { useEffect, useRef, type ReactNode } from "react";

export interface InspectorDrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

export function InspectorDrawer({ open, title, subtitle, onClose, children }: InspectorDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      // Keep the keyboard inside the inspector while it is open.
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="insp-scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="insp"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
      >
        <header className="insp-h">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="insp-x" onClick={onClose} ref={closeRef}>
            Close
          </button>
        </header>
        <div className="insp-b">{children}</div>
      </div>
    </>
  );
}

/** Labelled field. Fields are read as words, never as raw JSON. */
export function InspectorField({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="insp-f">
      <div className="insp-fk">{k}</div>
      <div className="insp-fv">{v}</div>
    </div>
  );
}

export default InspectorDrawer;
