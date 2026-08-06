/** HEAT AND VIEWS · shared rules for the HQ world surfaces.
 *
 * Heat is ATTENTION, not loss. It is painted on a brass scale, light to deep.
 * Red is reserved for a real clock: a dated deadline coming up, or something
 * already late. Nothing else on these surfaces may be red.
 *
 * The chosen view is remembered per client, in this browser only.
 */

export type HqView = "folders" | "grid" | "list";

export const HQ_VIEWS: Array<{ key: HqView; label: string; hint: string }> = [
  { key: "folders", label: "Folders", hint: "The cabinet, one folder open at a time" },
  { key: "grid", label: "Grid", hint: "Every folder as a card, hottest first" },
  { key: "list", label: "List", hint: "One table of every folder, click a heading to sort" },
];

const keyFor = (surface: string) => `cob.hq.view.${surface}`;

export function readView(surface: string, fallback: HqView = "folders"): HqView {
  try {
    const raw = window.localStorage.getItem(keyFor(surface));
    if (raw === "folders" || raw === "grid" || raw === "list") return raw;
  } catch {
    /* a browser with storage switched off simply gets the default */
  }
  return fallback;
}

export function writeView(surface: string, view: HqView): void {
  try {
    window.localStorage.setItem(keyFor(surface), view);
  } catch {
    /* nothing to do: the choice just is not remembered */
  }
}

/** Five steps of brass, light to deep. Never red. */
export function heatStep(heat: number | null | undefined): 0 | 1 | 2 | 3 | 4 | 5 {
  if (heat === null || heat === undefined || Number.isNaN(Number(heat))) return 0;
  const h = Number(heat);
  if (h >= 80) return 5;
  if (h >= 60) return 4;
  if (h >= 40) return 3;
  if (h >= 20) return 2;
  return 1;
}

export const heatClass = (heat: number | null | undefined): string => `heat h${heatStep(heat)}`;

/** Plain words for a score, so nobody has to read a number to understand it. */
export function heatWord(heat: number | null | undefined): string {
  switch (heatStep(heat)) {
    case 5:
      return "needs you most";
    case 4:
      return "needs you soon";
    case 3:
      return "worth a look";
    case 2:
      return "quiet";
    case 1:
      return "very quiet";
    default:
      return "not scored yet";
  }
}

/** The hover line: the reason the database wrote, or an honest absence. */
export function heatTitle(heat: number | null | undefined, why: string | null | undefined): string {
  const word = heatWord(heat);
  const reason = String(why ?? "").trim();
  if (!reason) return `${word}. Your COB has not written a reason for this yet.`;
  return `${word} \u00b7 ${reason}`;
}
