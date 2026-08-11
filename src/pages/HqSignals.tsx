/** SIGNALS · /hq/signals · the running record of what keeps coming back.
 *
 * One row per pattern, rolled up on its stable key, so the same defect cannot
 * fragment into a dozen rows and hide its own size. Each pattern carries the
 * five most recent sightings: session, tool, surface, and a link to where it
 * happened. When the link resolves to a page in this HQ it is a real link.
 */
import { Link } from "react-router-dom";

import { RegisterPage, when, type RegisterSpec } from "@/components/hq/RegisterPage";

interface Sighting {
  at: string | null;
  session_id: string | null;
  tool: string | null;
  surface: string | null;
  subject: string | null;
  link: Record<string, unknown> | null;
}

interface SignalRow {
  id: string;
  key: string;
  pattern: string | null;
  times: number | null;
  chronic: boolean | null;
  first_seen: string | null;
  last_seen: string | null;
  still_open: boolean | null;
  detail_md: string | null;
  sightings_logged: number | null;
  where_it_happened: Sighting[] | null;
}

/** Pages this HQ actually has. A link to anywhere else stays plain words. */
const PAGE_FOR_KIND: Record<string, string> = {
  session: "/hq/sessions",
  sessions: "/hq/sessions",
  memory: "/hq/memories",
  memory_entry: "/hq/memories",
  rule: "/hq/memories",
  directive: "/hq/memories",
  decision: "/hq/decisions",
  decisions: "/hq/decisions",
  task: "/hq/tasks",
  open_loop: "/hq/tasks",
  message: "/hq/messages",
  comm: "/hq/messages",
  blueprint: "/hq/blueprints",
  signal: "/hq/signals",
};

const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/** Turn one sighting into a link when we have a page for it, words when we do not. */
function SightingWhere({ s }: { s: Sighting }) {
  const link = s.link ?? {};
  const kind = (text(link.kind) ?? text(link.type) ?? text(link.table) ?? "").toLowerCase();
  const id = text(link.id) ?? text(link.record_id) ?? s.session_id;
  const href = text(link.url) ?? text(link.href);
  const page = PAGE_FOR_KIND[kind] ?? (s.session_id && !kind ? "/hq/sessions" : null);
  const label =
    text(link.label) ??
    (kind ? `${kind}${id ? ` \u00b7 ${id.slice(0, 8)}` : ""}` : null) ??
    (s.session_id ? `session \u00b7 ${s.session_id.slice(0, 8)}` : null);

  const words = [s.tool, s.surface, s.subject].filter(Boolean).join(" \u00b7 ");

  let target: JSX.Element | null = null;
  if (page && label) {
    target = (
      <Link className="sig-link" to={id ? `${page}?find=${encodeURIComponent(id)}` : page}>
        {label}
      </Link>
    );
  } else if (href && label) {
    target = (
      <a className="sig-link" href={href} target="_blank" rel="noreferrer">
        {label}
      </a>
    );
  } else if (label) {
    target = <span className="sig-plain">{label}</span>;
  }

  return (
    <div className="sig-sighting">
      <span className="sig-when">{when(s.at)}</span>
      <span className="sig-what">{words || "no place recorded"}</span>
      {target}
    </div>
  );
}

function WhereItHappened({ rows }: { rows: Sighting[] }) {
  if (rows.length === 0) return <>Nothing logged yet for this one.</>;
  return (
    <div className="sig-sightings">
      {rows.map((s, i) => (
        <SightingWhere key={`${s.at ?? "no-date"}-${i}`} s={s} />
      ))}
    </div>
  );
}

const spec: RegisterSpec<SignalRow> = {
  rpc: "hq_signals_read",
  crumb: "YOUR HQ",
  heading: "Signals",
  sub: "Patterns seen more than once, rolled up so nothing hides. Three or more times and it is chronic.",
  limit: 200,
  leadKey: "chronic",
  leadWords: (n) => (n === 1 ? "pattern is chronic" : "patterns are chronic"),
  kpis: [
    { key: "open", label: "still open" },
    { key: "times_it_has_happened", label: "times in all" },
    { key: "distinct_patterns", label: "patterns" },
  ],
  idOf: (r) => r.id ?? r.key,
  titleOf: (r) => r.pattern ?? r.key,
  cells: (r) => [
    { text: `seen ${r.times ?? 0}\u00d7`, mark: !!r.chronic },
    { text: r.chronic ? "chronic" : "" },
    { text: r.still_open ? "open" : "closed" },
  ],
  fields: (r) => [
    { k: "Times seen", v: r.times ?? 0 },
    { k: "Chronic", v: r.chronic ? "yes, three or more" : "no" },
    { k: "State", v: r.still_open ? "open" : "closed" },
    { k: "Name it goes by", v: r.key },
    { k: "First seen", v: when(r.first_seen) },
    { k: "Last seen", v: when(r.last_seen) },
    { k: "Occurrences logged", v: r.sightings_logged ?? 0 },
    { k: "Where it happened", v: <WhereItHappened rows={r.where_it_happened ?? []} /> },
    { k: "Detail", v: r.detail_md ?? "no detail on record" },
  ],
  verbs: [
    {
      action: "signal.mechanism_changed",
      label: "Say what changed",
      show: (r) => !!r.still_open,
      ask: {
        key: "what_changed",
        label: "What changed so this stops happening",
        placeholder: "What changed so this stops happening",
      },
    },
    { action: "signal.dismiss", label: "Close it", ghost: true, show: (r) => !!r.still_open },
    { action: "signal.reopen", label: "Open it again", ghost: true, show: (r) => !r.still_open },
  ],
  haystack: (r) => `${r.pattern ?? ""} ${r.key} ${r.detail_md ?? ""}`,
  emptyWords: "No patterns yet. Nothing has repeated.",
};

export function HqSignals() {
  return <RegisterPage spec={spec} />;
}

export default HqSignals;
