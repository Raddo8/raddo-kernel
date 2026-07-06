import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Full-bleed navy pane header band. Sits above a paper page body.
 * Used for public-facing surfaces that already own their form/body layout
 * (Consult, Debrief, ConsultThankYou, DebriefThankYou, NextStep, Respond).
 */
export function DossierPageBand({
  chip,
  headline,
  keyword,
  headlineTrail,
  subhead,
  backHref = "/",
  backLabel = "← Back home",
  children,
}: {
  chip: string;
  headline: string;
  keyword?: string;
  headlineTrail?: string;
  subhead?: string;
  backHref?: string | null;
  backLabel?: string;
  children?: ReactNode;
}) {
  return (
    <header className="dossier-navy-pane relative w-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 md:px-10 md:py-16">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <span className="dossier-brass-chip">{chip}</span>
          {backHref ? (
            <Link
              to={backHref}
              className="font-mono uppercase text-raddo-paper/70 hover:text-raddo-paper"
              style={{ fontSize: 11, letterSpacing: "0.18em" }}
            >
              {backLabel}
            </Link>
          ) : null}
        </div>
        <h1
          className="font-display text-raddo-paper max-w-4xl"
          style={{
            fontSize: "clamp(2rem, 4.5vw, 3.5rem)",
            lineHeight: 1.06,
            fontWeight: 800,
          }}
        >
          {headline}
          {keyword ? (
            <>
              {" "}
              <span className="dossier-brass-underline">{keyword}</span>
            </>
          ) : null}
          {headlineTrail ?? null}
        </h1>
        {subhead ? (
          <p
            className="max-w-3xl font-sans text-raddo-paper/85"
            style={{ fontSize: 17, lineHeight: 1.6 }}
          >
            {subhead}
          </p>
        ) : null}
        {children}
        <div className="dossier-mono-footer mt-4">
          <span>chief of business · dossier</span>
          <span>© 2026 COB Technologies LLC</span>
        </div>
      </div>
    </header>
  );
}
