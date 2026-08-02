/** HQ-NEXT v0.1 · allowlisted projections. If a field is not here, it is not sent.
 * v0.1 correction: Arsenal and Receipts each carry a FLEET projection (operator)
 * and a TENANT-SAFE projection (client). The split is implemented as types, not prose. */
export interface SkillRowFleet {
  name: string; version: string; category: string; status: 'active'|'retired';
  distribution_status: 'QUARANTINED'|'RECOVERING'|'SERVABLE'|'RETIRED'|'VERSION_UNRESOLVED';
  version_state: string|null; sha256_prefix: string|null; bytes: number|null;
  hq_holds_body: boolean; observed_at: string|null;
}
/** What a client may see about skills: their permitted set, no fleet internals. */
export interface SkillRowTenant { name: string; version: string; category: string; enabled: boolean }
export interface AdvisorRow { id: string; name: string; lens: string; seated: boolean }
export interface ToolRowFleet { tool_key: string; family: string; circuit: string|null; status: string; verified_at: string|null; verified_how: string|null }
export interface ToolRowTenant { tool_key: string; family: string; available: boolean }
export interface ReceiptRowFleet { id: string; kind: string; cid: string; tenant: string; status: string; layers_failed: number; created_at: string }
/** A client sees only its own receipts, and no other tenant's name ever appears. */
export interface ReceiptRowTenant { id: string; kind: string; status: string; created_at: string }
export interface KernelPartRow { part: string; seq: number; bytes: number; sha256_prefix: string; hash_match: boolean }
export interface PulseRow {
  cid: string; tenant: string; cob_name: string|null; kernel_version: number|null; kernel_sealed: boolean;
  parts_verified: number; parts_total: number; failed_parts: string[];
  last_boot_at: string|null; last_checkpoint_at: string|null; last_checkpoint_kind: string|null;
  open_session_count: number; unclosed_prior_sessions: number; staleness: string[];
  token_version: string|null; tool_manifest_version: string|null;
}
export interface MemoryRow {
  id: string; category: string; title: string; body_length: number;
  session_id: string|null; mirrored_to_notion: boolean; superseded_by: string|null; created_at: string;
}
export interface OfficeSurfaceRow {
  surface_key: string; label: string; kind: string; notion_id_present: boolean; write_policy: string;
  row_count: number|null; last_entry_at: string|null; postgres_table: string|null; status: string;
}
