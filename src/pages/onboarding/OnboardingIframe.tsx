import { useEffect, useRef } from "react";

/**
 * Serves public/onboarding-v1.html verbatim inside a full-viewport iframe.
 * The static HTML uses its own hash router; we forward /onboarding/<sub>
 * paths (e.g. /onboarding/dashboard) into the iframe's hash on load.
 */
export default function OnboardingIframe({ initialHash }: { initialHash?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    document.title = "Meet your COB of Business · onboarding";
  }, []);
  const src = "/onboarding-v1.html" + (initialHash ? "#/" + initialHash : "");
  return (
    <iframe
      ref={ref}
      src={src}
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
