import { useEffect } from "react";
import { useParams } from "react-router-dom";

// Public, unauthenticated viewer for a published build.
// The actual HTML is served by the `get-build` edge function (with noindex
// headers + view logging). We render it in a full-viewport iframe so the
// self-contained interactive HTML runs exactly as authored.
export default function BuildView() {
  const { token } = useParams<{ token: string }>();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const src = `${supabaseUrl}/functions/v1/get-build?token=${encodeURIComponent(token ?? "")}`;

  useEffect(() => {
    document.title = "Build";
    // Inject a noindex meta in case the iframe headers aren't enough for crawlers.
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

  return (
    <iframe
      src={src}
      title="Build"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        border: 0,
        background: "#0A0B0D",
      }}
    />
  );
}
