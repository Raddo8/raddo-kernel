import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TaylorPanel } from "@/components/onboarding/TaylorPanel";

/** UNIT 2 · width reserved for the TAYLOR panel on desks wide enough for it. */
const TAYLOR_PANEL_WIDTH = 360;

function useTaylorPanelVisible() {
  const [visible, setVisible] = useState(
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1100px)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1100px)");
    const onChange = () => setVisible(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return visible;
}


type Identity = { userId: string; email: string | null; cid: string | null };

type Phase =
  | { kind: "resolving" }
  | { kind: "unauthenticated" }
  | { kind: "redirect"; to: string }
  | { kind: "blocked"; status: "REVOKED" | "SUSPENDED" }
  | { kind: "error"; message: string }
  | { kind: "no-record" }
  | { kind: "ready"; identity: Identity; src: string };

/** Bridge hydration budget. Expiry fails CLOSED · it never reveals the frame. */
const HYDRATION_TIMEOUT_MS = 12000;

function Panel({
  overline,
  title,
  body,
  children,
}: {
  overline: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
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
          {overline}
        </p>
        <h1
          className="font-display text-dossier-ink-deep"
          style={{ fontWeight: 800, fontSize: "1.75rem", lineHeight: 1.15 }}
        >
          {title}
        </h1>
        <p className="mt-4 text-sm text-dossier-ash">{body}</p>
        {children}
      </div>
    </main>
  );
}

/**
 * START-0G · Serves public/onboarding-v1.html inside a full-viewport iframe.
 * Authentication is resolved HERE, once, before the legacy surface is mounted:
 * the legacy app is handed an already-authenticated identity, so its own
 * signup / email / password screens are never reachable. Every failure mode
 * fails closed · the legacy surface never mounts unless identity resolved AND
 * the bridge reported hydration.
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
  const location = useLocation();
  const [phase, setPhase] = useState<Phase>({ kind: "resolving" });
  const [hydrated, setHydrated] = useState(false);
  const [hydrationFailed, setHydrationFailed] = useState(false);

  useEffect(() => {
    document.title = "Meet your COB · onboarding";
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolve = async (): Promise<Phase> => {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess.session?.user;
      if (!user) return { kind: "unauthenticated" };

      const { data, error } = await supabase.rpc("resolve_tenant_context", {
        p_session_id: null,
      });
      if (error)
        return {
          kind: "error",
          message:
            "We could not confirm which company your account belongs to. Try again in a moment.",
        };

      const row = Array.isArray(data) ? data[0] : data;
      const status = (row?.out_status as string | undefined) ?? "";
      const cid = (row?.out_cid as string | null | undefined) ?? null;

      switch (status) {
        case "OK":
          break;
        case "AMBIGUOUS":
          return { kind: "redirect", to: "/start/select-workspace" };
        case "REVOKED":
        case "SUSPENDED":
          return { kind: "blocked", status };
        case "CONTEXT_INVALID":
        case "UNAUTHENTICATED":
          return { kind: "unauthenticated" };
        case "NO_MEMBERSHIP":
          break;
        default:
          return {
            kind: "error",
            message:
              "Your account is not in a state we can open onboarding for yet.",
          };
      }

      if (requireRecord) {
        // Tenancy is keyed by CID. user_id only identifies the subject.
        if (!cid) return { kind: "no-record" };
        const { data: rec, error: recErr } = await supabase
          .from("onboarding_tenants")
          .select("identity_state")
          .eq("user_id", user.id)
          .eq("cid", cid)
          .maybeSingle();
        if (recErr)
          return {
            kind: "error",
            message: "We could not read your onboarding record.",
          };
        if (!rec || rec.identity_state !== "BOUND") return { kind: "no-record" };
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

  // Hydration watchdog: transitions ONLY to a blocked state. Never reveals.
  useEffect(() => {
    if (phase.kind !== "ready" || hydrated) return;
    const t = window.setTimeout(() => setHydrationFailed(true), HYDRATION_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [phase.kind, hydrated]);

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
  }, [phase]);

  if (phase.kind === "unauthenticated") {
    return (
      <Navigate
        to={"/signin?next=" + encodeURIComponent(location.pathname + location.search)}
        replace
      />
    );
  }

  if (phase.kind === "redirect") return <Navigate to={phase.to} replace />;

  if (phase.kind === "blocked") {
    return (
      <Panel
        overline="access · not active"
        title="This COB is not active right now"
        body="Access for your account has been paused. If you think that is a mistake, write to cob@chiefofbusiness.ai and we will look into it."
      >
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.assign("/signin");
          }}
          className="mt-6 text-xs uppercase tracking-[0.16em] text-dossier-ash hover:text-dossier-ink-deep"
        >
          Sign out · use a different account
        </button>
      </Panel>
    );
  }

  if (phase.kind === "error") {
    return (
      <Panel overline="onboarding · unavailable" title="We could not open your onboarding" body={phase.message}>
        <Link
          to="/start"
          className="mt-6 inline-block text-xs uppercase tracking-[0.16em] text-dossier-ink-deep underline-offset-4 hover:underline"
        >
          Try again
        </Link>
        <p className="mt-3 text-xs text-dossier-ash">cob@chiefofbusiness.ai</p>
      </Panel>
    );
  }

  if (phase.kind === "no-record") {
    return (
      <Panel
        overline="onboarding · in progress"
        title="Setting up your account"
        body="There is nothing on record for your company yet. Start your onboarding and your progress will appear here."
      >
        <Link
          to="/start"
          className="mt-6 inline-block text-xs uppercase tracking-[0.16em] text-dossier-ink-deep underline-offset-4 hover:underline"
        >
          Begin onboarding
        </Link>
      </Panel>
    );
  }

  if (hydrationFailed && !hydrated) {
    return (
      <Panel
        overline="onboarding · unavailable"
        title="We could not open your onboarding"
        body="Your onboarding surface did not finish loading. Nothing has been lost · your progress is held on our side."
      >
        <Link
          to="/start"
          className="mt-6 inline-block text-xs uppercase tracking-[0.16em] text-dossier-ink-deep underline-offset-4 hover:underline"
        >
          Try again
        </Link>
        <p className="mt-3 text-xs text-dossier-ash">cob@chiefofbusiness.ai</p>
      </Panel>
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
