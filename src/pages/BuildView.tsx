import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

// Public, unauthenticated viewer for a published build.
//
// We can't just point an iframe at the get-build edge function: Supabase's
// gateway forces `Content-Security-Policy: default-src 'none'; sandbox` on
// every response from functions and storage, which blocks the build's own
// JavaScript from executing.
//
// Workaround: fetch the HTML through the edge function, wrap it in a Blob
// of type text/html, and feed the resulting blob: URL to the iframe. Blob
// URLs are served by the browser itself with no upstream CSP, so the build
// runs exactly as authored. The iframe sandbox still constrains it.
export default function BuildView() {
  const { token } = useParams<{ token: string }>();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Build";
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
  }, []);

  useEffect(() => {
    if (!token) return;
    let revoke: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${supabaseUrl}/functions/v1/get-build?token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        const text = await res.text();
        if (!res.ok) {
          if (!cancelled) setError(text || "This build is no longer available.");
          return;
        }
        const blob = new Blob([text], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        revoke = url;
        if (!cancelled) setSrc(url);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load build.");
      }
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [token, supabaseUrl]);

  const shell: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    width: "100vw",
    height: "100vh",
    background: "#0A0B0D",
    color: "#F4F4F2",
    fontFamily: "ui-sans-serif,-apple-system,Segoe UI,Helvetica,Arial,sans-serif",
  };

  if (error) {
    return (
      <div style={{ ...shell, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 480, padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>This build is no longer available.</h1>
          <p style={{ color: "#B9BEC6", margin: 0, fontSize: 14.5, lineHeight: 1.6 }}>
            The link may have expired or been revoked.
          </p>
        </div>
      </div>
    );
  }

  if (!src) {
    return <div style={shell} aria-busy="true" />;
  }

  return (
    <iframe
      src={src}
      title="Build"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
      style={{ ...shell, border: 0 }}
    />
  );
}
