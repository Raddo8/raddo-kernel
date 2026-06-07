import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SeoHead } from "@/components/SeoHead";
import { Eye, EyeOff } from "lucide-react";

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
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  // Preserve the entire redirect target (may contain its own ? and &).
  const redirect = params.get("redirect") || "/oauth/consent";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
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

  async function onForgotPassword() {
    setError(null);
    setNotice(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email above, then choose Forgot password.");
      return;
    }
    setResetting(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setNotice("If that email exists, a reset link is on its way.");
    } catch (err: any) {
      setError(err?.message || "Could not send reset email.");
    } finally {
      setResetting(false);
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
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white border-raddo-paper-edge text-raddo-ink pr-16"
                  style={{ fontFamily: "Inter, sans-serif", borderRadius: 8 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-2 my-auto h-7 px-2 flex items-center gap-1 text-xs uppercase tracking-[0.16em] text-raddo-ash hover:text-raddo-ink"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="flex justify-end -mt-1">
              <button
                type="button"
                onClick={onForgotPassword}
                disabled={resetting}
                className="text-xs uppercase tracking-[0.16em] text-raddo-ash hover:text-raddo-ink disabled:opacity-60"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                {resetting ? "Sending…" : "Forgot password?"}
              </button>
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

            {notice && (
              <p
                role="status"
                className="text-sm text-raddo-ink"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                {notice}
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
