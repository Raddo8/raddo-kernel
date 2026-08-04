import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DossierSplit, DossierFieldLabel } from "@/components/dossier/DossierSplit";

/**
 * UNIT 4 · the entry path. Hero to sign up to /start.
 *
 * Google is live. Microsoft is built here but feature-flagged off until the
 * operator adds the provider credentials · the button never lies about being
 * available, so nobody presses into a dead end.
 */
const MICROSOFT_ENABLED = false;

export function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  const handleGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/signin/landing?next=%2Fstart",
      extraParams: { prompt: "select_account" },
    });
    if (result.error) {
      const msg = result.error.message ?? "";
      const disabled = /provider is not enabled|unsupported provider/i.test(msg);
      toast.error(disabled ? "Google sign-up isn't switched on yet." : msg || "Google sign-up failed");
      return;
    }
    if (result.redirected) return;
    navigate("/start");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/start` },
      });
      if (error) throw error;
      if (data.session) {
        navigate("/start");
        return;
      }
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DossierSplit
      brand={{
        chip: "dossier · start",
        headline: "Meet your",
        keyword: "COB",
        headlineTrail: ".",
        pitch:
          "Twenty minutes of your world, in your words. Your Chief of Business is built from it.",
      }}
    >
      <p
        className="font-mono uppercase mb-3"
        style={{ fontSize: 10, letterSpacing: "0.22em", color: "hsl(var(--dossier-brass-deep))", fontWeight: 700 }}
      >
        client · create your account
      </p>
      <h1 className="font-display text-dossier-ink-deep" style={{ fontWeight: 800, fontSize: "1.75rem", lineHeight: 1.15 }}>
        Start with your COB
      </h1>
      <p className="mt-3 font-sans text-dossier-charcoal/85" style={{ fontSize: 15, lineHeight: 1.55 }}>
        Create your account and you land straight in your onboarding.
      </p>

      {sent ? (
        <div className="mt-8 border border-dossier-paper-edge bg-white px-4 py-4" style={{ borderRadius: 4 }}>
          <p className="text-sm text-dossier-charcoal">
            Check your email to confirm your address. The link brings you back here and opens your onboarding.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-8 space-y-3">
            <Button
              type="button"
              onClick={handleGoogle}
              className="w-full bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
              style={{ borderRadius: 4, fontWeight: 600, height: 48, fontSize: 15 }}
            >
              Continue with Google
            </Button>
            <Button
              type="button"
              disabled={!MICROSOFT_ENABLED}
              onClick={() => toast.message("Microsoft sign-in opens shortly. Use Google or email for now.")}
              variant="outline"
              className="w-full border-dossier-paper-edge bg-white text-dossier-ink-deep"
              style={{ borderRadius: 4, fontWeight: 500, height: 48, fontSize: 15 }}
            >
              Continue with Microsoft
            </Button>
            {!MICROSOFT_ENABLED && (
              <p className="text-xs text-dossier-ash">Microsoft opens shortly. Google and email are live today.</p>
            )}
          </div>

          <div className="my-8 flex items-center gap-3">
            <span className="h-px flex-1 bg-dossier-paper-edge" />
            <span className="font-mono uppercase text-dossier-ash" style={{ fontSize: 9, letterSpacing: "0.22em" }}>
              or
            </span>
            <span className="h-px flex-1 bg-dossier-paper-edge" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <DossierFieldLabel htmlFor="signup-email">Email</DossierFieldLabel>
              <Input
                id="signup-email"
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
              <DossierFieldLabel htmlFor="signup-password">Password</DossierFieldLabel>
              <Input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="bg-white border-dossier-paper-edge text-dossier-ink-deep"
                style={{ borderRadius: 4 }}
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={loading}
              className="w-full border-dossier-paper-edge bg-white text-dossier-ink-deep hover:bg-dossier-paper"
              style={{ borderRadius: 4, fontWeight: 500 }}
            >
              {loading ? "…" : "Create account"}
            </Button>
          </form>
        </>
      )}

      <div className="mt-8 flex flex-col items-center gap-2 text-sm text-dossier-ash">
        <Link to="/signin" className="text-dossier-ink-deep underline-offset-4 hover:underline">
          Already have an account? Sign in
        </Link>
        <p className="text-xs">Given an access code? It still works at /start.</p>
      </div>
    </DossierSplit>
  );
}

export default SignUp;
