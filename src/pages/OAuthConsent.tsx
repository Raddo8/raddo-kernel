import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SeoHead } from "@/components/SeoHead";

/**
 * OAuth 2.1 consent screen — wired to the Supabase OAuth Server.
 *
 * Flow:
 *   1. Read `authorization_id` from URL.
 *   2. Require an authenticated user — if missing, bounce to /login with a
 *      `redirect` param so the user returns here after sign-in.
 *   3. Call `supabase.auth.oauth.getAuthorizationDetails(authorization_id)`.
 *      If the AS reports no pending authorization (already consented), follow
 *      its `redirect_url` immediately.
 *   4. Render client name + scopes.
 *   5. Approve / Deny call the matching AS endpoints and follow the returned
 *      `redirect_url` back to the client (e.g. claude.ai).
 *
 * Brand: light-dominant paper surface, Fraunces headline, Inter body,
 * brass CTA. No motion beyond standard button states.
 */

type Decision = "approve" | "deny";

interface AuthDetails {
  authorization_id?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  client?: { name?: string | null; id?: string | null } | null;
  scopes?: string[] | null;
  scope?: string | null;
  redirect_uri?: string | null;
  redirect_url?: string | null;
}

function describeScope(scope: string): string {
  const map: Record<string, string> = {
    openid: "Confirm your identity",
    email: "See your email address",
    profile: "See your basic profile",
    offline_access: "Stay connected when you're not actively using the app",
    "mcp:council": "Convene your COB Council on your behalf",
    "mcp:read": "Read from your COB workspace",
    "mcp:write": "Take actions inside your COB workspace",
  };
  return map[scope] || scope;
}

function normalizeScopes(d: AuthDetails | null): string[] {
  if (!d) return [];
  if (Array.isArray(d.scopes)) return d.scopes.filter(Boolean);
  if (typeof d.scope === "string") return d.scope.split(/[\s,]+/).filter(Boolean);
  return [];
}

function clientLabel(d: AuthDetails | null): string {
  return (
    d?.client_name ||
    d?.client?.name ||
    d?.client_id ||
    d?.client?.id ||
    "An application"
  );
}

