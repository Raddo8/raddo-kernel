import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SeoHead } from "@/components/SeoHead";

/**
 * Dedicated sign-in surface for the OAuth 2.1 authorization flow.
 *
 * The Supabase OAuth Server requires the user to be authenticated before the
 * consent screen can call `getAuthorizationDetails` / `approveAuthorization`.
 * This page is the minimal email+password gate that returns the user back to
 * the `redirect` query param (typically /oauth/consent?authorization_id=...).
 *
 * Brand: light-dominant paper surface, Fraunces headline, Inter body,
 * brass CTA. Matches /oauth/consent.
 */
export default function OAuthLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  // Preserve the entire redirect target (may contain its own ? and &).
  const redirect = params.get("redirect") || "/oauth/consent";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      window.location.assign(redirect);
    } catch (err: any) {
      setSubmitting(false);
      setError(err?.message || "Sign-in failed. Check your credentials.");
    }
  }

  return (
    <>
      <SeoHead
        title="Sign in · RADDO"
        description="Sign in to authorize an application to access your COB."
        path="/login"
      />
      <main className="min-h-screen bg-raddo-paper text-raddo-charcoal flex items-start justify-center px-6 py-16">
        <div className="w-full max-w-sm">
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
            Sign in to continue
          </h1>
          <p
            className="mt-4 text-base text-raddo-charcoal/85"
            style={{ fontFamily: "Inter, sans-serif", lineHeight: 1.55 }}
          >
            Authenticate to review the access an application is requesting.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs uppercase tracking-[0.18em] text-raddo-ash mb-2"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white border-raddo-paper-edge text-raddo-ink"
                style={{ fontFamily: "Inter, sans-serif", borderRadius: 8 }}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs uppercase tracking-[0.18em] text-raddo-ash mb-2"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white border-raddo-paper-edge text-raddo-ink"
                style={{ fontFamily: "Inter, sans-serif", borderRadius: 8 }}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="text-sm text-raddo-brass-deep"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-raddo-brass text-raddo-night hover:bg-raddo-brass-deep hover:text-raddo-paper"
              style={{ borderRadius: 8, fontFamily: "Inter, sans-serif", fontWeight: 600 }}
            >
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </main>
    </>
  );
}
