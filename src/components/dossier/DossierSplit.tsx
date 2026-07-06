import type { ReactNode } from "react";
import { DossierBrandPane } from "./DossierBrandPane";

/**
 * Two-column split composition used by /login, /oauth/consent, and /app auth.
 * Left: navy brandpane (or a compact chip lockup on mobile).
 * Right: paper formpane with a white card carrying `.dossier-navy-shadow`.
 */
export function DossierSplit({
  brand,
  children,
  wide = false,
}: {
  brand: {
    chip?: string;
    headline: string;
    keyword: string;
    headlineTrail?: string;
    pitch: string;
  };
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <main className="min-h-screen bg-dossier-paper">
      {/* Mobile compact chip lockup · replaces the pane below md */}
      <div className="dossier-navy-pane md:hidden px-6 py-6">
        <span className="dossier-brass-chip">{brand.chip ?? "chief of business · dossier"}</span>
      </div>

      <div className="grid min-h-screen md:grid-cols-2">
        <div className="hidden md:block">
          <DossierBrandPane {...brand} />
        </div>
        <section className="flex items-center justify-center px-6 py-12 md:px-10 md:py-16">
          <div
            className={`dossier-navy-shadow w-full ${wide ? "max-w-xl" : "max-w-md"} bg-white p-8 md:p-10`}
            style={{ border: "1px solid hsl(var(--dossier-paper-edge))", borderRadius: 8 }}
          >
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

/** Uppercase mono field label used in forms rendered inside the split. */
export function DossierFieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block font-mono uppercase mb-2"
      style={{
        fontSize: 10,
        letterSpacing: "0.22em",
        color: "hsl(var(--dossier-ash))",
      }}
    >
      {children}
    </label>
  );
}
