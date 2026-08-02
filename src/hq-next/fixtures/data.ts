/** FIXTURE SNAPSHOTS — real production reads, frozen at their TRUE capture times.
 * These age and go STALE by design. Deleted at LIVE_CONNECTED. */
import type { SkillRowFleet, AdvisorRow, ToolRowFleet, KernelPartRow, PulseRow, MemoryRow, OfficeSurfaceRow, ReceiptRowFleet } from '../contracts/registers';
export const CAPTURED = {
  pulse: '2026-08-01T15:48:37Z', kernel: '2026-08-01T15:48:37Z', tools: '2026-08-01T16:05:00Z',
  skills: '2026-08-01T18:30:00Z', memory: '2026-08-01T19:12:00Z', office: '2026-08-01T19:12:00Z',
  advisors: '2026-08-01T19:20:00Z', receipts: '2026-08-02T04:30:00Z',
} as const;
const S = (name: string, version: string, category: string, status: 'active'|'retired', d: SkillRowFleet['distribution_status'], vs: string, sha: string, bytes: number): SkillRowFleet =>
  ({ name, version, category, status, distribution_status: d, version_state: vs || null, sha256_prefix: sha || null, bytes: bytes || null, hq_holds_body: bytes > 0, observed_at: bytes > 0 ? CAPTURED.skills : null });
