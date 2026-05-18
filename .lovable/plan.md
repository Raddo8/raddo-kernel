## Goal

Add a new top-of-fold "Introducing COB" section ABOVE the existing hero in `src/components/Hero.tsx`. The current hero (BriefingDossier, headline, CTAs, mandala asset, COB rotator) stays pixel-identical. New section is a 4-panel sliding carousel with mandatory telemetry, archetype-tagged consult CTA, and brand-locked aesthetic.

## Files to add

1. **`src/components/IntroducingCob.tsx`** (new) — self-contained section component. Owns its own state, motion, telemetry, accessibility. Exports `IntroducingCob`. No props.

2. **`src/lib/panel-telemetry.ts`** (new) — thin wrapper around `window.plausible` with typed event signatures for the four hero panel events. Centralizes goal names so they match the Plausible dashboard exactly.

## Files to modify

1. **`src/components/Hero.tsx`** — single insertion only: import `IntroducingCob`, render it as the first child inside `<main>` after the grain overlay and `<SiteHeader />` and BEFORE the existing `{/* ====== HERO ====== */}` section. No other lines touched. SeoHead, grain, header, existing hero section all unchanged.

## IntroducingCob structure

```text
<section role="region" aria-roledescription="carousel" aria-label="Introducing COB">
  <eyebrow>INTRODUCING COB</eyebrow>            // small caps, brass, tracked
  <h1 font-display>What if your toughest decisions had already been solved?
                    Even before you knew about them.</h1>
  <carousel-viewport>                            // overflow-hidden, fixed aspect
    <track style="transform: translateX(-index * 100%)">
      <panel × 4>
        <archetype-eyebrow/>                     // brass small caps
        <scenario font-display/>                 // Fraunces, same scale as h1
        <placeholder-figure/>                    // 4:5 mobile, 16:10 desktop
      </panel>
    </track>
    <edge-button left/> <edge-button right/>     // desktop hover only
  </carousel-viewport>
  <dot-pagination/>                              // 4 dots, current=brass
  <a href="/consult?archetype={slug}">Begin the consult</a>
</section>
```

Section background: `bg-raddo-paper`. Container width matches existing hero (`max-w-[1240px]`, same horizontal padding). Vertical padding: `pt-16 pb-12 md:pt-24 md:pb-16` so the existing hero still breathes below.

## Panel content (verbatim, locked)

Stored as a const `PANELS` array of `{ slug, label, scenario, imageAlt, tone }`. Slugs: `professional | executive | owner | enterprise`. Copy exactly as specified in the dispatch — no paraphrasing, "Remember" frame preserved.

## Placeholders (no AI imagery, no stock)

`PlaceholderFigure` component renders a solid warm-tone block, one per archetype:

- professional → dawn cream `hsl(var(--raddo-paper))` with subtle ink hairline border
- executive    → dusk ink `hsl(var(--raddo-ink-deep))` with paper text
- owner        → lamp brass `hsl(var(--raddo-brass))` at low saturation overlay on paper
- enterprise   → atrium ivory (paper tinted slightly cooler)

Centered inside: a small framed caption box (1px ink hairline, 4px radius) holding the alt-text string. Aspect ratio: `aspect-[4/5] md:aspect-[16/10]`. Dev-only `// PLACEHOLDER //` chip in JetBrains Mono, positioned top-left, gated by `import.meta.env.DEV` (Vite equivalent of `NODE_ENV !== "production"`).

Lazy loading: only the active panel's figure mounts eagerly. Adjacent panels prefetch via `requestIdleCallback` (fallback `setTimeout`) — since placeholders are CSS-only this is mostly a no-op, but the hook is in place so commissioned images later inherit the behavior.

## Interaction

- State: `const [index, setIndex] = useState(0)` + `const [direction, setDirection] = useState<"left"|"right"|"dot">("right")`.
- Mobile swipe: framer-motion `drag="x"` with `dragConstraints={{left:0,right:0}}` and `onDragEnd` thresholding `offset.x` / `velocity.x` to commit a panel change.
- Desktop arrow keys: a single `onKeyDown` handler on the carousel region — `ArrowLeft`, `ArrowRight`, `Home`, `End`. Region is `tabIndex={0}` with a brass focus ring matching existing tokens.
- Edge buttons: `Button variant="ghost" size="icon"` with `lucide-react` ChevronLeft/Right, `aria-label="Previous panel" / "Next panel"`, visible on `group-hover` at md+ breakpoints only.
- Dots: `<button>` per index, `aria-label="Go to {label} panel"`, `aria-current={i===index}`. Active dot brass-filled, inactive ink-soft outline.
- Auto-advance: disabled. No timer anywhere.
- Transition: 400ms `cubic-bezier(0.22, 1, 0.36, 1)` on the track's `transform`. `prefers-reduced-motion` → 0ms (snap), via existing `useReducedMotion()` from framer-motion.
- No layout shift: viewport has a fixed aspect ratio and the headline/eyebrow are above-the-track (not per-panel), so panel switches never reflow the page. CLS = 0.

## Telemetry pattern (built FIRST)

`src/lib/panel-telemetry.ts`:

