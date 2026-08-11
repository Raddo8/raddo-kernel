/** SESSIONS · /hq/sessions · every sitting with your COB, and how it ended. */
import { RegisterPage, mins, when, type RegisterSpec } from "@/components/hq/RegisterPage";

interface SessionRow {
  id: string;
  title: string | null;
  surface: string | null;
  opened_at: string | null;
  closed_at: string | null;
  close_kind: string | null;
  minutes: number | null;
}

const closeWord = (row: SessionRow): string => {
  if (!row.closed_at) return "still open";
  switch ((row.close_kind ?? "").toLowerCase()) {
    case "clean":
      return "closed cleanly";
    case "makeup":
      return "closed late";
    case "":
      return "closed";
    default:
      return `closed ${(row.close_kind ?? "").toLowerCase()}`;
  }
};

const spec: RegisterSpec<SessionRow> = {
  rpc: "hq_sessions_read",
  crumb: "YOUR HQ",
  heading: "Sessions",
  sub: "Every sitting with your COB: when it opened, how long it ran, how it ended.",
  limit: 120,
  leadKey: "open_now",
  leadWords: (n) => (n === 1 ? "session is open right now" : "sessions are open right now"),
  kpis: [
    { key: "clean_closes", label: "closed cleanly" },
    { key: "makeup_closes", label: "closed late" },
    { key: "total", label: "in all" },
  ],
  idOf: (r) => r.id,
  titleOf: (r) => r.title ?? `Session ${when(r.opened_at)}`,
  cells: (r) => [
    { text: when(r.opened_at) },
    { text: mins(r.minutes) },
    { text: closeWord(r), mark: !r.closed_at },
  ],
  fields: (r) => [
    { k: "Opened", v: when(r.opened_at) },
    { k: "Length", v: mins(r.minutes) },
    { k: "How it ended", v: closeWord(r) },
    { k: "Closed", v: r.closed_at ? when(r.closed_at) : "not yet" },
    { k: "Where", v: r.surface ?? "not stated" },
  ],
  // Sessions are a record of what happened. Nothing here is the client's to
  // change after the fact, so the drawer reads and does not act.
  verbs: [],
  haystack: (r) => `${r.title ?? ""} ${r.surface ?? ""} ${r.close_kind ?? ""}`,
  emptyWords: "No sittings on record yet.",
};

export function HqSessions() {
  return <RegisterPage spec={spec} />;
}

export default HqSessions;
