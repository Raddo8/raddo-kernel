/** LEDGER TWO · Register Migration Ledger — system-of-record only.
 * Registration (tenant_surfaces) and substrate (HQ table) are SEPARATE columns.
 * Nothing here flips because data was copied. */
export interface RegisterEntry {
  register: string; responsibility: string;
  currentHome: 'notion'|'box'|'hq'|'split'|'none'; targetHome: 'hq';
  registration: 'REGISTERED'|'UNREGISTERED'|'NA';
  substrate: 'PRESENT'|'PARTIAL'|'ABSENT';
  gates: string[];
  backfill: 'NOT_STARTED'|'IN_PROGRESS'|'COMPLETE';
  cutover: 'NOT_SCHEDULED'|'SCHEDULED'|'DONE';
  rollback: 'UNPROVEN'|'PROVEN';
  retirement: 'NOT_ELIGIBLE'|'ELIGIBLE'|'RETIRED';
}
const G_COMMON = ['CID-keyed reads+writes','server-derived principal context','fleet-vs-tenant authority','negative cross-tenant probes','migration completeness','rollback proof'];
const R = (register: string, responsibility: string, currentHome: RegisterEntry['currentHome'], registration: RegisterEntry['registration'], substrate: RegisterEntry['substrate'], backfill: RegisterEntry['backfill'], extraGates: string[] = []): RegisterEntry =>
  ({ register, responsibility, currentHome, targetHome: 'hq', registration, substrate, gates: [...G_COMMON, ...extraGates], backfill, cutover: 'NOT_SCHEDULED', rollback: 'UNPROVEN', retirement: 'NOT_ELIGIBLE' });
export const REGISTERS: RegisterEntry[] = [
  R('rules','standing rules · LOCKED tier + registry','notion','UNREGISTERED','PRESENT','NOT_STARTED',['document model','confirmation governance']),
  R('boardroom_minutes','council output of record','notion','UNREGISTERED','PRESENT','NOT_STARTED',['persistence contract — 0 rows vs ~250 calls']),
  R('session_brief','principal decision board (69 rows)','notion','UNREGISTERED','ABSENT','NOT_STARTED',['table creation']),
  R('document_registry','identity/reference file registry','notion','UNREGISTERED','ABSENT','NOT_STARTED',['table creation']),
  R('memory','durable facts + preferences','split','REGISTERED','PARTIAL','NOT_STARTED',['schema completion (updated_at, created_by, session FK, search, vocabulary)','boot read path','~2/3 Notion-only backfill (from 2026-07-08)']),
  R('session_log','continuity + transcripts','split','REGISTERED','PARTIAL','NOT_STARTED',['document model — transcripts have NO substrate']),
  R('decisions','decisions of record','split','REGISTERED','PRESENT','NOT_STARTED'),
  R('tasks','open loops','split','REGISTERED','PRESENT','NOT_STARTED',['vocabulary reconciliation (loop_state_alias unpopulated)']),
  R('signals','improvement signals','split','REGISTERED','PRESENT','NOT_STARTED'),
  R('comms','communications register','notion','REGISTERED','ABSENT','NOT_STARTED',['table creation']),
  R('records_files','files + records index','box','REGISTERED','PRESENT','NOT_STARTED',['storage wiring','preview','sharing','permissions']),
  R('skills','skill bodies + distribution','hq','NA','PRESENT','COMPLETE',['load_skill serving tool']),
  R('identity_kernel','identity parts, sealed','hq','NA','PRESENT','COMPLETE',[]),
  R('canon_corpus','120 canon documents (in panel v9-r8 HTML today)','none','NA','ABSENT','NOT_STARTED',['document model ADR ratified']),
];
