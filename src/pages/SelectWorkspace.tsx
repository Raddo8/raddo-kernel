import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Membership {
  cid: string;
  role: string;
  display_name: string | null;
}

/**
 * Placeholder for the ambiguous-membership case. It shows what the subject
 * holds; choosing one binds a session context in a later packet.
 */
export function SelectWorkspace() {
  const [rows, setRows] = useState<Membership[] | null>(null);

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
            cid: r.cid as string,
            role: r.role as string,
            display_name:
              (r as { tenants?: { display_name?: string | null } }).tenants
                ?.display_name ?? null,
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
          workspace · selection
        </p>
        <h1
          className="font-display text-dossier-ink-deep"
          style={{ fontWeight: 800, fontSize: "1.75rem", lineHeight: 1.15 }}
        >
          More than one workspace
        </h1>
        <p className="mt-4 text-sm text-dossier-ash">
          Your account is active in several workspaces. Selecting one is coming
          shortly. Until then, contact cob@chiefofbusiness.ai to be routed.
        </p>

        <ul className="mt-8 space-y-2">
          {rows === null && (
            <li className="text-sm text-dossier-ash">loading…</li>
          )}
          {rows?.map((r) => (
            <li
              key={r.cid}
              className="border border-dossier-paper-edge bg-white px-4 py-3"
              style={{ borderRadius: 4 }}
            >
              <span className="text-dossier-ink-deep text-sm font-medium">
                {r.display_name ?? r.cid}
              </span>
              <span className="ml-2 text-xs text-dossier-ash">{r.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

export default SelectWorkspace;