```text
type Archetype = "professional" | "executive" | "owner" | "enterprise";
export const fireHeroPanelView   = (a: Archetype) => window.plausible?.("hero_panel_view",  { props: { archetype: a } });
export const fireHeroPanelSwipe  = (from, to, direction) => window.plausible?.("hero_panel_swipe", { props: { from, to, direction } });
export const fireHeroPanelDwell  = (a, dwell_ms) => window.plausible?.("hero_panel_dwell", { props: { archetype: a, dwell_ms } });
export const fireHeroCtaClick    = (a: Archetype) => window.plausible?.("hero_cta_click",  { props: { archetype: a } });
```

Wiring inside `IntroducingCob.tsx`:

- **view (>1.5s in viewport)**: `IntersectionObserver` on the carousel viewport at `threshold: 0.5`. When the active panel enters and stays for 1500ms (tracked via `setTimeout` cleared on exit or index change), fire `hero_panel_view` once per (panel × mount). De-dupe via `Set<Archetype>` ref so re-entering the same panel after dwell-out doesn't re-fire in the same session.
- **swipe**: in the index-change committer (whether from keys, drag, dot, or button), call `fireHeroPanelSwipe(fromSlug, toSlug, direction)` BEFORE updating state. Direction source: keys/buttons → "left"|"right", dots → "dot", drag → derived from sign of `offset.x`.
- **dwell**: track `enterMs` in a ref when index changes or panel becomes visible. On the next index change OR when the section scrolls out of view OR on `pagehide`, fire `hero_panel_dwell` with `Date.now() - enterMs`. Use `visibilitychange` + `pagehide` listeners cleaned up on unmount.
- **cta click**: `onClick` handler on the consult link calls `fireHeroCtaClick(PANELS[index].slug)` then uses react-router `navigate(`/consult?archetype=${slug}`)`. Use `useNavigate` rather than a raw `<a>` so SPA navigation works and the event fires reliably before route change.

All four events visible in DevTools → Network → filter `plausible.io`.

## CTA wiring

```text
const navigate = useNavigate();
const slug = PANELS[index].slug;
<Button
  variant="default"
  className="bg-raddo-brass text-raddo-ink-deep hover:bg-raddo-brass-deep hover:text-raddo-paper"
  onClick={() => { fireHeroCtaClick(slug); navigate(`/consult?archetype=${slug}`); }}
>
  Begin the consult
</Button>
```

Brass-only per doctrine. Consult page does not consume the param yet — out of scope.

## Brand compliance checks

- Palette: only `raddo-paper`, `raddo-paper-edge`, `raddo-ink`, `raddo-ink-deep`, `raddo-ink-soft`, `raddo-brass`, `raddo-brass-deep`, `raddo-ash` via existing HSL tokens. No arbitrary colors.
- Type: Fraunces for eyebrow-meta-headline AND scenario copy (equal hierarchical weight as specified). Inter for the CTA label. JetBrains Mono only for the dev placeholder chip.
- Radius: 4px on figure frame and dots, 8px on the CTA. Nothing else.
- Shadow: none on figures (placeholders), max 4px on CTA hover.
- Motion: single 400ms curve, no looping, no spinners, no ornament.
- No banned phrases. No "AI", no "magic", no tier numbers. Internal-doctrine comments in JSX kept as `{/* ... */}` source comments, never rendered.

## Accessibility

- `role="region"` `aria-roledescription="carousel"` `aria-label="Introducing COB"` on the section.
- Each panel: `role="group"` `aria-roledescription="slide"` `aria-label={archetype label}` `aria-hidden={i !== index}` so screen readers skip inactive slides.
- Inactive slides also get `inert` (when supported) to remove from tab order.
- Carousel viewport `tabIndex={0}` with visible focus ring (brass, 2px).
- Dots are real `<button>` elements with `aria-current`.
- Edge buttons have `aria-label`s and are reachable via keyboard.
- `prefers-reduced-motion`: track transform updates instantly (no transition), drag still allowed (user gesture, not motion design).
- Color contrast: ink-deep on paper ≈ 11:1; brass eyebrow at 14px+ uppercase tracked treated as decoration but also paired with ink-deep scenario text so meaning never lives in brass alone.

## Acceptance verification (post-build)

- Visual: new section is first viewport, existing hero unchanged below.
- Diff scope: `Hero.tsx` shows only an `import` line and one `<IntroducingCob />` render line added.
- DevTools: Network filter `plausible.io` shows the four event names firing under the right interactions.
- Keyboard-only walkthrough advances panels and reaches the CTA.
- DevTools device-emulator swipe advances panels on mobile widths.
- `prefers-reduced-motion: reduce` → instant transitions confirmed.
- Lighthouse mobile run captured and reported.

## Out of scope (confirmed)

- Any change to BriefingDossier, BriefingComposition, current headline, current CTAs, mandala, COB rotator.
- `/consult` page reading `?archetype=`.
- Real diorama imagery.
- A/B harness for "Remember" vs "Imagine".
- Pricing references on the hero.

## Technical notes (for your reference)

- `IntersectionObserver`, `requestIdleCallback`, `visibilitychange`, `pagehide` all guarded for SSR/older browsers (`typeof window !== "undefined"`, feature checks).
- `window.plausible` type already declared in `src/vite-env.d.ts` — no new ambient types needed.
- Dev placeholder gate uses `import.meta.env.DEV` (Vite), not `process.env.NODE_ENV`, so it tree-shakes out of the production bundle cleanly.
- Carousel uses CSS `transform: translateX` on a flex track rather than mounting/unmounting panels — keeps `IntersectionObserver` stable and CLS at 0.
- Drag handler uses framer-motion's `PanInfo` not raw pointer events for momentum + velocity.
