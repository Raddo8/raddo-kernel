import { useState } from "react";
import { asSupabase as supabase } from "@/integrations/supabase/as-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SeoHead } from "@/components/SeoHead";
import { Eye, EyeOff } from "lucide-react";
import { DossierSplit, DossierFieldLabel } from "@/components/dossier/DossierSplit";

/**
 * Dedicated sign-in surface for the OAuth 2.1 authorization flow.
 * Auth logic (session, redirect param, reset flow) is unchanged from prior
 * revision · this pass is a reskin to the dossier split composition.
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
        title="Sign in · Chief of Business"
        description="Sign in to authorize an application to access your COB."
        path="/login"
      />
      <DossierSplit
        brand={{
          chip: "dossier · sign in",
          headline: "Authenticate to review the",
          keyword: "access",
          headlineTrail: " an application is requesting.",
          pitch:
            "Every authorization is recorded. You approve the exact scopes, and you can revoke access at any time from your account settings.",
        }}
      >
        <p
          className="font-mono uppercase mb-3"
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            color: "hsl(var(--dossier-brass-deep))",
            fontWeight: 700,
          }}
        >
          sign in
        </p>
        <h1
          className="font-display text-dossier-ink-deep"
          style={{ fontWeight: 800, fontSize: "1.75rem", lineHeight: 1.15 }}
        >
          Continue to consent
        </h1>
        <p
          className="mt-3 font-sans text-dossier-charcoal/85"
          style={{ fontSize: 15, lineHeight: 1.55 }}
        >
          Sign in with your COB account to review the application.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div>
            <DossierFieldLabel htmlFor="email">Email</DossierFieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-white border-dossier-paper-edge text-dossier-ink-deep"
              style={{ fontFamily: "Inter, sans-serif", borderRadius: 4 }}
            />
          </div>

          <div>
            <DossierFieldLabel htmlFor="password">Password</DossierFieldLabel>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white border-dossier-paper-edge text-dossier-ink-deep pr-16"
                style={{ fontFamily: "Inter, sans-serif", borderRadius: 4 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-2 my-auto h-7 px-2 flex items-center gap-1 text-xs uppercase tracking-[0.16em] text-dossier-ash hover:text-dossier-ink-deep"
              >
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="flex justify-end -mt-2">
            <button
              type="button"
              onClick={onForgotPassword}
              disabled={resetting}
              className="text-xs uppercase tracking-[0.16em] text-dossier-ash hover:text-dossier-ink-deep disabled:opacity-60"
            >
              {resetting ? "Sending…" : "Forgot password?"}
            </button>
          </div>

          {error && (
            <p role="alert" className="text-sm text-dossier-brass-deep">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-dossier-ink-deep">
              {notice}
            </p>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
            style={{ borderRadius: 4, fontWeight: 600 }}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </DossierSplit>
    </>
  );
}