export const SKILLS: SkillRowFleet[] = [
  S('begin','1.8.0','ritual','active','SERVABLE','VERSION_MATCH','88d1ac2a9790ee37',61364),
  S('sync','1.4.3','ritual','active','SERVABLE','VERSION_MATCH','829864e86ef3f772',31723),
  S('end','1.4.3','ritual','active','SERVABLE','VERSION_MATCH','0c0e605cbf6848d7',30051),
  S('save','1.4.0','ritual','active','SERVABLE','VERSION_MATCH','9d1d3f538d039b86',22617),
  S('taylor','2.1.0','ops','active','SERVABLE','VERSION_MATCH','361b9b460e9ec1f5',18577),
  S('morning','0.1.0','ritual','active','SERVABLE','NO_STAMP_HQ_ASSIGNED','f4c03443f4b3f3a7',14524),
  S('help','0.1.0','ritual','active','SERVABLE','VERSION_HQ_RULED','f77af679c1c4a4ae',13421),
  S('council','0.1.0','ritual','active','SERVABLE','NO_STAMP_HQ_ASSIGNED','9dba1c2ec4c21032',5666),
  S('fleet','1.2.1','ops','active','QUARANTINED','VERSION_MATCH','35279ee9f0f646b4',0),
  S('loops','1.1.0','ops','active','QUARANTINED','VERSION_MATCH','819c46151536a956',0),
  S('masterplan','1.1.0','ops','active','QUARANTINED','VERSION_MATCH','ea03f8b7502d927f',0),
  S('intelligence-system-build','1.0.0','build-protocol','active','QUARANTINED','VERSION_MATCH','cfa9b834f1be1ee2',0),
  S('premium-build-standard','1.0.0','build-protocol','active','QUARANTINED','VERSION_MATCH','70c55c5fb9becbed',0),
  ...['agent-build-protocol','algorithmic-art','brand-capture','buddy-packet-craft','burnham-session-flow','canvas-design','company','create-a-build','deepdive','doc-coauthoring','docx','floatie-domain','format','foundry-architecture-doctrine','industry','internal-comms','lead-engine','market','mcp-builder','notion-build-protocol','opportunity-map','pdf','person','pptx','publish-build','raddo-build-protocol','session-start-hook','skill-creator','theme-factory','toolkit','web-artifacts-builder','xlsx']
    .map(n => S(n,'unversioned','misc','active','VERSION_UNRESOLVED','NO_STAMP_FAITHFUL','\u2014',0)),
  S('brahan-build-protocol','unversioned','build-protocol','active','VERSION_UNRESOLVED','NOT_INSTALLED','\u2014',0),
  ...Array.from({length: 9}, (_, i) => S(`onyx-${i+1}`,'1.x','onboarding','retired','RETIRED','VERSION_MATCH','\u2014',0)),
];
export const ADVISORS: AdvisorRow[] = [
  { id:'council', name:'The Council', lens:'Multi-domain board deliberation', seated:true },
  { id:'knox', name:'Knox', lens:'Legal & risk intelligence', seated:true },
  { id:'lucius', name:'Lucius', lens:'Finance & buildability counsel', seated:true },
  { id:'leo', name:'Leo', lens:'Operations, sequencing & execution', seated:true },
  { id:'alfred', name:'Alfred', lens:'Continuity, trust & reputation counsel', seated:true },
  { id:'marcus', name:'Marcus', lens:'People & principal elevation counsel', seated:true },
  { id:'felix', name:'Felix', lens:'Growth & revenue architect', seated:true },
  { id:'aims', name:'Aims', lens:'Vision & strategy advisor', seated:true },
  { id:'abe', name:'Abe', lens:'Loyal dissent and falsification', seated:true },
];
export const TOOLS: ToolRowFleet[] = [
  { tool_key:'boot_kernel', family:'kernel', circuit:'C1', status:'live', verified_at:'2026-08-01T15:48:00Z', verified_how:'own probe · 8/8 hash-matched' },
  { tool_key:'load_kernel_part', family:'kernel', circuit:'C1', status:'live', verified_at:'2026-07-31T21:50:00Z', verified_how:'own probe' },
  { tool_key:'begin_session', family:'ritual', circuit:'P8', status:'live', verified_at:'2026-08-01T15:48:00Z', verified_how:'own probe' },
  { tool_key:'save_session', family:'ritual', circuit:'P8', status:'live', verified_at:'2026-08-02T04:30:00Z', verified_how:'own save · receipt 1a10ea17' },
  { tool_key:'sync_session', family:'ritual', circuit:'P8', status:'live', verified_at:'2026-07-31T21:50:00Z', verified_how:'own probe' },
  { tool_key:'end_session', family:'ritual', circuit:'P8', status:'live', verified_at:null, verified_how:null },
  { tool_key:'convene_council', family:'council', circuit:'C2', status:'live', verified_at:'2026-07-31T21:51:00Z', verified_how:'acceptance run' },
  { tool_key:'summon_best_advisor', family:'council', circuit:'C2', status:'live', verified_at:null, verified_how:null },
  { tool_key:'show_council', family:'council', circuit:'C2', status:'live', verified_at:'2026-08-01T19:20:00Z', verified_how:'own probe · 9 seats' },
  { tool_key:'abe_weighing_in', family:'council', circuit:'C2', status:'live', verified_at:null, verified_how:null },
  { tool_key:'file_to_office', family:'office', circuit:'C4', status:'live', verified_at:null, verified_how:null },
  { tool_key:'welcome_party', family:'onboarding', circuit:'C3', status:'live', verified_at:null, verified_how:null },
  { tool_key:'taylor_setup', family:'onboarding', circuit:'C3', status:'live', verified_at:null, verified_how:null },
  { tool_key:'record_intake', family:'onboarding', circuit:'C3', status:'live', verified_at:null, verified_how:null },
  { tool_key:'set_chief_name', family:'onboarding', circuit:'C3', status:'live', verified_at:null, verified_how:null },
  { tool_key:'setup_progress', family:'onboarding', circuit:'C3', status:'live', verified_at:null, verified_how:null },
];
export const PULSE: PulseRow = {
  cid:'CID-100001', tenant:'COB-HQ', cob_name:'COB', kernel_version:1, kernel_sealed:true,
  parts_verified:8, parts_total:8, failed_parts:[], last_boot_at:'2026-08-01T15:48:37Z',
  last_checkpoint_at:'2026-08-02T04:30:00Z', last_checkpoint_kind:'save',
  open_session_count:1, unclosed_prior_sessions:0,
  staleness:['0 day(s) since last checkpoint','0 day(s) since last memory entry'],
  token_version:'2026.07.31.3', tool_manifest_version:'2026.07.31.3',
};
export const KERNEL_PARTS: KernelPartRow[] = [
  { part:'instructions', seq:1, bytes:11195, sha256_prefix:'a00e5f867be93666', hash_match:true },
  { part:'preamble', seq:1, bytes:10827, sha256_prefix:'fcbec1f247410398', hash_match:true },
  { part:'profile', seq:1, bytes:38817, sha256_prefix:'90b587aee9d36804', hash_match:true },
  { part:'profile', seq:2, bytes:38460, sha256_prefix:'efe99a838d9d0de2', hash_match:true },
  { part:'profile', seq:3, bytes:38623, sha256_prefix:'7c60e598c5a2a273', hash_match:true },
  { part:'profile', seq:4, bytes:38643, sha256_prefix:'6839edbb3350b61a', hash_match:true },
  { part:'profile', seq:5, bytes:38605, sha256_prefix:'c3a1a480011945e5', hash_match:true },
  { part:'state_pointer', seq:1, bytes:992, sha256_prefix:'aa3d7e25ca980da0', hash_match:true },
];
export const MEMORY: MemoryRow[] = [
  { id:'m1', category:'platform', title:'Eight skill bodies ingested verbatim, hash-proven', body_length:812, session_id:'cc5000b5', mirrored_to_notion:false, superseded_by:null, created_at:'2026-08-02T04:30:00Z' },
  { id:'m2', category:'architecture', title:'Registers unreachable from browser — outage, not leak', body_length:701, session_id:'cc5000b5', mirrored_to_notion:false, superseded_by:null, created_at:'2026-08-02T04:30:00Z' },
  { id:'m3', category:'architecture', title:'Two tenancy key spaces run simultaneously', body_length:644, session_id:'cc5000b5', mirrored_to_notion:false, superseded_by:null, created_at:'2026-08-02T04:30:00Z' },
  { id:'m4', category:'defect', title:'Fixture provenance stamped now() made snapshot look LIVE', body_length:598, session_id:'cc5000b5', mirrored_to_notion:false, superseded_by:null, created_at:'2026-08-02T04:30:00Z' },
  { id:'m5', category:'security', title:'bridge_claim_next was anon-executable (contained 2026-08-02)', body_length:530, session_id:'cc5000b5', mirrored_to_notion:false, superseded_by:null, created_at:'2026-08-02T04:30:00Z' },
];
export const MEMORY_STATS = { total_rows:56, distinct_categories:19, bytes_total:29200, provenance_pct:78, notion_mirror_pct:27, notion_only_share_pct:60 };
export const OFFICE_SURFACES: OfficeSurfaceRow[] = [
  { surface_key:'rules', label:'Rules surface', kind:'page', notion_id_present:true, write_policy:'inbox_review', row_count:null, last_entry_at:'2026-07-31T00:00:00Z', postgres_table:'directives', status:'UNREGISTERED' },
  { surface_key:'memory', label:'Memory Sync', kind:'page', notion_id_present:true, write_policy:'append_only', row_count:null, last_entry_at:'2026-07-30T00:00:00Z', postgres_table:'memory_entries', status:'REGISTERED' },
  { surface_key:'session_log', label:'Session Log', kind:'data_source', notion_id_present:true, write_policy:'direct', row_count:null, last_entry_at:'2026-07-31T00:00:00Z', postgres_table:'session_checkpoints', status:'REGISTERED' },
  { surface_key:'session_brief', label:'Session Brief', kind:'data_source', notion_id_present:true, write_policy:'direct', row_count:69, last_entry_at:'2026-07-31T00:00:00Z', postgres_table:null, status:'UNREGISTERED' },
  { surface_key:'decisions', label:'Decisions', kind:'data_source', notion_id_present:true, write_policy:'direct', row_count:null, last_entry_at:'2026-07-30T00:00:00Z', postgres_table:'decisions', status:'REGISTERED' },
  { surface_key:'tasks', label:'Tasks / Open Loops', kind:'data_source', notion_id_present:true, write_policy:'direct', row_count:null, last_entry_at:'2026-07-31T00:00:00Z', postgres_table:'open_loops', status:'REGISTERED' },
  { surface_key:'signals', label:'Improvement Signals', kind:'data_source', notion_id_present:true, write_policy:'append_only', row_count:null, last_entry_at:'2026-07-30T00:00:00Z', postgres_table:'signals', status:'REGISTERED' },
  { surface_key:'boardroom', label:'Boardroom Minutes', kind:'data_source', notion_id_present:true, write_policy:'append_only', row_count:null, last_entry_at:'2026-06-25T00:00:00Z', postgres_table:'council_minutes', status:'UNREGISTERED' },
  { surface_key:'document_registry', label:'Document Registry', kind:'data_source', notion_id_present:true, write_policy:'direct', row_count:null, last_entry_at:null, postgres_table:null, status:'UNREGISTERED' },
  { surface_key:'comms', label:'Comms', kind:'data_source', notion_id_present:true, write_policy:'direct', row_count:null, last_entry_at:null, postgres_table:null, status:'REGISTERED' },
  { surface_key:'records', label:'Records / Files Index', kind:'data_source', notion_id_present:true, write_policy:'direct', row_count:null, last_entry_at:null, postgres_table:'knowledge_files', status:'REGISTERED' },
];
export const RECEIPTS: ReceiptRowFleet[] = [
  { id:'1a10ea17', kind:'save', cid:'CID-100001', tenant:'COB-HQ', status:'PARTIAL', layers_failed:19, created_at:'2026-08-02T04:30:00Z' },
  { id:'4ad0f62a', kind:'save', cid:'CID-100001', tenant:'COB-HQ', status:'PARTIAL', layers_failed:3, created_at:'2026-08-02T04:45:00Z' },
];
