/** TASKS · /hq/tasks · the client's open loops, and the buttons that clear them. */
import { RegisterPage, days, when, type RegisterSpec } from "@/components/hq/RegisterPage";

interface TaskRow {
  id: string;
  title: string;
  trigger: string | null;
  owner: string | null;
  state: string | null;
  brief_status: string | null;
  surfaced_count: number | null;
  snooze_until: string | null;
  created_at: string | null;
  age_days: number | null;
}

const stateWord = (s: string | null): string => {
  switch ((s ?? "").toLowerCase()) {
    case "open":
      return "open";
    case "done":
      return "finished";
    case "blocked":
      return "blocked";
    case "waiting":
      return "waiting";
    case "dropped":
      return "dropped";
    default:
      return s ? s.toLowerCase() : "no state";
  }
};

const spec: RegisterSpec<TaskRow> = {
  rpc: "hq_tasks_read",
  crumb: "YOUR HQ",
  heading: "Tasks",
  sub: "Everything still open in your name. Press a button and it happens now.",
  limit: 200,
  leadKey: "on_my_brief",
  leadWords: (n) => (n === 1 ? "task is on your brief today" : "tasks are on your brief today"),
  kpis: [
    { key: "waiting", label: "waiting" },
    { key: "blocked", label: "blocked" },
    { key: "finished", label: "finished" },
    { key: "total", label: "in all" },
  ],
  idOf: (r) => r.id,
  titleOf: (r) => r.title,
  cells: (r) => [
    { text: stateWord(r.state) },
    { text: days(r.age_days) },
    {
      text: `surfaced ${r.surfaced_count ?? 0}\u00d7`,
      mark: (r.surfaced_count ?? 0) >= 3,
    },
  ],
  fields: (r) => [
    { k: "State", v: stateWord(r.state) },
    { k: "On your brief", v: r.brief_status ?? "not set" },
    { k: "Owner", v: r.owner ?? "nobody yet" },
    { k: "What brings it back", v: r.trigger ?? "nothing set" },
    { k: "Times surfaced", v: r.surfaced_count ?? 0 },
    { k: "Snoozed until", v: r.snooze_until ? when(r.snooze_until) : "not snoozed" },
    { k: "Opened", v: when(r.created_at) },
    { k: "Age", v: days(r.age_days) },
  ],
  verbs: [
    { action: "task.close", label: "Mark it done", show: (r) => r.state !== "done" },
    { action: "task.drop", label: "Drop it", ghost: true, show: (r) => r.state !== "dropped" },
    {
      action: "task.reopen",
      label: "Put it back",
      ghost: true,
      show: (r) => r.state === "done" || r.state === "dropped" || r.brief_status === "snoozed",
    },
    {
      action: "task.snooze",
      label: "Snooze it",
      ghost: true,
      ask: { key: "until", label: "Bring it back on", placeholder: "2026-09-01" },
    },
    {
      action: "task.owner",
      label: "Set the owner",
      ghost: true,
      ask: { key: "owner", label: "Owner", placeholder: "Who owns this" },
    },
  ],
  haystack: (r) => `${r.title} ${r.owner ?? ""} ${r.state ?? ""}`,
  emptyWords: "Nothing open. Your brief is clear.",
};

export function HqTasks() {
  return <RegisterPage spec={spec} />;
}

export default HqTasks;
