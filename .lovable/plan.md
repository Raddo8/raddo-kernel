# RolesIndex — "The Collapse" → "The Index" (v3 · build-ready)

Greenlit. Two refinements from v2:

1. **Scattered-state labels** bumped to Inter 13/20 at opacity 0.88 (was 12/18 @ 0.7). The 30-second visitor must be able to actually read role titles in the scattered state for the headline to land.
2. **"Your COB" marker** sized to ~46px total: 8px brass filled circle + 6px gap + Fraunces 16/22 weight 700 label `Your COB` in `raddo-ink-deep`, with a 16px brass hairline rule beneath. The consolidated entity lands with weight — 150 lenses just streamed into it.

Everything else in v2 ships as-spec'd.

## Surface

New `src/components/RolesIndex.tsx`, default export. Mounted in `src/components/Hero.tsx` between line 1147 `</section>` and line 1149 `{/* ====== EDITORIAL INDEX ====== */}` via one import + one JSX line. No props.

Palette: `raddo-paper`, `raddo-paper-edge`, `raddo-ink`, `raddo-ink-deep`, `raddo-ash`, `raddo-brass` only. Fraunces for headlines + "Your COB" label. Inter for everything else (tabular nums on the "150" in the eyebrow).

## Copy (locked)

| Slot | String | Type |
| --- | --- | --- |
| Eyebrow | `INDEX · 150 EXECUTIVE LENSES · ONE COB` | Inter 11/16, tracked +0.14em, `raddo-ash` |
| Scattered headline | `Right now you'd need 150 of these.` | Fraunces 44/52, weight 700, `raddo-ink-deep` |
| Resolved headline | `One COB. Every lens.` | same spec — crossfades in t=1000–1400 |
| Marker label | `Your COB` | Fraunces 16/22, weight 700, `raddo-ink-deep` |

## Resolved layout

```text
┌───────────────────────────────────────────────────────────────┐
│  ── brass hairline rule ──                                    │
│  INDEX · 150 EXECUTIVE LENSES · ONE COB                       │
│                                                               │
│  One COB. Every lens.                                         │
│                                                               │
│                    ● Your COB                                 │
│                    ───────────                                │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  EXECUTIVE                                              │  │
│  │  Chief Executive Officer       Chief Operating Officer  │  │
│  │  ...                                                    │  │
│  │  OPERATING                                              │  │
│  │  ...                                                    │  │
│  │  FUNCTIONAL                                             │  │
│  │  ...                                                    │  │
│  │  ADVISORY                                               │  │
│  │  ...                                                    │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ── brass hairline rule ──                                    │
└───────────────────────────────────────────────────────────────┘
```

- 3 columns ≥1024px · 2 columns 640–1023px · 1 column <640px.
- Band labels Inter 11/16 tracked +0.12em, `raddo-ash`, with 1px `raddo-paper-edge` rule under each.
- Role titles Inter 13/20 weight 400, `raddo-ink-deep`. Alphabetised within band.
- 88% width mobile · max 1240px desktop · 96px vertical section padding.
- "Your COB" marker centred between resolved headline and Index.

## Scattered state spec (pre-collapse · what the visitor sees first)

- 150 role labels scattered across the canvas in a loose org-chart spread (rough hierarchy: CEO/Chairman near top, VPs mid, Heads/Directors lower — not strict, just suggestive).
- **Labels: Inter 13/20, weight 400, `raddo-ink-deep` at opacity 0.88.** Readable on first glance.
- Each label connected to the central "Your COB" node by a 1px brass hairline (SVG `<line>`, opacity 0.32).
- Central node during scattered state: same 8px brass dot + Fraunces 16 `Your COB` label, sitting at the geometric centre of the canvas.
- Scattered headline `Right now you'd need 150 of these.` sits above the canvas.
- Canvas height: clamped so all 150 labels render without horizontal overflow; ~640px desktop / scales down on mobile. Labels jitter-positioned via deterministic seeded RNG (consistent across mounts; not animated).

## Collapse choreography (one-shot · ~1600ms · brand curve `cubic-bezier(0.22, 1, 0.36, 1)`)

Triggered by IntersectionObserver when section crosses 35% of viewport.

```text
t=0       Scattered state visible · brass connectors at full opacity 0.32
t=0..400  Connectors retract toward centre via stroke-dashoffset
t=200..1200  Labels glide (FLIP) to their Index slots · no stagger
t=1000..1400 Scattered headline crossfades to resolved headline
             "Your COB" node translates+scales from central scattered
             position to its persistent post-Index marker position
             (transform only · never opacity 0)
t=1200..1600 Band labels + column rules fade in · 100ms stagger
             Executive → Operating → Functional → Advisory
t=1600    Resolved state · no further motion ever
```

