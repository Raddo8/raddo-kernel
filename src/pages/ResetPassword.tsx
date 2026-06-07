import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SeoHead } from "@/components/SeoHead";
import { Eye, EyeOff } from "lucide-react";

/**
 * Landing page for Supabase password-recovery links.
 *
 * Supabase delivers the user here with a recovery session already attached
 * (PASSWORD_RECOVERY event). We require them to set a new password before
 * the session becomes usable — otherwise the link would silently sign
 * them in without resetting anything.
 */
export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY on landing from the email link.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Also accept an existing session (page refresh after click).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
    } catch (err: any) {
      setError(err?.message || "Could not update password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SeoHead
        title="Reset password · RADDO"
        description="Set a new password for your COB."
        path="/reset-password"
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
            Set a new password
          </h1>
          <p
            className="mt-4 text-base text-raddo-charcoal/85"
            style={{ fontFamily: "Inter, sans-serif", lineHeight: 1.55 }}
          >
            {done
              ? "Password updated. You can now sign in."
              : "Choose a new password to complete the recovery."}
          </p>

          {done ? (
            <Button
              onClick={() => window.location.assign("/login")}
              className="mt-8 w-full bg-raddo-brass text-raddo-night hover:bg-raddo-brass-deep hover:text-raddo-paper"
              style={{ borderRadius: 8, fontFamily: "Inter, sans-serif", fontWeight: 600 }}
            >
              Continue to sign in
            </Button>
          ) : (
            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <div>
                <label
                  htmlFor="password"
                  className="block text-xs uppercase tracking-[0.18em] text-raddo-ash mb-2"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  New password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
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
                    className="absolute inset-y-0 right-2 my-auto h-7 px-2 flex items-center gap-1 text-xs uppercase tracking-[0.16em] text-raddo-ash hover:text-raddo-ink"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirm"
                  className="block text-xs uppercase tracking-[0.18em] text-raddo-ash mb-2"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  Confirm password
                </label>
                <Input
                  id="confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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

              {!ready && (
                <p
                  className="text-sm text-raddo-ash"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  Verifying recovery link…
                </p>
              )}

              <Button
                type="submit"
                disabled={submitting || !ready}
                className="w-full bg-raddo-brass text-raddo-night hover:bg-raddo-brass-deep hover:text-raddo-paper"
                style={{ borderRadius: 8, fontFamily: "Inter, sans-serif", fontWeight: 600 }}
              >
                {submitting ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
