import { useEffect, useRef } from "react";

/**
 * Serves public/onboarding-v1.html verbatim inside a full-viewport iframe.
 * After the file's own script runs, we inject public/onboarding-bridge.js
 * into the iframe document — never editing the file's bytes.
 */
export default function OnboardingIframe({ initialHash }: { initialHash?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    document.title = "Meet your COB · onboarding";
  }, []);
  const src = "/onboarding-v1.html" + (initialHash ? "#/" + initialHash : "");

  function onLoad() {
    const iframe = ref.current;
    if (!iframe || !iframe.contentDocument) return;
    const doc = iframe.contentDocument;
    // Inject Supabase config for the bridge (same-origin, safe: publishable key).
    const cfg = doc.createElement("script");
    cfg.textContent =
      "window.__SUPABASE_CONFIG__=" +
      JSON.stringify({
        url: import.meta.env.VITE_SUPABASE_URL,
        key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      }) +
      ";";
    doc.head.appendChild(cfg);
    // Load the bridge (module so we can dynamic-import supabase-js from CDN).
    const s = doc.createElement("script");
    s.type = "module";
    s.src = "/onboarding-bridge.js";
    doc.body.appendChild(s);
  }

  return (
    <iframe
      ref={ref}
      src={src}
      onLoad={onLoad}
      title="Chief of Business onboarding"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        border: 0,
        margin: 0,
        padding: 0,
        background: "#FAF8F4",
      }}
      allow="clipboard-read; clipboard-write; microphone"
    />
  );
}
