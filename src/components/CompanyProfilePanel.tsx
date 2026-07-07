import { Mail, Phone, Linkedin, User, AlertCircle } from "lucide-react";

type Contact = {
  name?: string;
  title?: string;
  email?: string;
  email_status?: string;
  phone?: string;
  linkedin?: string;
};

export type CobProfile = {
  profiled_on?: string;
  stage?: string;
  headcount?: string;
  business_lines?: string[];
  est_revenue?: string;
  aum?: string;
  total_assets?: string;
  ownership?: string;
  footprint?: string;
  competitors?: string;
  tech?: string;
  primary_contact?: Contact;
  secondaries?: string[];
  triggers?: string[];
  hook?: string;
  objections?: string[];
  next_action?: string;
  note?: string;
  containment?: string;
  confidence?: string;
  dossier_ref?: string;
};

function EmailStatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const s = status.toUpperCase();
  const verified = s.includes("VERIFIED");
  const inferred = s.includes("INFERRED");
  if (!verified && !inferred) {
    return (
      <span className="text-[9px] font-mono px-1 py-0 rounded border border-border text-muted-foreground">
        {status}
      </span>
    );
  }
  const cls = verified
    ? "border-status-green/60 text-status-green"
    : "border-status-amber/60 text-status-amber";
  return (
    <span className={`text-[9px] font-mono px-1 py-0 rounded border ${cls}`}>
      {verified ? "Verified" : "Inferred"}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground">
      {children}
    </span>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-xs font-mono">{value}</span>
    </div>
  );
}

export default function CompanyProfilePanel({ profile, compact = false }: { profile: CobProfile | null | undefined; compact?: boolean }) {
  if (!profile || typeof profile !== "object") return null;

  const wealthValue = profile.aum || profile.total_assets;
  const revenueLabel = wealthValue ? (profile.aum ? "AUM" : "Total assets") : "Est. revenue";
  const revenueValue = wealthValue || profile.est_revenue;

  const primary = profile.primary_contact;
  const secondaries = (profile.secondaries || []).filter(Boolean);
  const triggers = (profile.triggers || []).filter(Boolean);
  const objections = (profile.objections || []).filter(Boolean);
  const lines = (profile.business_lines || []).filter(Boolean);

  return (
    <section className={compact ? "space-y-3" : "space-y-4 p-4"}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Company profile</h3>
        {profile.stage && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-dossier-brass/60 text-dossier-brass">
            {profile.stage}
          </span>
        )}
      </div>

      {/* Firmographics strip */}
      {(profile.headcount || revenueValue || profile.ownership || profile.footprint || lines.length > 0) && (
        <div className="border border-border rounded p-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Fact label="Headcount" value={profile.headcount} />
            <Fact label={revenueLabel} value={revenueValue} />
            <Fact label="Ownership" value={profile.ownership} />
            <Fact label="Footprint" value={profile.footprint} />
          </div>
          {lines.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {lines.map((l, i) => <Chip key={i}>{l}</Chip>)}
            </div>
          )}
        </div>
      )}

      {/* Key contact */}
      {(primary?.name || secondaries.length > 0) && (
        <div className="border border-border rounded p-3 space-y-2">
          <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Key contact</div>
          {primary?.name && (
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <User size={14} className="text-muted-foreground" />
                <span className="font-medium">{primary.name}</span>
                {primary.title && <span className="text-xs text-muted-foreground font-mono">· {primary.title}</span>}
              </div>
              {primary.email && (
                <div className="flex items-center gap-2 text-xs font-mono">
                  <Mail size={12} className="text-muted-foreground" />
                  <span>{primary.email}</span>
                  <EmailStatusBadge status={primary.email_status} />
                </div>
              )}
              {primary.phone && (
                <div className="flex items-center gap-2 text-xs font-mono">
                  <Phone size={12} className="text-muted-foreground" />
                  <span>{primary.phone}</span>
                </div>
              )}
              {primary.linkedin && (
                <div className="flex items-center gap-2 text-xs font-mono">
                  <Linkedin size={12} className="text-muted-foreground" />
                  <a href={primary.linkedin} target="_blank" rel="noreferrer" className="hover:text-dossier-brass truncate">
                    {primary.linkedin.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              )}
            </div>
          )}
          {secondaries.length > 0 && (
            <div className="pt-2 border-t border-border/60 space-y-1">
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Secondaries</div>
              {secondaries.map((s, i) => (
                <div key={i} className="text-xs font-mono text-muted-foreground">· {s}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pursuit intel */}
      {(profile.hook || triggers.length > 0 || objections.length > 0 || profile.next_action) && (
        <div className="border border-border rounded p-3 space-y-3">
          <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Pursuit intel</div>
          {profile.hook && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">Hook</div>
              <div className="text-xs">{profile.hook}</div>
            </div>
          )}
          {triggers.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">Triggers</div>
              <ul className="text-xs space-y-0.5">
                {triggers.map((t, i) => <li key={i}>· {t}</li>)}
              </ul>
            </div>
          )}
          {objections.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">Objections</div>
              <ul className="text-xs space-y-0.5">
                {objections.map((o, i) => <li key={i}>· {o}</li>)}
              </ul>
            </div>
          )}
          {profile.next_action && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">Next action</div>
              <div className="text-xs">{profile.next_action}</div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {(profile.profiled_on || profile.dossier_ref || profile.containment) && (
        <div className="space-y-1">
          {profile.containment && (
            <div className="flex items-start gap-1.5 text-[10px] font-mono text-status-amber">
              <AlertCircle size={11} className="mt-0.5 shrink-0" />
              <span>{profile.containment}</span>
            </div>
          )}
          <div className="text-[10px] font-mono text-muted-foreground">
            {profile.profiled_on && <>Profiled {profile.profiled_on}</>}
            {profile.dossier_ref && <> · ref {profile.dossier_ref}</>}
          </div>
        </div>
      )}
    </section>
  );
}