Implementation: FLIP. Resolved Index is DOM source of truth; on mount we measure final rects, apply inverse transforms for scattered start, animate to identity via Web Animations API. The "Your COB" marker is one DOM node animated by transform — never unmounted, never opacity-zeroed.

## Reduced-motion / mid-page-load fallback

Resolved state on first paint when ANY of:

1. `prefers-reduced-motion: reduce`
2. Section already past trigger threshold on mount
3. IntersectionObserver unsupported

Scattered headline never shows in this case; resolved headline + marker render directly.

## Data

`src/lib/roles-index-data.ts` — new:

```ts
export type RoleBand = "executive" | "operating" | "functional" | "advisory";
export interface Role { title: string; band: RoleBand; }
export const ROLES: Role[]; // 150 entries
export const BAND_META: Record<RoleBand, { label: string; order: number }>;
```

Band classification (final counts):

- **Executive** (16): CEO, COO, Chief of Staff, President, EVP, SVP, VP, Managing Director, General Manager, Division President, Regional President, Managing Partner, General Partner, Operating Partner, Principal, Group Head.
- **Operating** (20): Chief Admin, Supply Chain, Manufacturing, Logistics, Quality, Process, Performance, Project, Program, Workplace, Facilities, Real Estate, Retail, Merchandising, Safety, Chief Engineer, Head of Operations, VP Operations, Director of Operations, Plant Manager.
- **Functional** (104): Finance & capital (23), Strategy & growth (11), Revenue (12), Marketing & comms (12), People (12), Tech/product/data (17), Legal/compliance/risk (11), Science/research/sustainability (6).
- **Advisory** (10): Chairman, Vice Chairman, Board Chair, Lead Director, Board Director, Independent Director, Senior Advisor, Strategic Advisor, Executive Advisor, Corporate Secretary.

Total: 150. No `annotation` field in v1. No dev-time empty-annotation assertion. Dev-only console warn if `ROLES.length !== 150`.

## Phase 2 (parked)

Per-role hover/focus annotation layer · 150 sentences · added by extending the `Role` interface with an `annotation` field and wiring a single hover panel. Component remains structurally identical.

## Accessibility

- `<section aria-labelledby="roles-index-heading">` · real `<h2>` carrying the resolved headline (`One COB. Every lens.`). Scattered headline is a separate `<p>` swapped in/out — SR users with reduced-motion get only the resolved h2.
- Eyebrow: `<p>`.
- Bands: `<section aria-labelledby="band-{key}-heading">` with `<h3>`.
- Roles: `<ul role="list">` of static `<li>` (no buttons in v1).
- "Your COB" marker: `<div role="img" aria-label="Your COB · the single entity performing all 150 lenses">`.
- All 150 role titles in static HTML, indexable.
- Collapse animation honours reduced-motion (skipped, not shortened).

## Performance

- 150 nodes, static after mount. No rAF loop.
- CSS transforms + opacity only during collapse.
- `content-visibility: auto` on the section.
- One-time IntersectionObserver, disconnects after fire.

## SEO

All 150 titles + both headlines + eyebrow in static HTML. Single H2. Bands as H3.

## Files

1. `src/components/RolesIndex.tsx` — new.
2. `src/lib/roles-index-data.ts` — new · 150 banded roles, no annotation field.
3. `src/components/Hero.tsx` — one import (top, with other component imports) + one JSX line after line 1147 `</section>`, before line 1149 editorial-index block.
4. `.lovable/plan.md` — replaced with this v3.

No CSS/Tailwind config changes. No new dependencies. Web Animations API + CSS transitions only.

## Brand compliance

- Palette ✓ · Type (Fraunces + Inter only) ✓ · Brass accent-only ✓
- Motion ≤1600ms, brand curve, reduced-motion honoured, no loops ✓
- Copy plain, declarative, function-first ✓
- No banned phrases · no anti-patterns ✓
- Customer-facing: `your COB` only · no internal mechanics ✓

## Acceptance check

1. First scroll into view: scattered org chart, 150 readable role labels at Inter 13/20 @ 0.88 opacity, brass hairlines to central `Your COB`, headline `Right now you'd need 150 of these.` above. Total ≤1700ms collapse · never re-runs.
2. Resolved state: print-quality 3-column editorial spread, 4 bands, 150 alphabetised roles, persistent 46px `● Your COB` marker above with brass underline.
3. Reduced-motion or mid-page load: resolved state immediately.
4. View source: all 150 titles + eyebrow + both headlines present.
5. No console warnings. No layout shift post-collapse.
6. 30-second skim test: eyebrow + scattered chaos + collapse + resolved Index communicates the entire point without interaction.
