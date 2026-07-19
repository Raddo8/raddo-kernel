import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { Helmet } from "react-helmet-async";

/**
 * Client-facing onboarding shell.
 * - Persistent progress bar top right.
 * - Optional back control top left (defaults to browser back).
 * - Optional "Saved" indicator that fades in when autosave writes.
 * - Optional rail (chapter list) and world (right side panel).
 * - Fluid, border-box, no horizontal overflow at any width.
 */
export function OnboardingShell({
  percent,
  eyebrow,
  title,
  onBack,
  hideBack,
  saved,
  children,
  rail,
  world,
  wide = false,
}: {
  percent?: number;
  eyebrow?: string;
  title?: string;
  onBack?: () => void;
  hideBack?: boolean;
  saved?: boolean;
  children: ReactNode;
  rail?: ReactNode;
  world?: ReactNode;
  wide?: boolean;
}) {
  const navigate = useNavigate();
  const goBack = () => (onBack ? onBack() : navigate(-1));
  const pageTitle = title ? `${title} · Meet your Chief of Business` : "Meet your Chief of Business";

  return (
    <div className="min-h-screen bg-dossier-paper text-dossier-ink-deep" style={{ boxSizing: "border-box" }}>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content="Meet your Chief of Business. A warm, guided onboarding for founders and operators." />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content="Meet your Chief of Business. A warm, guided onboarding for founders and operators." />
      </Helmet>

      <header
        className="sticky top-0 z-30 border-b border-dossier-paper-edge bg-dossier-paper/95 backdrop-blur"
        style={{ minHeight: 56 }}
      >
        <div className="mx-auto flex items-center gap-3 px-4 py-3 md:px-6" style={{ maxWidth: 1280 }}>
          {!hideBack && (
            <button
              onClick={goBack}
              aria-label="Back"
              className="inline-flex items-center justify-center rounded transition hover:bg-dossier-paper-edge"
              style={{ width: 44, height: 44, minWidth: 44 }}
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <Link
            to="/"
            className="dossier-brass-chip shrink-0"
            style={{ textDecoration: "none" }}
          >
            chief of business
          </Link>
          <div className="flex-1 min-w-0" />
          <div
            className="flex items-center gap-2 font-mono uppercase text-dossier-ash"
            style={{
              fontSize: 10,
              letterSpacing: "0.16em",
              opacity: saved ? 1 : 0,
              transition: "opacity 220ms cubic-bezier(0.22,1,0.36,1)",
            }}
            aria-live="polite"
          >
            <Check size={12} className="text-dossier-brass-deep" />
            <span>Saved</span>
          </div>
          {typeof percent === "number" && (
            <div className="hidden sm:flex items-center gap-3" style={{ width: 200 }}>
              <div className="h-1 flex-1 bg-dossier-paper-edge rounded overflow-hidden">
                <div
                  className="h-full bg-dossier-brass"
                  style={{ width: `${percent}%`, transition: "width 300ms cubic-bezier(0.22,1,0.36,1)" }}
                />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-dossier-ash">
                {percent}%
              </span>
            </div>
          )}
        </div>
        {typeof percent === "number" && (
          <div className="sm:hidden h-1 bg-dossier-paper-edge">
            <div className="h-full bg-dossier-brass" style={{ width: `${percent}%`, transition: "width 300ms" }} />
          </div>
        )}
      </header>

      <div
        className="mx-auto px-4 md:px-6 pb-16"
        style={{ maxWidth: 1280, boxSizing: "border-box" }}
      >
        <div
          className="grid gap-8 pt-8 md:pt-12"
          style={{
            gridTemplateColumns: rail || world
              ? `${rail ? "220px" : ""} minmax(0, 1fr) ${world ? "260px" : ""}`.replace(/\s+/g, " ").trim()
              : "minmax(0, 1fr)",
          }}
        >
          {rail && <aside className="hidden lg:block min-w-0">{rail}</aside>}
          <main className="min-w-0 mx-auto w-full" style={{ maxWidth: wide ? 780 : 640 }}>
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
          {world && <aside className="hidden lg:block min-w-0">{world}</aside>}
        </div>
      </div>

      <footer className="border-t border-dossier-paper-edge mt-8">
        <div className="mx-auto px-4 py-6 md:px-6" style={{ maxWidth: 1280 }}>
          <p className="font-mono text-[10px] uppercase tracking-widest text-dossier-ash text-center">
            © 2026 COB Technologies LLC · questions? cob@chiefofbusiness.ai
          </p>
        </div>
      </footer>
    </div>
  );
}
