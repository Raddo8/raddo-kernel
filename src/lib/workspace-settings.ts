import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StageProbabilities { [stateName: string]: number }

export const DEFAULT_STAGE_PROBABILITIES: StageProbabilities = {
  signal: 2,
  qualified: 5,
  deepdive: 10,
  meeting_set: 15,
  build_shown: 20,
  proposal: 25,
  agreement: 90,
  onboarding: 100,
};

export interface WorkspaceSettings {
  fiscal_year_start?: number;            // 1..12 (month)
  stage_probabilities?: StageProbabilities;
  vertical_pack?: string;
  purpose?: string;
  [k: string]: unknown;
}

export function stageProbability(
  settings: WorkspaceSettings | null | undefined,
  stateName: string | null | undefined,
): number {
  if (!stateName) return 0;
  const merged = { ...DEFAULT_STAGE_PROBABILITIES, ...(settings?.stage_probabilities || {}) };
  const v = merged[stateName];
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}

export function useWorkspaceSettings(workspaceId: string | null | undefined) {
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    const { data } = await supabase
      .from("workspaces")
      .select("settings")
      .eq("id", workspaceId)
      .maybeSingle();
    setSettings((data?.settings as any) ?? {});
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (patch: Partial<WorkspaceSettings>) => {
    if (!workspaceId) return;
    const next: WorkspaceSettings = { ...(settings || {}), ...patch };
    const { error } = await supabase
      .from("workspaces")
      .update({ settings: next as any })
      .eq("id", workspaceId);
    if (!error) setSettings(next);
    return { error };
  }, [workspaceId, settings]);

  return { settings, loading, save, reload: load };
}
