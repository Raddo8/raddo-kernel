import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Company {
  key: string;
  role: string;
  name: string;
}

/**
 * Shown when one person has access to more than one company. Companies are
 * listed by name · never by an internal identifier.
 */
export function SelectWorkspace() {
  const [rows, setRows] = useState<Company[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("tenant_members")
      .select("cid, role, tenants(display_name)")
      .eq("status", "ACTIVE")
      .then(({ data }) => {
        if (cancelled) return;
        setRows(
          (data ?? []).map((r) => ({
            key: r.cid as string,
            role: r.role as string,
            name:
              (r as { tenants?: { display_name?: string | null } }).tenants
                ?.display_name ?? "Unnamed company",
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-dossier-paper flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <p
          className="font-mono uppercase mb-3"
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            color: "hsl(var(--dossier-brass-deep))",
            fontWeight: 700,
          }}
        >
          choose a company
        </p>
        <h1
          className="font-display text-dossier-ink-deep"
          style={{ fontWeight: 800, fontSize: "1.75rem", lineHeight: 1.15 }}
        >
          You have access to more than one company
        </h1>
        <p className="mt-4 text-sm text-dossier-ash">
          Choosing between them here is coming shortly. In the meantime, write to
          cob@chiefofbusiness.ai and tell us which company you want to open · we
          will point you straight at it.
        </p>

        <ul className="mt-8 space-y-2">
          {rows === null && (
            <li className="text-sm text-dossier-ash">loading…</li>
          )}
          {rows?.map((r) => (
            <li
              key={r.key}
              className="border border-dossier-paper-edge bg-white px-4 py-3"
              style={{ borderRadius: 4 }}
            >
              <span className="text-dossier-ink-deep text-sm font-medium">
                {r.name}
              </span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.assign("/signin");
          }}
          className="mt-8 text-xs uppercase tracking-[0.16em] text-dossier-ash hover:text-dossier-ink-deep"
        >
          Sign out · use a different account
        </button>
      </div>
    </main>
  );
}

export default SelectWorkspace;
