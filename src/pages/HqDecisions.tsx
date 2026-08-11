/** DECISIONS · /hq/decisions · what has been decided, and what still stands. */
import { RegisterPage, when, type RegisterSpec } from "@/components/hq/RegisterPage";

interface DecisionRow {
  id: string;
  title: string;
  decision_md: string | null;
  rationale_md: string | null;
  authority_tier: string | null;
  reversibility: string | null;
  decided_by: string | null;
  decided_at: string | null;
  minute_id: string | null;
  superseded: boolean | null;
}

const reversibleWord = (s: string | null): string => {
  if (!s) return "not stated";
  return /revers/i.test(s) && !/irrevers/i.test(s) ? "can be undone" : "hard to undo";
};

const spec: RegisterSpec<DecisionRow> = {
  rpc: "hq_decisions_read",
  crumb: "YOUR HQ",
  heading: "Decisions",
  sub: "Every call on the record, who made it, and whether it still stands.",
  limit: 200,
  leadKey: "standing",
  leadWords: (n) => (n === 1 ? "decision still stands" : "decisions still stand"),
  kpis: [
    { key: "superseded", label: "replaced since" },
    { key: "reversible", label: "can be undone" },
    { key: "total", label: "in all" },
  ],
  idOf: (r) => r.id,
  titleOf: (r) => r.title,
  cells: (r) => [
    { text: when(r.decided_at) },
    { text: r.decided_by ?? "unattributed" },
    { text: r.superseded ? "replaced" : reversibleWord(r.reversibility), mark: !!r.superseded },
  ],
  fields: (r) => [
    { k: "Decided", v: when(r.decided_at) },
    { k: "Decided by", v: r.decided_by ?? "unattributed" },
    { k: "Authority", v: r.authority_tier ?? "not stated" },
    { k: "Undoing it", v: reversibleWord(r.reversibility) },
    { k: "Still stands", v: r.superseded ? "no, it was replaced" : "yes" },
    { k: "What was decided", v: r.decision_md ?? "no wording on record" },
    { k: "Why", v: r.rationale_md ?? "no reasoning on record" },
  ],
  verbs: [
    {
      action: "decision.dispute",
      label: "Dispute this",
      ghost: true,
      ask: { key: "reason", label: "Why", placeholder: "What is wrong with it" },
    },
  ],
  haystack: (r) => `${r.title} ${r.decided_by ?? ""} ${r.decision_md ?? ""}`,
  emptyWords: "No decisions on record yet.",
};

export function HqDecisions() {
  return <RegisterPage spec={spec} />;
}

export default HqDecisions;
