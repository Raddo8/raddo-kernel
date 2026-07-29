import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DossierSplit, DossierFieldLabel } from "@/components/dossier/DossierSplit";

/**
 * The single front door, written for clients. Password sign-in and Google both
 * land on /signin/landing, which decides where the person belongs. The routing
 * authority itself is unchanged · this surface is presentation only.
 */
export function SignIn({ nextPath }: { nextPath?: string } = {}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const navigate = useNavigate();

  const landing = nextPath
    ? `/signin/landing?next=${encodeURIComponent(nextPath)}`
    : "/signin/landing";

  // Surface an existing session so nobody gets trapped on the wrong account.
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSignedInAs(data.session?.user?.email ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSignedInAs(null);
    toast.success("Signed out · you can sign in with a different account.");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate(landing);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    // Google routes through the app-domain broker (/~oauth/*), so the consent
    // screen names our domain rather than the backend project host.
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + landing,
      extraParams: { prompt: "select_account" },
    });
    if (result.error) {
      const msg = result.error.message ?? "";
      const disabled = /provider is not enabled|unsupported provider/i.test(msg);
      toast.error(
        disabled ? "Google sign-in isn't switched on yet." : msg || "Google sign-in failed",
      );
      return;
    }
    if (result.redirected) return;
    navigate(landing);
  };

  return (
    <DossierSplit
      brand={{
        chip: "dossier · sign in",
        headline: "Sign in to your",
        keyword: "COB",
        headlineTrail: ".",
        pitch:
          "Your Chief of Business is waiting · your briefings, your decisions, your follow-ups, all held in one place.",
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
        client · sign in
      </p>
      <h1
        className="font-display text-dossier-ink-deep"
        style={{ fontWeight: 800, fontSize: "1.75rem", lineHeight: 1.15 }}
      >
        Sign in to your COB
      </h1>
      <p
        className="mt-3 font-sans text-dossier-charcoal/85"
        style={{ fontSize: 15, lineHeight: 1.55 }}
      >
        Your Chief of Business is waiting. Sign in with the account you were invited
        with.
      </p>

      {signedInAs && (
        <div
          className="mt-6 border border-dossier-paper-edge bg-white px-4 py-3"
          style={{ borderRadius: 4 }}
        >
          <p className="text-sm text-dossier-charcoal">
            You are already signed in as{" "}
            <span className="font-medium text-dossier-ink-deep">{signedInAs}</span>.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => navigate(landing)}
              className="bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
              style={{ borderRadius: 4, fontWeight: 600 }}
            >
              Continue
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSignOut}
              className="border-dossier-paper-edge bg-white text-dossier-ink-deep hover:bg-dossier-paper"
              style={{ borderRadius: 4, fontWeight: 500 }}
            >
              Use a different account
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8">
        <Button
          type="button"
          onClick={handleGoogle}
          className="w-full bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600, height: 48, fontSize: 15 }}
        >
          Continue with Google
        </Button>
        <p className="mt-2 text-xs text-dossier-ash">
          The usual way in. Use the Google account your invitation was sent to.
        </p>
        <p className="mt-1 text-xs text-dossier-ash">
          A Google account is required during this pilot.
        </p>
      </div>

      <div className="my-8 flex items-center gap-3">
        <span className="h-px flex-1 bg-dossier-paper-edge" />
        <span
          className="font-mono uppercase text-dossier-ash"
          style={{ fontSize: 9, letterSpacing: "0.22em" }}
        >
          or
        </span>
        <span className="h-px flex-1 bg-dossier-paper-edge" />
      </div>

      <details className="group">
        <summary
          className="cursor-pointer list-none font-mono uppercase text-dossier-ash hover:text-dossier-ink-deep"
          style={{ fontSize: 10, letterSpacing: "0.18em" }}
        >
          Sign in with email and password
        </summary>
        <p className="mt-2 text-xs text-dossier-ash">
          For invited accounts that were set up with a password.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div>
            <DossierFieldLabel htmlFor="signin-email">Email</DossierFieldLabel>
            <Input
              id="signin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-white border-dossier-paper-edge text-dossier-ink-deep"
              style={{ borderRadius: 4 }}
            />
          </div>
          <div>
            <DossierFieldLabel htmlFor="signin-password">Password</DossierFieldLabel>
            <Input
              id="signin-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="bg-white border-dossier-paper-edge text-dossier-ink-deep"
              style={{ borderRadius: 4 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              className="mt-2 text-xs uppercase tracking-[0.16em] text-dossier-ash hover:text-dossier-ink-deep"
            >
              {showPassword ? "Hide password" : "Show password"}
            </button>
          </div>
          <Button
            type="submit"
            variant="outline"
            className="w-full border-dossier-paper-edge bg-white text-dossier-ink-deep hover:bg-dossier-paper"
            style={{ borderRadius: 4, fontWeight: 500 }}
            disabled={loading}
          >
            {loading ? "…" : "Sign in with password"}
          </Button>
        </form>
      </details>

      <div className="mt-8 flex flex-col items-center gap-3 text-sm text-dossier-ash">
        <Link
          to="/signin/reset"
          className="text-dossier-ink-deep underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
        {!signedInAs && (
          <button
            type="button"
            onClick={handleSignOut}
            className="text-xs uppercase tracking-[0.16em] text-dossier-ash hover:text-dossier-ink-deep"
          >
            Use a different Google account
          </button>
        )}
        <p className="text-xs">
          Trouble getting in? Write to cob@chiefofbusiness.ai
        </p>
      </div>
    </DossierSplit>
  );
}

export default SignIn;
