// supabase/functions/mcp-council/tool-effects.ts
//
// PKT-0A · Truthful tool-effect catalog.
//
// The MCP `readOnlyHint` annotation is insufficient: two tools currently
// declared read-only emit durable rows. boot_kernel writes boot_log;
// begin_session writes a session row, ritual/usage receipts, and increments
// surfaced_count on every open-loop row it returns.
//
// Purely additive: nothing here changes behaviour.

export const EFFECTS_CATALOG_VERSION = "pkt0a.2";

export type Effect =
  | "identity_read"
  | "canonical_read"
  | "canonical_write"
  | "projection_read"
  | "projection_write"
  | "telemetry_write"
  | "model_invocation"
  | "onboarding_read"
  | "onboarding_write"
  | "config_read"
  | "config_write";

export const DURABLE_EFFECTS: readonly Effect[] = [
  "canonical_write",
  "projection_write",
  "telemetry_write",
  "onboarding_write",
  "config_write",
];

export const TOOL_EFFECTS: Readonly<Record<string, readonly Effect[]>> = Object.freeze({
  boot_kernel: ["identity_read", "telemetry_write"],
  load_kernel_part: ["identity_read", "telemetry_write"],
  begin_session: ["projection_read", "projection_write", "telemetry_write"],
  save_session: ["canonical_read", "canonical_write", "projection_write", "telemetry_write"],
  sync_session: ["canonical_read", "projection_read", "projection_write", "telemetry_write"],
  end_session: ["canonical_read", "canonical_write", "projection_read", "projection_write", "telemetry_write"],
  show_council: ["config_read", "telemetry_write"],
  convene_council: ["model_invocation", "telemetry_write"],
  summon_best_advisor: ["model_invocation", "telemetry_write"],
  abe_weighing_in: ["model_invocation", "telemetry_write"],
  file_to_office: ["model_invocation", "canonical_write", "telemetry_write"],
  welcome_party: ["onboarding_read", "onboarding_write", "telemetry_write"],
  taylor_setup: ["onboarding_read", "onboarding_write", "telemetry_write"],
  record_intake: ["onboarding_write", "telemetry_write"],
  set_chief_name: ["config_write", "onboarding_write", "telemetry_write"],
  setup_progress: ["onboarding_write", "telemetry_write"],
});

export function declaredEffects(tool: string): readonly Effect[] {
  return TOOL_EFFECTS[tool] ?? [];
}

export function isUncatalogued(tool: string): boolean {
  return !(tool in TOOL_EFFECTS);
}

export function declaresDurableWrite(tool: string): boolean {
  return declaredEffects(tool).some((e) => DURABLE_EFFECTS.includes(e));
}

export function undeclaredEffects(
  tool: string,
  observed: readonly Effect[],
): readonly Effect[] {
  const declared = declaredEffects(tool);
  return observed.filter((e) => !declared.includes(e));
}
