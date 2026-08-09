/** Possessive suffix for the COB name in the rail brand line.
 *
 * A name ending in S or s takes a bare apostrophe, everything else takes 'S.
 * The caller renders the returned string in brass, whole.
 */
export function possessiveSuffix(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  const last = trimmed.slice(-1).toLowerCase();
  return last === "s" ? "'" : "'S";
}

/** The full brass suffix as shown in the rail: possessive plus middot plus HQ. */
export function railSuffix(name: string | null | undefined): string {
  return `${possessiveSuffix(name)} \u00b7 HQ`;
}
