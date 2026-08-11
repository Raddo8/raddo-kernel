/** The client's own verbs.
 *
 * `hq_act` is tenant-scoped inside the database and takes effect the moment
 * the client presses the button: nothing here files a request, and nothing
 * waits on their COB. The `human` sentence the function returns is written
 * for the client and is rendered verbatim.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ActResult {
  ok: boolean;
  action?: string;
  id?: string;
  changed?: number;
  before?: unknown;
  human: string;
  reason?: string;
}

const REASON_WORDS: Record<string, string> = {
  unauthenticated: "You are signed out. Sign in and this will work again.",
  not_yours: "That one is not on your record.",
  unknown_action: "That is not something this page can do.",
};

export async function hqAct(
  action: string,
  id: string,
  params: Record<string, unknown> = {},
): Promise<ActResult> {
  const { data, error } = await supabase.rpc("hq_act", {
    p_action: action,
    p_id: id,
    p_params: params as never,
  });
  if (error) {
    return { ok: false, human: "That did not go through. Nothing has changed." };
  }
  const row = (data ?? {}) as Partial<ActResult>;
  if (row.ok === true) {
    return { ...row, ok: true, human: row.human ?? "Done." } as ActResult;
  }
  const reason = String(row.reason ?? "");
  return {
    ok: false,
    reason,
    human: REASON_WORDS[reason] ?? "That did not go through. Nothing has changed.",
  };
}
