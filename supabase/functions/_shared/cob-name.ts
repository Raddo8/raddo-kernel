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
