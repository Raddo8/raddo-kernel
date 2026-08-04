/**
 * UNIT 3 · ONE server path for naming a client's COB.
 *
 * The connector's set_chief_name tool and the Welcome Party rename both call
 * this. Names are DISPLAY ONLY and are keyed by CID: a rename touches exactly
 * one tenant row and never an identity key, so a hundred MIKEs stay separate.
 */

export type CobNameResult =
  | { ok: true; cob_name: string }
  | { ok: false; reason: "not-enrolled" | "name-too-short" | "save-failed" };

/** Display normalization only. Never used as a key. */
export function normalizeCobName(raw: unknown): string {
  return String(typeof raw === "string" ? raw : "")
    .replace(/[^\p{L}\p{N} '\u2019-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .toUpperCase();
}

/** Writes tenants.cob_name for ONE cid and records the setup step. */
export async function setCobName(admin: any, cid: string | null, raw: unknown): Promise<CobNameResult> {
  if (!admin || !cid) return { ok: false, reason: "not-enrolled" };
  const cobName = normalizeCobName(raw);
  if (cobName.length < 2) return { ok: false, reason: "name-too-short" };

  const { error } = await admin.from("tenants").update({ cob_name: cobName }).eq("cid", cid);
  if (error) {
    console.error("set_cob_name_failed", error.message);
    return { ok: false, reason: "save-failed" };
  }
  return { ok: true, cob_name: cobName };
}

/** TAYLOR's first words in the shared thread once the connector is live. */
export function taylorConnectorIntro(cobName: string | null, firstName: string | null): string {
  const who = firstName ? `Welcome, ${firstName}.` : "Welcome.";
  const named = cobName ? `Your COB is ${cobName}.` : "Your COB is ready to be named.";
  return [
    `${who} ${named} I am TAYLOR, and I set your COB up with you.`,
    "Next: connect your email, your calendar, and the databases your business runs on. That first pull is what stands up your HQ.",
    "Say the word and we start with email.",
  ].join(" ");
}

/**
 * DRY-RUN 2R5 · item 4. THE INTRO IS A RECEIPT, NOT A HOPE.
 *
 * The first-session intro used to be fire-and-forget, so on CID-100007 the
 * connector event landed and the greeting never did, silently. This posts,
 * reads the row back by id, retries once, and on final failure writes a
 * distinct connector_events row. It can still never throw into the caller.
 */
export async function postConnectorIntroVerified(
  admin: any,
  args: { cid: string; threadId: string; content: string; clientId?: string | null },
): Promise<{ ok: boolean; message_id: string | null; attempts: number }> {
  const attempt = async (): Promise<string | null> => {
    const { data, error } = await admin
      .from("taylor_messages")
      .insert({
        thread_id: args.threadId,
        cid: args.cid,
        role: "taylor",
        surface: "connector",
        content: args.content.slice(0, 8000),
      })
      .select("id")
      .maybeSingle();
    if (error || !data?.id) {
      console.error("connector_intro_insert_failed", error?.message ?? "no row returned");
      return null;
    }
    // READ BACK. An insert that reports success but cannot be read is a failure.
    const { data: back } = await admin
      .from("taylor_messages")
      .select("id")
      .eq("id", (data as any).id)
      .maybeSingle();
    return back?.id ? String(back.id) : null;
  };

  let attempts = 0;
  for (let i = 0; i < 2; i++) {
    attempts++;
    let id: string | null = null;
    try {
      id = await attempt();
    } catch (e) {
      console.error("connector_intro_exception", e instanceof Error ? e.message : String(e));
    }
    if (id) {
      try {
        await admin.from("connector_events").insert({
          cid: args.cid,
          event: "connector_intro_posted",
          surface: "connector",
          client_id: args.clientId ?? null,
          detail: { message_id: id, attempts },
        });
      } catch (_e) { /* the message landed; the receipt is best effort */ }
      return { ok: true, message_id: id, attempts };
    }
  }

  try {
    await admin.from("connector_events").insert({
      cid: args.cid,
      event: "connector_intro_failed",
      surface: "connector",
      client_id: args.clientId ?? null,
      detail: { thread_id: args.threadId, attempts },
    });
  } catch (_e) { /* nothing further to do; the failure row was the last resort */ }
  return { ok: false, message_id: null, attempts };
}
