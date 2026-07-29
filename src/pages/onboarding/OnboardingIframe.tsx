import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type Identity = { userId: string; email: string | null; cid: string | null };

type Phase =
  | { kind: "resolving" }
  | { kind: "no-record" }
  | { kind: "ready"; identity: Identity; src: string };

/**
 * START-0G · Serves public/onboarding-v1.html inside a full-viewport iframe.
 * Authentication is resolved HERE, once, before the legacy surface is mounted:
 * the legacy app is handed an already-authenticated identity, so its own
 * signup / email / password screens are never reachable.
 */
export default function OnboardingIframe({
  initialHash,
  requireRecord = false,
}: {
  initialHash?: string;
  /** /start/progress must read server truth, never a stale browser step count. */
  requireRecord?: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "resolving" });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    document.title = "Meet your COB · onboarding";
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolve = async (): Promise<Phase> => {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess.session?.user;
      if (!user) return { kind: "resolving" };

      let cid: string | null = null;
      const { data, error } = await supabase.rpc("resolve_tenant_context", {
        p_session_id: null,
      });
      if (!error) {
        const row = Array.isArray(data) ? data[0] : data;
        cid = (row?.out_cid as string | null | undefined) ?? null;
      }

      if (requireRecord) {
        const { data: rec } = await supabase
          .from("onboarding_state")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!rec) return { kind: "no-record" };
      }

      // Hash is embedded in the initial src so the legacy app opens directly on
      // the intended internal route · no auth screen is ever pushed to history.
      const src =
        "/onboarding-v1.html?v=" +
        Date.now() +
        (cid ? "&cid=" + encodeURIComponent(cid) : "") +
        (initialHash ? "#/" + initialHash : "");

      return {
        kind: "ready",
        identity: { userId: user.id, email: user.email ?? null, cid },
        src,
      };
    };

    void resolve().then((p) => {
      if (!cancelled) setPhase(p);
    });
    return () => {
      cancelled = true;
    };
  }, [initialHash, requireRecord]);

  const onLoad = useCallback(() => {
    const iframe = ref.current;
    if (!iframe || !iframe.contentWindow || !iframe.contentDocument) return;
    if (phase.kind !== "ready") return;

    // Same-origin: hand the iframe the already-created client and the resolved
    // identity, so the legacy app treats the person as signed in from frame one.
    const w = iframe.contentWindow as unknown as Record<string, unknown>;
    w.__SB = supabase;
    w.__COB_IDENTITY = phase.identity;

    (window as unknown as Record<string, unknown>).__COB_ONBOARDING_READY = () =>
      setHydrated(true);

    const doc = iframe.contentDocument;
    const s = doc.createElement("script");
    s.src = "/onboarding-bridge.js?v=" + Date.now();
    doc.body.appendChild(s);

    // Failsafe: never strand the client behind the loading state.
    window.setTimeout(() => setHydrated(true), 6000);
  }, [phase]);

  if (phase.kind === "no-record") {
    return (
      <main className="min-h-screen bg-dossier-paper flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p
            className="font-mono uppercase mb-3"
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              color: "hsl(var(--dossier-brass-deep))",
              fontWeight: 700,
            }}
          >
            onboarding · in progress
          </p>
          <h1
            className="font-display text-dossier-ink-deep"
            style={{ fontWeight: 800, fontSize: "1.75rem", lineHeight: 1.15 }}
          >
            Setting up your account
          </h1>
          <p className="mt-4 text-sm text-dossier-ash">
            There is nothing on record for your company yet. Start your onboarding and
            your progress will appear here.
          </p>
          <Link
            to="/start"
            className="mt-6 inline-block text-xs uppercase tracking-[0.16em] text-dossier-ink-deep underline-offset-4 hover:underline"
          >
            Begin onboarding
          </Link>
        </div>
      </main>
    );
  }

  return (
    <>
      {(phase.kind !== "ready" || !hydrated) && (
        <main
          className="bg-dossier-paper flex items-center justify-center"
          style={{ position: "fixed", inset: 0, zIndex: 2 }}
        >
          <p
            className="font-mono uppercase text-dossier-ash"
            style={{ fontSize: 10, letterSpacing: "0.22em" }}
          >
            opening your onboarding…
          </p>
        </main>
      )}
      {phase.kind === "ready" && (
        <iframe
          ref={ref}
          src={phase.src}
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
            visibility: hydrated ? "visible" : "hidden",
          }}
          allow="clipboard-read; clipboard-write; microphone"
        />
      )}
    </>
  );
}
