import { useEffect, useMemo, useState } from "react";
import { asSupabase as supabase } from "@/integrations/supabase/as-client";
import { Button } from "@/components/ui/button";
import { SeoHead } from "@/components/SeoHead";
import { DossierSplit } from "@/components/dossier/DossierSplit";

/**
 * OAuth 2.1 consent screen — auth-server wiring unchanged.
 * Reskinned to the dossier split composition. All flow logic (session gate,
 * getAuthorizationDetails, approve/deny) is byte-identical to the prior
 * revision.
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

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
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
        title="Connect to COB · Council"
        description="Review the application requesting access to your COB Council and approve or deny."
        path="/oauth/consent"
      />
      <DossierSplit
        wide
        brand={{
          chip: "dossier · authorization",
          headline: "Grant an application",
          keyword: "consent",
          headlineTrail: " to convene your COB.",
          pitch:
            "You control the scopes. Every approval is recorded. Revoke access at any time from your COB account settings.",
        }}
      >
        <p
          className="font-mono uppercase mb-3"
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            color: "hsl(var(--raddo-brass-deep))",
            fontWeight: 700,
          }}
        >
          consent · pending
        </p>
        <h1
          className="font-display text-raddo-ink-deep"
          style={{ fontWeight: 800, fontSize: "1.75rem", lineHeight: 1.15 }}
        >
          Connect to COB · Council
        </h1>

        {loading ? (
          <p className="mt-6 text-sm text-raddo-ash">Loading authorization request…</p>
        ) : (
          <>
            <p
              className="mt-4 text-base text-raddo-charcoal/85"
              style={{ lineHeight: 1.55 }}
            >
              <span className="font-medium text-raddo-ink-deep">{label}</span> is requesting
              permission to convene your COB Council and act on your behalf inside your COB
              workspace.
            </p>

            <section className="mt-8">
              <p
                className="font-mono uppercase mb-4"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  color: "hsl(var(--raddo-brass-deep))",
                  fontWeight: 700,
                }}
              >
                exhibit · scopes requested
              </p>
              {scopes.length === 0 ? (
                <p className="text-sm text-raddo-charcoal/75">
                  Confirm your identity. No additional access is requested.
                </p>
              ) : (
                <ul className="border-t border-raddo-paper-edge">
                  {scopes.map((s, i) => (
                    <li
                      key={s}
                      className="flex items-baseline gap-4 border-b border-raddo-paper-edge py-3"
                    >
                      <span
                        className="font-mono text-raddo-brass-deep min-w-[28px]"
                        style={{
                          fontSize: 10,
                          letterSpacing: "0.18em",
                        }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1">
                        <span className="block text-[15px] text-raddo-ink-deep font-medium">
                          {describeScope(s)}
                        </span>
                        <span className="block mt-0.5 font-mono text-[11px] text-raddo-ash">
                          {s}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {redirectPreview && (
                <p className="mt-5 text-xs text-raddo-ash break-all">
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
          <p role="alert" className="mt-6 text-sm text-raddo-brass-deep">
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
              style={{ borderRadius: 4 }}
            >
              {submitting === "deny" ? "Declining…" : "Deny"}
            </Button>
            <Button
              disabled={!!submitting}
              onClick={() => decide("approve")}
              className="bg-raddo-brass text-raddo-ink-deep hover:bg-raddo-brass-deep hover:text-raddo-paper"
              style={{ borderRadius: 4, fontWeight: 600 }}
            >
              {submitting === "approve" ? "Approving…" : "Approve access"}
            </Button>
          </div>
        )}

        <p className="mt-10 text-xs text-raddo-ash" style={{ lineHeight: 1.6 }}>
          You can revoke this access at any time from your COB account settings. Approving grants
          only the permissions listed above.
        </p>
      </DossierSplit>
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
