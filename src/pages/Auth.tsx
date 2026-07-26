import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DossierSplit, DossierFieldLabel } from "@/components/dossier/DossierSplit";

/**
 * /app auth gate. Auth logic (signIn, signUp, navigate) is unchanged from
 * the prior revision · this pass is a reskin to the dossier split.
 */
export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/control/desk");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DossierSplit
      brand={{
        chip: "dossier · workspace",
        headline: "Sign in to your",
        keyword: "operator",
        headlineTrail: " workspace.",
        pitch:
          "The command surface for your Chief of Business · your queue, your accounts, your policies, all held in one place.",
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
        {isLogin ? "workspace · sign in" : "workspace · create"}
      </p>
      <h1
        className="font-display text-dossier-ink-deep"
        style={{ fontWeight: 800, fontSize: "1.75rem", lineHeight: 1.15 }}
      >
        {isLogin ? "Sign in to your workspace" : "Create your workspace"}
      </h1>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {!isLogin && (
          <div>
            <DossierFieldLabel htmlFor="fullName">Full name</DossierFieldLabel>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="bg-white border-dossier-paper-edge text-dossier-ink-deep"
              style={{ borderRadius: 4 }}
            />
          </div>
        )}
        <div>
          <DossierFieldLabel htmlFor="auth-email">Email</DossierFieldLabel>
          <Input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-white border-dossier-paper-edge text-dossier-ink-deep"
            style={{ borderRadius: 4 }}
          />
        </div>
        <div>
          <DossierFieldLabel htmlFor="auth-password">Password</DossierFieldLabel>
          <Input
            id="auth-password"
            type="password"
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
          {loading ? "…" : isLogin ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-dossier-ash">
        {isLogin ? "No account?" : "Already have an account?"}{" "}
        <button
          onClick={() => setIsLogin(!isLogin)}
          className="text-dossier-ink-deep underline-offset-4 hover:underline"
        >
          {isLogin ? "Sign up" : "Sign in"}
        </button>
      </p>
    </DossierSplit>
  );
}
