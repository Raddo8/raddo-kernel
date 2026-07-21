import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Serves public/onboarding-v1.html verbatim inside a full-viewport iframe.
 * After the file's own script runs, we inject the parent's supabase client
 * (same-origin) and public/onboarding-bridge.js — never editing the file's bytes.
 */
export default function OnboardingIframe({ initialHash }: { initialHash?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    document.title = "Meet your COB · onboarding";
  }, []);
  const src = "/onboarding-v1.html?v=" + Date.now() + (initialHash ? "#/" + initialHash : "");

  function onLoad() {
    const iframe = ref.current;
    if (!iframe || !iframe.contentWindow || !iframe.contentDocument) return;
    // Same-origin: hand the iframe the already-created supabase client.
    (iframe.contentWindow as any).__SB = supabase;
    const doc = iframe.contentDocument;
    const s = doc.createElement("script");
    s.src = "/onboarding-bridge.js?v=" + Date.now();
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
