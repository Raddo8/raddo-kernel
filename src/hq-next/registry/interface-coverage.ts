/** LEDGER ONE · Interface Coverage Registry — typed source of truth.
 * Interface DEFINITIONS only. Deployment instances and system-of-record migration
 * live in register-migration.ts. Never merged. */
export type Lifecycle = 'DISCOVERED'|'DESIGN_PORTED'|'FIXTURE_VALIDATED'|'LIVE_CONNECTED'|'AUTHORITY_PROVEN'|'RECEIPTED'|'RELEASED'|'DEGRADED'|'MISSING';
export interface InterfaceEntry {
  id: string; route: string; label: string; plane: 'operator'|'client'|'both';
  reuses: string|null; sourceOfTruth: string; component: string|null;
  freshnessSec: number|null; liveUpdate: 'signal'|'poll'|'manual'|'none';
  drilldowns: string[]; actions: string[]; receipt: 'none'|'telemetry'|'receipt';
  life: Lifecycle;
}
const E = (id: string, label: string, plane: InterfaceEntry['plane'], src: string, life: Lifecycle, reuses: string|null = null, component: string|null = null): InterfaceEntry =>
  ({ id, route: `/control/hq-next#${id.split('.').pop()}`, label, plane, reuses, sourceOfTruth: src, component, freshnessSec: null, liveUpdate: 'manual', drilldowns: [], actions: [], receipt: 'telemetry', life });
export const INTERFACES: InterfaceEntry[] = [
  // hq v29-r28 pages (22)
  E('hq.mind','Mind','both','derived','DISCOVERED','hq v29-r28 #mind'),
  E('hq.kernel','System Pulse','both','connector · begin_session','FIXTURE_VALIDATED','hq v29-r28 #kernel','SystemPulse'),
  E('hq.security','Security','both','vac · sessions','DISCOVERED','hq v29-r28 #security'),
  E('hq.arsenal','Intelligence Registry','both','vac · study_skills+study_agents+tool_catalog','FIXTURE_VALIDATED','hq v29-r28 #arsenal','Arsenal'),
  E('hq.blueprints','Blueprints','operator','vac · blueprints','DISCOVERED','hq v29-r28 #blueprints'),
  E('hq.collection','Collection','both','vac · connectors','DISCOVERED','hq v29-r28 #collection'),
  E('hq.memories','Memory','both','vac · memory_entries','FIXTURE_VALIDATED','hq v29-r28 #memories','Memory'),
  E('hq.record','Record','both','OFFICE · Session Log + Decisions','DISCOVERED','hq v29-r28 #record'),
  E('hq.operations','Operations','both','OFFICE · Initiatives + Tasks','DISCOVERED','hq v29-r28 #operations'),
  E('hq.personalize','Personalize','both','OFFICE · rules surface','DISCOVERED','hq v29-r28 #personalize'),
  E('hq.office','Office Plane','both','vac · tenant_surfaces + OFFICE','FIXTURE_VALIDATED','tenant_surfaces','OfficePlane'),
  E('hq.provenance','Provenance','operator','OFFICE · change_log','DISCOVERED','hq v29-r28 #provenance'),
  E('hq.account','Account','both','vac · tenants + principals','DISCOVERED','hq v29-r28 #account'),
  E('hq.fleet','Fleet','operator','vac · tenants','DISCOVERED','hq v29-r28 #fleet'),
  E('hq.subject','Subject','client','OFFICE · Principal + Entities','DISCOVERED','hq v29-r28 #subject'),
  E('hq.holdings','Holdings','client','OFFICE · Entities','DISCOVERED','hq v29-r28 #holdings'),
  E('hq.horizon','Horizon','client','OFFICE · Goals','DISCOVERED','hq v29-r28 #horizon'),
  E('hq.posture','Posture','client','OFFICE · Legal Matters','DISCOVERED','hq v29-r28 #posture'),
  E('hq.pipeline','Pipeline','client','OFFICE · Pipeline','DISCOVERED','hq v29-r28 #pipeline'),
  E('hq.corpus','Corpus','client','OFFICE · Records/Files Index','DISCOVERED','hq v29-r28 #corpus'),
  E('hq.subscription','Subscription','client','vac · entitlements','DISCOVERED','hq v29-r28 #subscription'),
  E('hq.privacy','Privacy','client','derived','DISCOVERED','hq v29-r28 #privacy'),
  // panel v9-r8 sections (18) — the document/version-control surface
  ...['identity-kernel','doctrine','protocols','skills','agents','templates','schemas','surfaces','client-data','tether','publish','document-registry','drift','tenant-identity','fleet-health','directives','scheduled-sessions','audit-findings']
    .map(s => E(`panel.${s}`, `Panel · ${s}`, 'operator', 'panel v9-r8 embedded corpus + registers', 'DISCOVERED', `panel v9-r8 §${s}`)),
  // entity page factories (8) — honest MISSING; NOT forced into items
  ...['business','lane','workstream','initiative','tenant','principal','goal','record']
    .map(s => E(`entity.${s}`, `Entity · ${s}`, 'both', 'DOMAIN MODEL UNDECIDED — not items', 'MISSING')),
  // receipts module (v0.1: tenant-safe + fleet projections)
  E('hq.receipts','Receipts & Audit','both','vac · save_receipts + ritual_runs + execution_receipts','DESIGN_PORTED'),
];
export const COUNTS = INTERFACES.reduce((m, e) => (m[e.life] = (m[e.life] ?? 0) + 1, m), {} as Record<string, number>);
