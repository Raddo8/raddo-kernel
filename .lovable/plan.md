# WhereCobHelps — Interactive Word-Cloud Section

Full-width marketing section: heading · 100-word drifting cloud with magnifying-glass hover · subhead. Self-contained, no props.

## 100th word (locked)

**Process Improver**, slotted in the Operations group between `The Standardizer` and `Chief Strategy Officer`. Final count = 100. ✓

## Files

1. **`src/components/WhereCobHelps.tsx`** — new, default export.
2. **`src/components/Hero.tsx`** — one-line insert of `<WhereCobHelps />` immediately after the main hero section closes (after current line 1146 `</section>`), before the `{/* ====== EDITORIAL INDEX ====== */}` block. Import added at top with existing component imports.

Existing tokens cover everything: `raddo-paper`, `raddo-paper-edge`, `raddo-ink`, `raddo-brass`. No CSS/Tailwind config changes.

## Layout

```text
┌──────────────────────────────────────────────────┐
│  "Where can COB help?"  (centered)               │
│  font-display 56/36 · weight 400 · ink · -0.02em │
│  mb-16                                           │
├──────────────────────────────────────────────────┤
│  ╔══════════════════════════════════════════╗    │
│  ║ paper bg + SVG grain @ 10%, multiply     ║    │
│  ║ 100 drifting words (left/top anchored)   ║    │
│  ║ brass lens follows cursor (desktop)      ║    │
│  ║ height: min(600px, 70vh), min 480px      ║    │
│  ╚══════════════════════════════════════════╝    │
│  mt-16                                           │
│  Subhead (Fraunces 24/18, ink @ 0.75, 720px)     │
└──────────────────────────────────────────────────┘
```

Canvas is full-width (escapes the 1240px container) with top/bottom hairline borders in `raddo-paper-edge` — keeps the editorial banking feel and visually separates from the hero above and editorial index below.

## Component architecture

All per-frame state in **refs**; the loop writes inline `style` directly to DOM nodes — zero React renders during animation.

```text
WhereCobHelps
├── wordsRef          shuffled list of 100 strings (module-level RAW_WORDS)
├── containerRef      canvas <div>
├── itemRefs          (HTMLDivElement | null)[]   // each word
├── lensRef           brass lens <div>
├── stateRef          WordState[]   {x,y,vx,vy,w,h,scale,opacity}
├── cursorRef         {x,y,active}
├── lensPosRef        {x,y} lerped follower
├── tapRef            {x,y,until} | null   (mobile tap epicenter)
├── sizeRef           {w,h} container size from ResizeObserver
├── isTouchRef        matchMedia('(hover: none)')
├── reducedRef        matchMedia('(prefers-reduced-motion: reduce)')
├── visibleRef        IntersectionObserver pauses loop off-screen
├── rafRef            current rAF id
└── underlineLeaderRef  index of currently-underlined leader (-1 if none)
```

### Init (useLayoutEffect)

1. Read `hover: none` and `prefers-reduced-motion: reduce`.
2. ResizeObserver triggers `repack()`. Initial call on mount.
3. `repack()`:
   - For each word ref: reset transform → `getBoundingClientRect()` to read rest bbox.
   - Place via greedy AABB rejection, ≤250 attempts/word with 8px padding; best-effort if exhausted (effectively never with 100 words in 600px tall canvas at 16px serif).
   - Assign velocity: random angle, speed ∈ [8,20] px/s. Zero speed under reduced-motion.
4. IntersectionObserver toggles `visibleRef`.

### rAF loop

Per frame, clamped `dt ≤ 33ms`:

1. **Drift** + edge bounce (account for `w/h`).
2. **Collision separation**: O(n²) AABB · resolve along smaller-overlap axis · 100 words ≈ 10k cheap ops, fine on mid-tier hardware.
3. **Epicenter**: cursor (desktop, when `active`) or tap (mobile, while `now < tap.until`).
4. **Target scale/opacity** per word (smoothstep over distance):
   - `d ≤ 60`: scale 3.0, opacity 1.0
   - `60 < d ≤ 180`: smoothstep interpolation toward 1.0/0.45
   - `d > 180` or no focus: scale 1.0, opacity 0.45
5. **Lerp** current → target with factor 0.15 (instant snap under reduced-motion).
6. **Write to DOM**: `el.style.transform = translate3d(x,y,0) scale(s)` · `el.style.opacity = o`.
7. **Leader underline**: single max-scaled word (only if `scale > 1.05`) gets `data-leader="true"`; rendered via a scoped `<style>` block with a brass `::after` hairline transitioning opacity + scaleX over 220ms with the brand curve.
8. **Lens follow** (desktop only): lerped position, fade opacity on enter/leave with 220ms brand-curve transition.

### Pointer handlers

- `onPointerEnter/Move` (desktop): write cursor coords relative to canvas; `active = true`.
- `onPointerLeave`: `active = false` → epicenter clears → words relax via lerp.
- `onPointerDown` (touch): if `e.target.dataset.word === "1"` set `tapRef` for 1.5s; otherwise clear (tap-to-relax).
- Container `cursor: none` on hover-capable; `default` on touch.

### Brass lens

40×40 absolute div: `border-radius: 9999px`, `background hsl(--raddo-brass / 0.18)`, `1px hsl(--raddo-brass / 0.55)` border, inset paper ring for the lens-glass feel, `pointer-events: none`. Hidden on touch.

### Paper grain

Inline SVG `feTurbulence` (`baseFrequency 0.9`, `numOctaves 2`, stitched), 200×200 repeated, multiply-blend at 10% opacity. No external asset.

## Accessibility

- `<section aria-labelledby="where-cob-helps-heading">`.
- Real `<h2>` for the heading.
- Decorative canvas: each word div remains visible but the full word list is mirrored in a visually-hidden `<ul>` for SR.
- `prefers-reduced-motion: reduce` → velocity 0, instant lerp (factor 1), no lens fade, no underline transition. Cursor proximity still magnifies (informational, not decorative).

## Performance

- Refs + direct DOM writes — 0 React renders/frame.
- `will-change: transform` on words and lens.
- IntersectionObserver pauses loop when offscreen.
- O(n²) collisions = ~10k ops/frame at n=100. Comfortable on mid-tier laptops & recent iPhones.
- Pointer sampling event-driven; per-frame math gated by rAF.

## Acceptance check (post-build, manual)

1. All 100 words drifting languidly at idle.
2. Hover → brass lens appears, words magnify smoothly, single leader underlined in brass.
3. Cursor glide produces fluid magnification (no snap).
4. Leave canvas → relax to 16px / 0.45 opacity within ~500ms.
5. Touch device: no lens, tap word amplifies it + neighbors for 1.5s, tap empty resets.
6. Resize → re-pack without overflow.
7. `prefers-reduced-motion: reduce` → static positions, instant magnification.

## Brand compliance

- Palette: only `raddo-paper`, `raddo-paper-edge`, `raddo-ink`, `raddo-brass` via existing HSL tokens.
- Type: Fraunces only.
- Brass used only as accent (lens tint, leader underline). Never on body.
- Motion: brand curve `cubic-bezier(0.22, 1, 0.36, 1)` on every transition. No looping ornament — drift is functional (it is the content), not decoration.
- No banned phrases, no AI/magic copy.

## Out of scope

- Plausible telemetry (no event spec given for this section).
- Real cursor-on-touch lens (intentionally desktop-only per spec).
- Per-word click navigation.
