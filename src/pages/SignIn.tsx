import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DossierSplit, DossierFieldLabel } from "@/components/dossier/DossierSplit";

type SsoProvider = "google" | "azure";

const SSO_LABEL: Record<SsoProvider, string> = {
  google: "Google",
  azure: "Microsoft",
};

/**
 * The single front door. Password sign-in and SSO both land on /signin/landing,
 * which decides between the operator zone (/control) and the client zone (/hq).
 */
export function SignIn({ nextPath }: { nextPath?: string } = {}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const landing = nextPath
    ? `/signin/landing?next=${encodeURIComponent(nextPath)}`
    : "/signin/landing";

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

  const handleSso = async (provider: SsoProvider) => {
    // Google routes through Lovable Cloud's app-domain broker (/~oauth/*), so the
    // consent screen names our domain rather than the backend project host.
    if (provider === "google") {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + landing,
      });
      if (result.error) {
        const msg = result.error.message ?? "";
        const disabled = /provider is not enabled|unsupported provider/i.test(msg);
        toast.error(disabled ? "Google sign-in isn't switched on yet." : msg || "Google sign-in failed");
        return;
      }
      if (result.redirected) return;
      navigate(landing);
      return;
    }


    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + landing },
    });
    if (error) {
      // Provider not enabled on the backend · tell the operator plainly.
      const disabled = /provider is not enabled|unsupported provider/i.test(error.message);
      toast.error(
        disabled
          ? `${SSO_LABEL[provider]} sign-in isn't switched on yet.`
          : error.message,
      );
    }
  };



  return (
    <DossierSplit
      brand={{
        chip: "dossier · sign in",
        headline: "Sign in to your",
        keyword: "operator",
        headlineTrail: " workspace.",
        pitch:
          "One door · your queue, your accounts, your policies, all held in one place.",
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
        workspace · sign in
      </p>
      <h1
        className="font-display text-dossier-ink-deep"
        style={{ fontWeight: 800, fontSize: "1.75rem", lineHeight: 1.15 }}
      >
        Sign in
      </h1>

      <div className="mt-8 space-y-3">
        {(["google", "azure"] as const).map((p) => (
          <Button
            key={p}
            type="button"
            variant="outline"
            onClick={() => handleSso(p)}
            className="w-full border-dossier-paper-edge bg-white text-dossier-ink-deep hover:bg-dossier-paper"
            style={{ borderRadius: 4, fontWeight: 500 }}
          >
            Continue with {SSO_LABEL[p]}
          </Button>
        ))}
      </div>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-dossier-paper-edge" />
        <span
          className="font-mono uppercase text-dossier-ash"
          style={{ fontSize: 9, letterSpacing: "0.22em" }}
        >
          or
        </span>
        <span className="h-px flex-1 bg-dossier-paper-edge" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
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
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="bg-white border-dossier-paper-edge text-dossier-ink-deep"
            style={{ borderRadius: 4 }}
          />
        </div>
        <Button
          type="submit"
          className="w-full bg-dossier-brass text-dossier-ink-deep hover:bg-dossier-brass-deep hover:text-dossier-paper"
          style={{ borderRadius: 4, fontWeight: 600 }}
          disabled={loading}
        >
          {loading ? "…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-dossier-ash">
        <Link
          to="/signin/reset"
          className="text-dossier-ink-deep underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
      </p>
    </DossierSplit>
  );
}

export default SignIn;
