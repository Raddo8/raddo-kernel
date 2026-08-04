import { Link } from "react-router-dom";
import cobMarkAsset from "@/assets/cob-square-dark.png.asset.json";
const cobMark = cobMarkAsset.url;


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
  mark = false,
}: {
  chip?: string;
  headline: string;
  keyword: string;
  headlineTrail?: string;
  pitch: string;
  /** Renders the canonical COB square mark above the chip. */
  mark?: boolean;
}) {
  return (
    <aside className="dossier-navy-pane relative flex min-h-full flex-col justify-between px-8 py-12 md:px-14 md:py-16">
      <div>
        {mark ? (
          <img
            src={cobMark}
            alt="Chief of Business"
            width={56}
            height={56}
            className="mb-7 block"
            style={{ width: 56, height: 56, borderRadius: 8 }}
          />
        ) : null}
        <Link
          to="/"
          className="dossier-brass-chip"
          style={{ textDecoration: "none" }}
        >
          {chip}
        </Link>

        <h2
          className="font-display mt-8 text-dossier-paper"
          style={{ fontSize: "clamp(28px, 3.6vw, 44px)", fontWeight: 800, lineHeight: 1.1 }}
        >
          {headline}{" "}
          <span className="dossier-brass-underline">{keyword}</span>
          {headlineTrail ? <>{headlineTrail}</> : null}
        </h2>
        <p
          className="mt-6 max-w-md font-sans text-dossier-paper/80"
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
