import { useEffect, useState } from "react";
import { loadSurface, type SurfaceKey } from "@/lib/surface";

const SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads";

const shell: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  width: "100vw",
  height: "100vh",
  background: "hsl(var(--dossier-paper))",
  color: "hsl(var(--dossier-charcoal))",
  fontFamily: "Inter, system-ui, -apple-system, sans-serif",
};

/** Full-viewport renderer for a pinned surface document. */
export function SurfaceFrame({ surfaceKey, title }: { surfaceKey: SurfaceKey; title: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    document.title = title;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow, noarchive";
    document.head.appendChild(meta);
    const prevBodyMargin = document.body.style.margin;
    document.body.style.margin = "0";
    return () => {
      document.head.removeChild(meta);
      document.body.style.margin = prevBodyMargin;
    };
  }, [title]);

  useEffect(() => {
    let cancelled = false;
    let revoke: string | null = null;
    (async () => {
      const result = await loadSurface(surfaceKey);
      if (cancelled) {
        if (result.url) URL.revokeObjectURL(result.url);
        return;
      }
      if (!result.url) {
        setUnavailable(true);
        return;
      }
      revoke = result.url;
      setSrc(result.url);
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [surfaceKey]);

  if (unavailable) {
    return (
      <div
        style={{ ...shell, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      >
        <div
          className="dossier-navy-shadow"
          style={{
            maxWidth: 480,
            padding: 40,
            textAlign: "center",
            background: "white",
            border: "1px solid hsl(var(--dossier-paper-edge))",
            borderRadius: 8,
          }}
        >
          <p
            className="font-mono uppercase"
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              color: "hsl(var(--dossier-brass-deep))",
              fontWeight: 700,
              margin: "0 0 14px",
            }}
          >
            surface · pending
          </p>
          <h1
            className="font-display"
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "hsl(var(--dossier-ink-deep))",
              margin: "0 0 10px",
              lineHeight: 1.2,
            }}
          >
            Your HQ is being prepared.
          </h1>
          <p style={{ color: "hsl(var(--dossier-ash))", margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            Nothing has been published to this account yet.
          </p>
        </div>
      </div>
    );
  }

  if (!src) return <div style={shell} aria-busy="true" />;

  return (
    <iframe src={src} title={title} sandbox={SANDBOX} style={{ ...shell, border: 0 }} />
  );
}
