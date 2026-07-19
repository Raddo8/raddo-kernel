import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Client-facing onboarding shell. Cream paper, navy ink, brass accents.
 * Persistent progress bar across the guided flow.
 */
export function OnboardingShell({
  percent,
  eyebrow,
  children,
  wide = false,
}: {
  percent?: number;
  eyebrow?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-dossier-paper text-dossier-ink-deep">
      <header className="border-b border-dossier-paper-edge bg-dossier-paper/90 backdrop-blur">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <Link to="/" className="dossier-brass-chip" style={{ textDecoration: "none" }}>
            chief of business
          </Link>
          {typeof percent === "number" && (
            <div className="flex items-center gap-3 w-64">
              <div className="h-1 flex-1 bg-dossier-paper-edge rounded overflow-hidden">
                <div className="h-full bg-dossier-brass" style={{ width: `${percent}%` }} />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-dossier-ash">
                {percent}%
              </span>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto px-6 py-12 md:py-16" style={{ maxWidth: wide ? 900 : 680 }}>
        {eyebrow && (
          <p
            className="font-mono uppercase mb-3"
            style={{ fontSize: 10, letterSpacing: "0.22em", color: "hsl(var(--dossier-brass-deep))", fontWeight: 700 }}
          >
            {eyebrow}
          </p>
        )}
        {children}
      </main>
      <footer className="mx-auto max-w-5xl px-6 py-8 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-dossier-ash">
          © 2026 COB Technologies LLC
        </p>
      </footer>
    </div>
  );
}
