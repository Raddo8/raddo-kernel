// Plausible event wrappers for the "Introducing COB" hero carousel.
// Goal names must match the Plausible dashboard configuration.

export type HeroArchetype =
  | "raddo-ai"
  | "dossier-02"
  | "dossier-03"
  | "dossier-04"
  | "professional"
  | "executive"
  | "owner"
  | "enterprise";
export type HeroPanelDirection = "left" | "right" | "dot";

function track(name: string, props: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  window.plausible?.(name, { props });
}

export function fireHeroPanelView(archetype: HeroArchetype) {
  track("hero_panel_view", { archetype });
}

export function fireHeroPanelSwipe(
  from: HeroArchetype,
  to: HeroArchetype,
  direction: HeroPanelDirection,
) {
  track("hero_panel_swipe", { from, to, direction });
}

export function fireHeroPanelDwell(archetype: HeroArchetype, dwell_ms: number) {
  if (dwell_ms <= 0) return;
  track("hero_panel_dwell", { archetype, dwell_ms });
}

export function fireHeroCtaClick(archetype: HeroArchetype) {
  track("hero_cta_click", { archetype });
}
