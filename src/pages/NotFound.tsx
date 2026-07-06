import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { SeoHead } from "@/components/SeoHead";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-raddo-paper px-6 py-20">
      <SeoHead
        path={location.pathname}
        title="Not found · COB"
        description="This page could not be located."
        robots="noindex,follow"
      />
      <div className="w-full max-w-md text-center">
        <p
          className="font-mono uppercase text-raddo-brass-deep mb-6"
          style={{ fontSize: 11, letterSpacing: "0.22em", fontWeight: 700 }}
        >
          file not found · 404
        </p>
        <h1
          className="font-display text-raddo-ink-deep"
          style={{ fontWeight: 800, fontSize: "clamp(2rem, 4vw, 3rem)", lineHeight: 1.1 }}
        >
          This page is not in the{" "}
          <span className="dossier-brass-underline">dossier</span>.
        </h1>
        <p className="mt-5 text-raddo-charcoal/85" style={{ fontSize: 16, lineHeight: 1.55 }}>
          The link may have been retired, or the address was mistyped.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <span className="h-px w-8 bg-raddo-brass/50" />
          <a
            href="/"
            className="font-mono uppercase text-raddo-ink-deep"
            style={{
              fontSize: 11,
              letterSpacing: "0.22em",
              borderBottom: "2px solid hsl(var(--raddo-brass))",
              paddingBottom: 2,
            }}
          >
            Return home
          </a>
          <span className="h-px w-8 bg-raddo-brass/50" />
        </div>
      </div>
    </main>
  );
};

export default NotFound;
