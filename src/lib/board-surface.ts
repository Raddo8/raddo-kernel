/** The board, as an edit surface.
 *
 * Every verb here routes into a function that already exists: board_respond
 * for status, board_update for a rewrite, work_reschedule for a date,
 * work_dispose for "not mine". The surface never invents a verb; it renders
 * the `offered_actions` the board hands it and calls the matching route.
 */
import { supabase } from "@/integrations/supabase/client";

export type BoardAction =
  | "answer"
  | "clear"
  | "snooze"
  | "rewrite"
  | "escalate"
  | "reschedule"
  | "not_mine"
  | "say_who_acts";

export interface BoardItem {
  id: string;
  work_id: string | null;
  title: string;
  trigger: string | null;
  owner: string | null;
  state: string | null;
  brief_status: string | null;
  surfaced_count: number | null;
  snooze_until: string | null;
  hard_deadline: string | null;
  due_date: string | null;
  date_kind: string | null;
  lane: string | null;
  urgent: boolean | null;
  urgent_reason: string | null;
  escalation_state: string | null;
  attribution: "unset" | "principal_acts";
  offered_actions: BoardAction[];
  note: string | null;
}

export interface BoardWithheld {
  id: string;
  work_id: string | null;
  title: string;
  reason: string;
}

export interface BoardRender {
  ok: boolean;
  cid: string;
  today: string;
  count: number;
  mechanism_review_count: number;
  attribution_unset_count: number;
  attribution_unset_on_board: number;
  undisposed_count: number;
  empty_reason: string | null;
  items: BoardItem[];
  withheld: BoardWithheld[];
}

export interface ActOutcome {
  ok: boolean;
  /** Written for the principal and rendered verbatim. Never a bare "success". */
  human: string;
}

const failed = (detail?: string): ActOutcome => ({
  ok: false,
  human: detail
    ? `That did not go through. Nothing changed \u00b7 ${detail}`
    : "That did not go through. Nothing changed.",
});

/** Read the board. `bump` is false while editing so a rewrite does not inflate the surfaced count. */
export async function renderBoard(bump = false): Promise<BoardRender | null> {
  const { data, error } = await supabase.rpc("board_render", { p_bump: bump, p_limit: 200 });
  if (error || !data) return null;
  return data as unknown as BoardRender;
}

/** answer · clear · snooze — all one route, because all three are a status with an optional date. */
export async function respond(
  id: string,
  briefStatus: "answered" | "cleared" | "snoozed" | "open",
  snoozeUntil?: string,
): Promise<ActOutcome> {
  const item: Record<string, unknown> = { id, brief_status: briefStatus };
  if (snoozeUntil) item.snooze_until = snoozeUntil;

  const { data, error } = await supabase.rpc("board_respond", { p_items: [item] as never });
  if (error) return failed(error.message);
  const res = data as { ok?: boolean; rejected?: Array<{ reason?: string; detail?: string }> };
  if (res?.ok) {
    return {
      ok: true,
      human:
        briefStatus === "snoozed"
          ? `Snoozed until ${snoozeUntil}. It comes back that morning, not before.`
          : briefStatus === "answered"
            ? "Marked answered. It leaves the board."
            : briefStatus === "cleared"
              ? "Cleared. It leaves the board."
              : "Put back on the board.",
    };
  }
  const first = res?.rejected?.[0];
  return failed(first?.detail ?? first?.reason);
}

/** rewrite · the title lands on the work item, not only on the projection. */
export async function rewriteTitle(id: string, title: string): Promise<ActOutcome> {
  const { data, error } = await supabase.rpc("board_update", { p_items: [{ id, title }] as never });
  if (error) return failed(error.message);
  const res = data as {
    ok?: boolean;
    applied?: Array<{ title_written_through_to_work_item?: string | null }>;
    rejected?: Array<{ reason?: string; detail?: string }>;
  };
  if (res?.ok) {
    const through = res.applied?.[0]?.title_written_through_to_work_item;
    return {
      ok: true,
      human: through
        ? "Rewritten. The work item carries the new wording too."
        : "Rewritten on the board. This row has no work item behind it, so there was nothing else to update.",
    };
  }
  const first = res?.rejected?.[0];
  return failed(first?.detail ?? first?.reason);
}

/** reschedule · a date moves for a reason, and the reason is stored with it. */
export async function reschedule(
  workId: string,
  newDue: string,
  reason: string,
): Promise<ActOutcome> {
  const { data, error } = await supabase.rpc("work_reschedule", {
    p_work: workId,
    p_new_due: newDue,
    p_reason: reason,
  });
  if (error) return failed(error.message);
  const res = data as { ok?: boolean; from_due?: string | null; to_due?: string; direction?: string };
  if (!res?.ok) return failed();
  return {
    ok: true,
    human:
      res.from_due
        ? `Moved from ${res.from_due} to ${res.to_due}. The move is on the record with your reason.`
        : `Dated ${res.to_due}. The date is on the record with your reason.`,
  };
}

/** not mine · disposes the work item with a reason. Nothing vanishes without one. */
export async function notMine(workId: string, reason: string): Promise<ActOutcome> {
  const { data, error } = await supabase.rpc("work_dispose", {
    p_work: workId,
    p_disposition: "forgotten",
    p_reason: reason,
    p_principal_acts: false,
  });
  if (error) return failed(error.message);
  const res = data as { ok?: boolean };
  if (!res?.ok) return failed();
  return { ok: true, human: "Taken off your board with your reason attached. It stays retrievable." };
}

/** say who acts · the answer to the question the board is flagging. */
export async function sayWhoActs(workId: string, principalActs: boolean): Promise<ActOutcome> {
  const { data, error } = await supabase.rpc("work_dispose", {
    p_work: workId,
    p_disposition: "tracked",
    p_principal_acts: principalActs,
  });
  if (error) return failed(error.message);
  const res = data as { ok?: boolean };
  if (!res?.ok) return failed();
  return {
    ok: true,
    human: principalActs
      ? "Recorded: you are the one who moves this."
      : "Recorded: someone else moves this. It stops asking you.",
  };
}

/** escalate · marks the surfacing itself as the defect, which is what repeated surfacing means. */
export async function escalate(id: string, note: string): Promise<ActOutcome> {
  const { data, error } = await supabase.rpc("board_update", {
    p_items: [{ id, urgent: true, urgent_reason: note }] as never,
  });
  if (error) return failed(error.message);
  const res = data as { ok?: boolean; rejected?: Array<{ reason?: string }> };
  if (res?.ok) return { ok: true, human: "Escalated. It stays visible regardless of how often it has shown." };
  return failed(res?.rejected?.[0]?.reason);
}
