import React from 'react';
import { useHqRead, type Viewer } from '../useHqRead';
import type { SkillRowFleet, SkillRowTenant, AdvisorRow } from '../contracts/registers';
import { Section, ProvenanceBar, StateBlock, FactTile, FactRow, Badge, StateBadge, RegisterTable, ExceptionsBar, type Column } from '../components/primitives';
const DIST: Record<string, string> = { SERVABLE: 'act', RECOVERING: 'pend', QUARANTINED: 'hi', VERSION_UNRESOLVED: 'open', RETIRED: 'dorm' };
export function Arsenal({ viewer }: { viewer: Viewer }) {
  const skills = useHqRead<SkillRowFleet | SkillRowTenant>({ module: 'arsenal', view: 'skills' }, viewer);
  const advisors = useHqRead<AdvisorRow>({ module: 'arsenal', view: 'advisors' }, viewer);
  const fleet = skills.projection === 'fleet';
  const fleetRows = fleet ? (skills.rows as SkillRowFleet[]) : [];
  const held = fleetRows.filter(s => s.hq_holds_body).length;
  const asserted = fleetRows.filter(s => !s.hq_holds_body && s.sha256_prefix && s.sha256_prefix !== '\u2014' && s.distribution_status !== 'RETIRED').length;
  const fleetCols: Column<SkillRowFleet>[] = [
    { key: 'n', label: 'Skill', render: r => <span className="rt">/{r.name}</span> },
    { key: 'v', label: 'Version', render: r => <span className="rk">{r.version}</span> },
    { key: 'd', label: 'Distribution', render: r => <Badge kind={DIST[r.distribution_status]}>{r.distribution_status}</Badge> },
    { key: 'b', label: 'HQ holds body', render: r => r.hq_holds_body ? <Badge kind="sealed">{(r.bytes ?? 0).toLocaleString()} B</Badge> : <Badge kind="dorm">\u2014</Badge> },
    { key: 's', label: 'Version state', render: r => <span className="rd">{r.version_state ?? '\u2014'}</span> },
  ];
  const tenantCols: Column<SkillRowTenant>[] = [
    { key: 'n', label: 'Skill', render: r => <span className="rt">/{r.name}</span> },
    { key: 'v', label: 'Version', render: r => <span className="rk">{r.version}</span> },
    { key: 'c', label: 'Category', render: r => <Badge kind="private">{r.category}</Badge> },
    { key: 'e', label: 'Available', render: r => <Badge kind={r.enabled ? 'act' : 'dorm'}>{r.enabled ? 'enabled' : 'off'}</Badge> },
  ];
  return (<>
    <div className="hqx-ph"><h1>Intelligence Registry</h1><StateBadge state={skills.state} /></div>
    <p className="hqx-sub">{fleet ? 'Fleet projection: every skill, advisor and tool the platform can serve \u2014 and every one it merely claims to.' : 'Your permitted skills and seated advisors.'}</p>
    {fleet && <FactRow>
      <FactTile k="Skills registered" v={fleetRows.length} />
      <FactTile k="HQ holds body" v={held} note="ingested verbatim, hash-verified" tone={held > 0 ? 'good' : 'bad'} />
      <FactTile k="Claim without substrate" v={asserted} note="active skills, sha recorded, no body" tone={asserted > 0 ? 'bad' : 'good'} />
      <FactTile k="Council seated" v={advisors.rows.length} tone="good" />
    </FactRow>}
    {fleet && asserted > 0 && <ExceptionsBar label="asserted state without substrate" detail={`${asserted} active skills carry a recorded sha256 for a body HQ does not hold.`} />}
    <Section title="Skills" source={fleet ? 'vac · study_skills (fleet)' : 'vac · study_skills (tenant-safe)'}>
      <ProvenanceBar env={skills} />
      {skills.row_count === 0 ? <StateBlock state={skills.state} reasons={skills.reasons} />
        : fleet ? <RegisterTable columns={fleetCols} rows={fleetRows} rowKey={r => r.name} />
        : <RegisterTable columns={tenantCols} rows={skills.rows as SkillRowTenant[]} rowKey={r => r.name} />}
    </Section>
    <Section title="The Council" source="connector · show_council">
      <ProvenanceBar env={advisors} />
      {advisors.row_count === 0 ? <StateBlock state={advisors.state} reasons={advisors.reasons} />
        : <RegisterTable columns={[
            { key: 'n', label: 'Advisor', render: (r: AdvisorRow) => <span className="rt">{r.name}</span> },
            { key: 'l', label: 'Lens', render: (r: AdvisorRow) => <span className="rd">{r.lens}</span> },
            { key: 's', label: 'Status', render: (r: AdvisorRow) => <Badge kind={r.seated ? 'act' : 'dorm'}>{r.seated ? 'seated' : 'vacant'}</Badge> },
          ]} rows={advisors.rows} rowKey={r => r.id} />}
    </Section>
  </>);
}
