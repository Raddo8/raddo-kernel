/** One way for the client surface to ask for something.
 *
 * THE WRITE LAW holds: this records a request. It does not perform the work,
 * and it never claims the work is done. The tenant is resolved server side by
 * `hq_request_action`; the browser never supplies a cid.
 */
import { supabase } from "@/integrations/supabase/client";

/** Exact confirmation lines. Copy is fixed so the surface never overpromises. */
export const REQUEST_FILED = "Your COB has it. Nothing here expires and nothing is late.";
export const REQUEST_ALREADY_OPEN = "Your COB already has this one.";

export type RequestResult = { ok: true; line: string } | { ok: false; line: string };

export async function requestAction(
  action: string,
  params: Record<string, unknown>,
  title: string,
): Promise<RequestResult> {
  const { data, error } = await supabase.rpc("hq_request_action", {
    p_action: action,
    p_params: params as never,
    p_title: title,
  });
  if (error) return { ok: false, line: "That ask did not reach your COB. Nothing has changed." };
  const row = (data ?? {}) as { already_open?: boolean };
  return { ok: true, line: row.already_open === true ? REQUEST_ALREADY_OPEN : REQUEST_FILED };
}