export default function OAuthConsent() {
  const authorizationId = useMemo(
    () => new URLSearchParams(window.location.search).get("authorization_id"),
    [],
  );
  const [authDetails, setAuthDetails] = useState<AuthDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!authorizationId) {
        setError(
          "This consent screen was opened without a valid authorization request. Return to the application that initiated sign-in and try again.",
        );
        setLoading(false);
        return;
      }

      // Require an authenticated user before talking to the OAuth server.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const back = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
        window.location.replace(`/login?redirect=${encodeURIComponent(back)}`);
        return;
      }

      try {
        // @ts-ignore — supabase.auth.oauth is part of the OAuth Server preview.
        const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(
          authorizationId,
        );
        if (cancelled) return;
        if (detailsError) throw detailsError;

        const details = (data || {}) as AuthDetails;

        // If the AS reports no pending authorization, the user already
        // consented — follow the redirect_url straight back to the client.
        if (!details.authorization_id && (details.redirect_url || details.redirect_uri)) {
          window.location.assign((details.redirect_url || details.redirect_uri)!);
          return;
        }

        setAuthDetails(details);
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.message ||
              "Could not load the authorization request. It may have expired.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorizationId]);

  async function decide(decision: Decision) {
    if (!authorizationId || submitting) return;
    setSubmitting(decision);
    setError(null);
    try {
      const fn =
        decision === "approve"
          ? // @ts-ignore — OAuth Server preview API.
            supabase.auth.oauth.approveAuthorization
          : // @ts-ignore — OAuth Server preview API.
            supabase.auth.oauth.denyAuthorization;
      const { data, error: decisionError } = await fn(authorizationId);
      if (decisionError) throw decisionError;
      const redirectTo = (data as any)?.redirect_url || (data as any)?.redirect_uri;
      if (!redirectTo) throw new Error("Authorization server did not return a redirect.");
      window.location.assign(redirectTo);
    } catch (err: any) {
      setSubmitting(null);
      setError(err?.message || "Could not record your decision. Try again.");
    }
  }

  const scopes = normalizeScopes(authDetails);
  const label = clientLabel(authDetails);
  const redirectPreview = authDetails?.redirect_uri || authDetails?.redirect_url || null;

  return (
    <>
      <SeoHead
        title="Authorize access · RADDO"
        description="Review the application requesting access to your COB and approve or deny."
        path="/oauth/consent"
      />
      <main className="min-h-screen bg-raddo-paper text-raddo-charcoal flex items-start justify-center px-6 py-16">
        <div className="w-full max-w-lg">
          <p
            className="text-xs uppercase tracking-[0.2em] text-raddo-ash mb-4"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Clarity · Origin · Decision
          </p>
          <h1
            className="text-raddo-ink"
            style={{
              fontFamily: "Fraunces, serif",
              fontWeight: 800,
              fontSize: "2.25rem",
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
            }}
          >
            Authorize access to your COB
          </h1>

          {loading ? (
            <p
              className="mt-6 text-sm text-raddo-ash"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Loading authorization request…
            </p>
          ) : (
            <>
              <p
                className="mt-4 text-base text-raddo-charcoal/85"
                style={{ fontFamily: "Inter, sans-serif", lineHeight: 1.55 }}
              >
                <span className="font-medium text-raddo-ink">{label}</span> is
                requesting permission to connect to your COB workspace.
              </p>

              <section
                className="mt-8 border border-raddo-paper-edge bg-white/70 p-6"
                style={{ borderRadius: 8 }}
              >
                <h2
                  className="text-sm uppercase tracking-[0.18em] text-raddo-ash"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  It will be able to
                </h2>
                {scopes.length === 0 ? (
                  <p
                    className="mt-3 text-sm text-raddo-charcoal/75"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    Confirm your identity. No additional access is requested.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {scopes.map((s) => (
                      <li
                        key={s}
                        className="flex items-start gap-3 text-[15px] text-raddo-charcoal"
                        style={{ fontFamily: "Inter, sans-serif", lineHeight: 1.5 }}
                      >
                        <span
                          aria-hidden
                          className="mt-[10px] inline-block h-[6px] w-[6px] bg-raddo-brass"
                          style={{ borderRadius: 4 }}
                        />
                        <span>
                          <span className="block">{describeScope(s)}</span>
                          <span className="block text-xs text-raddo-ash mt-0.5 font-mono">
                            {s}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {redirectPreview && (
                  <p
                    className="mt-5 pt-4 border-t border-raddo-paper-edge text-xs text-raddo-ash break-all"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    After approval, you will return to{" "}
                    <span className="font-mono text-raddo-charcoal">
                      {safeOrigin(redirectPreview)}
                    </span>
                    .
                  </p>
                )}
              </section>
            </>
          )}

          {error && (
            <p
              role="alert"
              className="mt-6 text-sm text-raddo-brass-deep"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              {error}
            </p>
          )}

          {!loading && authDetails && (
            <div className="mt-8 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
              <Button
                variant="outline"
                disabled={!!submitting}
                onClick={() => decide("deny")}
                className="border-raddo-paper-edge text-raddo-charcoal hover:bg-raddo-paper-edge/40"
                style={{ borderRadius: 8, fontFamily: "Inter, sans-serif" }}
              >
                {submitting === "deny" ? "Declining…" : "Deny"}
              </Button>
              <Button
                disabled={!!submitting}
                onClick={() => decide("approve")}
                className="bg-raddo-brass text-raddo-night hover:bg-raddo-brass-deep hover:text-raddo-paper"
                style={{ borderRadius: 8, fontFamily: "Inter, sans-serif", fontWeight: 600 }}
              >
                {submitting === "approve" ? "Approving…" : "Approve access"}
              </Button>
            </div>
          )}

          <p
            className="mt-10 text-xs text-raddo-ash"
            style={{ fontFamily: "Inter, sans-serif", lineHeight: 1.6 }}
          >
            You can revoke this access at any time from your account settings.
            Approving grants only the permissions listed above.
          </p>
        </div>
      </main>
    </>
  );
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
