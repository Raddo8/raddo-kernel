import { Link } from "react-router-dom";

/**
 * Left-side navy brandpane used across auth-adjacent split compositions.
 * Renders the sanctioned elements (§17 of the dossier bible):
 *   · navy pane (gradient + brass glow + cool lift + engineering grid)
 *   · brass chip eyebrow
 *   · one-line pitch with a brass-underlined key word
 *   · mono footer strip ("CHIEF OF BUSINESS · DOSSIER" / copyright)
 *
 * The pane collapses to a compact chip lockup on mobile via the `mobileCompact`
 * flag (used by the split shell).
 */
export function DossierBrandPane({
  chip = "chief of business · dossier",
  headline,
  keyword,
  headlineTrail,
  pitch,
}: {
  chip?: string;
  headline: string;
  keyword: string;
  headlineTrail?: string;
  pitch: string;
}) {
  return (
    <aside className="dossier-navy-pane relative flex min-h-full flex-col justify-between px-8 py-12 md:px-14 md:py-16">
      <div>
        <Link
          to="/"
          className="dossier-brass-chip"
          style={{ textDecoration: "none" }}
        >
          {chip}
        </Link>
        <h2
          className="font-display mt-8 text-raddo-paper"
          style={{ fontSize: "clamp(28px, 3.6vw, 44px)", fontWeight: 800, lineHeight: 1.1 }}
        >
          {headline}{" "}
          <span className="dossier-brass-underline">{keyword}</span>
          {headlineTrail ? <>{headlineTrail}</> : null}
        </h2>
        <p
          className="mt-6 max-w-md font-sans text-raddo-paper/80"
          style={{ fontSize: 16, lineHeight: 1.6 }}
        >
          {pitch}
        </p>
      </div>
      <div className="dossier-mono-footer mt-16">
        <span>chief of business · dossier</span>
        <span>© 2026 COB Technologies LLC</span>
      </div>
    </aside>
  );
}
