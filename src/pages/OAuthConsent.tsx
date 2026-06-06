import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SeoHead } from "@/components/SeoHead";

/**
 * OAuth 2.1 consent screen.
 *
 * The Supabase OAuth Server on project `rnjqpwmzmbnnaonppfkm` delegates the
 * consent UI to this route. It redirects the user-agent here with query
 * params identifying the client, the requested scopes, and a short-lived
 * `consent_token` we hand back to the AS along with the user's decision.
 *
 * Approve / Deny POST `{ consent_token, approved }` to the AS consent
 * endpoint; the AS responds with `{ redirect_to }` pointing back to its
 * `/authorize` flow with the appropriate result encoded.
 *
 * Brand: light-dominant paper surface, Fraunces headline, Inter body,
 * brass CTA. No motion beyond standard button states.
 */

const AS_BASE =
  (import.meta.env.VITE_OAUTH_AS_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://rnjqpwmzmbnnaonppfkm.supabase.co";

const CONSENT_ENDPOINT = `${AS_BASE}/auth/v1/oauth/consent`;

type Decision = "approve" | "deny";

interface ConsentParams {
  consentToken: string | null;
  clientId: string | null;
  clientName: string | null;
  redirectUri: string | null;
  scopes: string[];
}

function readParams(search: string): ConsentParams {
  const q = new URLSearchParams(search);
  const scope = q.get("scope") || q.get("scopes") || "";
  return {
    consentToken:
      q.get("consent_token") ||
      q.get("consent_id") ||
      q.get("request_id") ||
      q.get("ticket"),
    clientId: q.get("client_id"),
    clientName:
      q.get("client_name") ||
      q.get("client") ||
      q.get("app_name") ||
      null,
    redirectUri: q.get("redirect_uri"),
    scopes: scope ? scope.split(/[\s,]+/).filter(Boolean) : [],
  };
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

export default function OAuthConsent() {
  const params = useMemo(() => readParams(window.location.search), []);
  const [submitting, setSubmitting] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guard: if the AS didn't send a consent token there is nothing to do.
  useEffect(() => {
    if (!params.consentToken) {
      setError(
        "This consent screen was opened without a valid authorization request. Return to the application that initiated sign-in and try again.",
      );
    }
  }, [params.consentToken]);

  async function decide(decision: Decision) {
    if (!params.consentToken || submitting) return;
    setSubmitting(decision);
    setError(null);
    try {
      const res = await fetch(CONSENT_ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent_token: params.consentToken,
          approved: decision === "approve",
        }),
      });

      // Prefer JSON `{ redirect_to }`, fall back to Location header, then to
      // the AS's standard authorize endpoint as a last resort.
      let redirectTo: string | null = null;
      const ctype = res.headers.get("content-type") || "";
      if (ctype.includes("application/json")) {
        const json = await res.json().catch(() => null);
        redirectTo =
          json?.redirect_to ||
          json?.redirect_uri ||
          json?.location ||
          null;
        if (!res.ok && !redirectTo) {
          throw new Error(
            json?.error_description || json?.message || `Consent failed (${res.status})`,
          );
        }
      } else if (res.redirected) {
        redirectTo = res.url;
      } else if (!res.ok) {
        throw new Error(`Consent failed (${res.status})`);
      }

      if (redirectTo) {
        window.location.assign(redirectTo);
        return;
      }
      // Hard fallback: bounce back to AS authorize, which will reissue.
      window.location.assign(`${AS_BASE}/auth/v1/authorize`);
    } catch (err: any) {
      setSubmitting(null);
      setError(err?.message || "Could not record your decision. Try again.");
    }
  }

  const clientLabel = params.clientName || params.clientId || "An application";

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
          <p
            className="mt-4 text-base text-raddo-charcoal/85"
            style={{ fontFamily: "Inter, sans-serif", lineHeight: 1.55 }}
          >
            <span className="font-medium text-raddo-ink">{clientLabel}</span>{" "}
            is requesting permission to connect to your COB workspace.
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
            {params.scopes.length === 0 ? (
              <p
                className="mt-3 text-sm text-raddo-charcoal/75"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Confirm your identity. No additional access is requested.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {params.scopes.map((s) => (
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

            {params.redirectUri && (
              <p
                className="mt-5 pt-4 border-t border-raddo-paper-edge text-xs text-raddo-ash break-all"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                After approval, you will return to{" "}
                <span className="font-mono text-raddo-charcoal">
                  {safeOrigin(params.redirectUri)}
                </span>
                .
              </p>
            )}
          </section>

          {error && (
            <p
              role="alert"
              className="mt-6 text-sm text-raddo-brass-deep"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              {error}
            </p>
          )}

          <div className="mt-8 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
            <Button
              variant="outline"
              disabled={!!submitting || !params.consentToken}
              onClick={() => decide("deny")}
              className="border-raddo-paper-edge text-raddo-charcoal hover:bg-raddo-paper-edge/40"
              style={{ borderRadius: 8, fontFamily: "Inter, sans-serif" }}
            >
              {submitting === "deny" ? "Declining…" : "Deny"}
            </Button>
            <Button
              disabled={!!submitting || !params.consentToken}
              onClick={() => decide("approve")}
              className="bg-raddo-brass text-raddo-night hover:bg-raddo-brass-deep hover:text-raddo-paper"
              style={{ borderRadius: 8, fontFamily: "Inter, sans-serif", fontWeight: 600 }}
            >
              {submitting === "approve" ? "Approving…" : "Approve access"}
            </Button>
          </div>

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
