/** SIGNALS · /hq/signals · patterns that keep coming back. */
import { RegisterPage, when, type RegisterSpec } from "@/components/hq/RegisterPage";

interface SignalRow {
  id: string;
  pattern: string;
  recurrence: number | null;
  detail_md: string | null;
  audience: string | null;
  silent: boolean | null;
  status: string | null;
  first_seen: string | null;
  last_seen: string | null;
  chronic: boolean | null;
}

const statusWord = (s: string | null) => {
  switch ((s ?? "").toLowerCase()) {
    case "closed":
      return "closed";
    case "open":
    case "":
      return "open";
    default:
      return (s ?? "").toLowerCase();
  }
};

const spec: RegisterSpec<SignalRow> = {
  rpc: "hq_signals_read",
  crumb: "YOUR HQ",
  heading: "Signals",
  sub: "Patterns seen more than once. Three or more times and it is chronic.",
  limit: 200,
  leadKey: "chronic",
  leadWords: (n) => (n === 1 ? "pattern is chronic" : "patterns are chronic"),
  kpis: [
    { key: "open", label: "still open" },
    { key: "loudest", label: "loudest count" },
    { key: "total", label: "in all" },
  ],
  idOf: (r) => r.id,
  titleOf: (r) => r.pattern,
  cells: (r) => [
    { text: `seen ${r.recurrence ?? 0}\u00d7`, mark: !!r.chronic },
    { text: r.chronic ? "chronic" : "" },
    { text: statusWord(r.status) },
  ],
  fields: (r) => [
    { k: "Times seen", v: r.recurrence ?? 0 },
    { k: "Chronic", v: r.chronic ? "yes, three or more" : "no" },
    { k: "State", v: statusWord(r.status) },
    { k: "Who it concerns", v: r.audience ?? "not stated" },
    { k: "First seen", v: when(r.first_seen) },
    { k: "Last seen", v: when(r.last_seen) },
    { k: "Detail", v: r.detail_md ?? "no detail on record" },
  ],
  verbs: [
    { action: "signal.dismiss", label: "Close it", show: (r) => statusWord(r.status) !== "closed" },
    {
      action: "signal.reopen",
      label: "Open it again",
      ghost: true,
      show: (r) => statusWord(r.status) === "closed",
    },
  ],
  haystack: (r) => `${r.pattern} ${r.audience ?? ""} ${r.detail_md ?? ""}`,
  emptyWords: "No patterns yet. Nothing has repeated.",
};

export function HqSignals() {
  return <RegisterPage spec={spec} />;
}

export default HqSignals;
