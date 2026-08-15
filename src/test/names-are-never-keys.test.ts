/** HARDEN-10 · K1 · the build guard for P-A.3.
 *
 * A rule with no enforcement is a comment. This test asks the live database
 * which functions still resolve a tenant by display_name and fails on any
 * function outside the named allowlist. Presentation reads are fine: they
 * happen AFTER the cid is resolved, so they never match the resolution shape
 * the audit looks for (a display_name on the left of a lookup predicate).
 */
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

describe("names are never keys", () => {
  it("no database function resolves a tenant from display_name", async () => {
    if (!url || !key) {
      throw new Error(
        "The guard cannot run without backend credentials. A guard that silently skips is not a guard.",
      );
    }
    const supabase = createClient(url, key);
    const { data, error } = await supabase.rpc("guard_names_are_never_keys");

    expect(error, error?.message).toBeNull();

    const violations = (data ?? []) as Array<{ fn_name: string; evidence: string }>;
    expect(
      violations.map((v) => `${v.fn_name}: ${v.evidence?.trim()}`),
      "These functions look a tenant up by display name. Re-key them through public.current_cid() or an explicit cid argument, or add them to public.display_name_allowlist with the reason the name is only being shown.",
    ).toEqual([]);
  }, 20_000);
});
