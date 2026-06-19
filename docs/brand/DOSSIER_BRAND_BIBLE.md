# Dossier Brand Bible
## `/dossier` · Design Aesthetic Doctrine

Authoritative reference for the visual, typographic, and compositional grammar of
`chiefofbusiness.ai/dossier`. This is the print-ready, hand-bound executive
document surface — the highest-gravitas page in the entire COB property.

> If a future build conflicts with this bible, **halt and flag** before
> shipping. The dossier is where the brand earns its register.

---

## 1 · Essence

The dossier is a **letterpress executive document** rendered in a browser.
It must feel like something a private bank, a Swiss watchmaker, and a senior
McKinsey partner would each recognize as "ours."

Three felt qualities, in order:

1. **Gravitas** · cream paper, navy ink, brass rule. Weight without noise.
2. **Stillness** · the page does not move. The reader does.
3. **Craft** · every rule, hairline, and overline is intentional. Nothing is
   decorative; everything earns its place.

**Anti-essence (reject on sight):** SaaS landing page, AI marketing deck,
gradient hero, glassmorphism, emoji, stock photography of laptops, dashboards,
spinners, or any motion that loops.

---

## 2 · Palette (locked)

Only these tokens. No new colors. No tints outside the listed opacities.

| Token | Hex | Role on /dossier |
|---|---|---|
| `raddo-paper` | `#FAF8F4` | Page background. Every section. |
| `raddo-paper-edge` | `#E5E3DE` | Hairlines, table dividers, card borders. |
| `raddo-ink-deep` | `#042C53` | Headlines, emphasized in-line `<strong>`, key labels. |
| `raddo-charcoal` | `#2C2C2A` | Body copy. |
| `raddo-ash` | `#5F5E5A` | Secondary body, captions, sub-deck under H2s. |
| `raddo-brass` | `#EF9F27` | Hairline accents, middot separators, CTA fill. |
| `raddo-brass-deep` | `#854F0B` | Overlines, exhibit labels, capability group titles. |
| `raddo-night` | `#0A0A0C` | Reserved exclusively for the vault-exhibit frame. |
| `white` | `#FFFFFF` | Figure mat inside `border-raddo-paper-edge` frames only. |

Approved opacity uses: `bg-raddo-brass/40` for hairline rules,
`bg-raddo-paper/90` for the sticky header backdrop. No others.

**Forbidden on /dossier:** any blue that is not `ink-deep` / `ink-soft`,
any gradient, any shadow heavier than `shadow-sm`, any color introduced from
outside the RADDO palette.

---

## 3 · Typography

Two families. No third. Ever.

### Fraunces (display)
- **Use:** H1 (page 1 hero), H2 (every section opener), folder titles on page 4.
- **Weight:** `font-bold` (700) — never lighter on this page.
- **Sizes:**
  - H1 hero · `text-5xl lg:text-7xl`, `leading-[1.05]`
  - Section H2 · `text-4xl lg:text-5xl`, `leading-tight`
- **Color:** always `text-raddo-ink-deep`.

### Inter (sans / body)
- **Body paragraphs:** `text-lg lg:text-xl`, `leading-relaxed`,
  `text-raddo-charcoal`.
- **Dense body (vault, capabilities):** `text-base lg:text-lg`.
- **Sub-deck under H2:** `text-lg text-raddo-ash`.
- **In-line emphasis:** `<strong className="text-raddo-ink-deep font-bold">`
  for the one or two phrases per page that must land. Bold is rare and earned.

### JetBrains Mono (system — utility only)
Used **only** for overlines, exhibit labels, capability group titles, and the
header wordmark. Always uppercase, always `tracking-[0.22em]` (or `[0.18em]`
for `text-[10px]` micro-labels), always at `text-xs` or smaller.

**Tabular numerals** required anywhere numbers carry meaning.

---

## 4 · The middot doctrine (binding)

The dossier uses the middot (`·`) as its only separator. **Never em-dashes.
Never en-dashes. Never hyphens in prose separators.** This is the page's
audible signature; breaking it breaks the brand.

Pattern: `word <space>·<space> word`.

Brass middot inside mono overlines:
```tsx
dossier 03 <span className="text-raddo-brass">·</span> what is COB
```

The middot also appears as the **center bead** of every brass hairline.

---

## 5 · The brass hairline (signature element)

The single most repeated motif on /dossier. It is the page's heartbeat.

```tsx
<div className="flex items-center gap-2">
  <span className="h-px flex-1 bg-raddo-brass/40" />
  <span className="h-1.5 w-1.5 rounded-full bg-raddo-brass" />
  <span className="h-px flex-1 bg-raddo-brass/40" />
</div>
```

Rules:
- One hairline closes every section (`mt-16` from the last block).
- One optional hairline mid-section, separating a thesis block from an exhibit
  (`my-10`).
- Never two hairlines back-to-back. Never a hairline without breathing room
  above and below (minimum `mt-10`/`mb-10`).
- The bead is always solid `raddo-brass`; the rules are always `brass/40`.
  No other opacities.

---

## 6 · The overline pattern

Every section begins with a mono overline naming the dossier number and label:

```tsx
<p className="font-mono text-xs uppercase tracking-[0.22em] text-raddo-brass-deep mb-6">
  dossier 04 <span className="text-raddo-brass">·</span> engineered differently
</p>
```

- Color: `raddo-brass-deep` (the burnt copper), never `raddo-brass` (the
  bright accent) — bright brass is reserved for the middot itself.
- `mb-6` to the H2 below. Always.
- The dossier number is the section's identity. Sections are numbered
  sequentially 01, 02, 03 … and the number is **part of the visual**.

Exhibit labels follow the same construction with a different lede:
`exhibit · 01 · the ten source vault`.

---

## 7 · Page rhythm & layout

### The `Page` wrapper (binding contract)
Every section after the hero uses:
```tsx
<section className="dossier-page bg-raddo-paper text-raddo-charcoal
                    px-6 sm:px-12 lg:px-24 py-16 lg:py-24">
  <div className="mx-auto max-w-5xl">{children}</div>
</section>
```

- **Max width:** `max-w-5xl` (64rem). Never wider. Body comfort over fill.
- **Vertical rhythm:** `py-16 lg:py-24`. This generous breathing room *is* the
  gravitas — do not compress it on desktop.
- **Horizontal gutters:** `px-6 sm:px-12 lg:px-24`. The widening gutters at
  desktop create the "matted print" effect.

### The standard section recipe
1. Overline (`mb-6` → H2)
2. H2 (`mb-8`–`mb-10` → body)
3. Body block (`space-y-5` or `space-y-6`)
4. Optional figure / exhibit (`mb-10`–`mb-12`)
5. Optional grid (vault legend, capabilities, folders)
6. Closing brass hairline (`mt-16`)

### Section break
On screen: a soft visual pause via brass hairline + page padding.
On print: `page-break-after: always` — one section = one Letter page,
`@page { margin: 0.5in }`. The dossier is engineered to print as a bound
document; never break this.

---

## 8 · Figures, frames & exhibits

Two figure treatments, no others:

**Mat frame** (most figures):
```tsx
<figure className="border border-raddo-paper-edge bg-white p-2 shadow-sm">
  <img className="block w-full h-auto object-cover" />
</figure>
```
The `bg-white` matte plus `p-2` border creates the museum-card effect.
`shadow-sm` is the maximum allowed shadow on /dossier.

**Vault frame** (the one exception):
```tsx
<div className="border border-raddo-paper-edge rounded-sm overflow-hidden bg-raddo-night">
  <img className="block w-full h-auto" />
</div>
```
`bg-raddo-night` is permitted **only** for the vault exhibit because the
artifact itself is photographed on black. Nowhere else on /dossier.

### Imagery rules
- Use only assets in `src/assets/dossier/` and the approved vault image.
- Photographic subjects only: diorama vignettes, chessboards, vaults,
  trade-show miniatures, hospitality tabletops, fire patios.
- No faces. No screenshots. No UI mockups. No icons (mono labels do that job).

---

## 9 · The eight-folder grid (page 4 grammar)

The "Engineered differently" page is the dossier's structural showpiece.

- Grid: `grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10`
- Each article: mono `n` chip, brass middot, Fraunces title, Inter body.
- Titles are **lowercase** (`built for you`, `personality`, `alignment`…) —
  this is intentional and part of the dossier voice. Do not title-case them.
- Body copy uses the middot doctrine ruthlessly: every separator is `·`.

---

## 10 · The capability grid (page 3 grammar)

- Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-6`.
- Group title: mono micro-label in `raddo-brass-deep`.
- Items: `text-sm font-sans text-raddo-ink-deep`, one per line, no bullets,
  no dashes. List-without-list-markers is the look.

---

## 11 · Borders, radii, shadows

- **Border:** `border-raddo-paper-edge` only. 1px. No thicker borders.
- **Radius:** `rounded-sm` (2px) on the vault frame only. Everywhere else the
  dossier is **square** — no radius. This is non-negotiable; soft corners
  break the print register.
- **Shadow:** `shadow-sm` maximum, used only on `<figure>` mat frames.
  No drop shadows on text, buttons, or sections.

---

## 12 · The print contract

The browser view is one half of the deliverable. The PDF is the other.
Both must be brand-correct.

```css
@media print {
  @page { size: Letter; margin: 0.5in; }
  html, body { background: #FAF8F4 !important; }
  .dossier-no-print { display: none !important; }
  .dossier-page {
    page-break-after: always;
    padding: 0.25in 0.5in !important;
    min-height: auto !important;
  }
  .dossier-page:last-child { page-break-after: auto; }
  img { max-width: 100% !important; }
}
```

Rules:
- Header (`Download PDF` button, wordmark) is `.dossier-no-print`.
- Backgrounds must force-print (`!important` on `body` background).
- One section = one page. Never let a section orphan across pages.

---

## 13 · The header (sticky chrome)

```tsx
<header className="dossier-no-print sticky top-0 z-30
  border-b border-raddo-paper-edge bg-raddo-paper/90 backdrop-blur">
```

- 8 × 8 `logo3d` mark, then mono wordmark
  `chief of business · dossier` in `raddo-ink-deep`.
- One CTA only: the brass `Download PDF` button. Brass fill, ink-deep label,
  `hover:bg-raddo-brass-deep hover:text-raddo-paper`. Never blue. Never
  outlined. Never another CTA on this page.

---

## 14 · Motion

**None.** The dossier does not animate.

- No fade-in on scroll. No parallax. No hover lifts.
- The only permitted micro-interaction is the button color swap on hover
  (220ms, `cubic-bezier(0.22, 1, 0.36, 1)`).
- `prefers-reduced-motion`: no-op (there is nothing to reduce).

Stillness is the design.

---

## 15 · Voice on this surface

The dossier voice is more measured than the marketing site. It is written as
if signed by a senior partner.

- Sentences are short to medium. No throat-clearing.
- The word "you" / "your" is the only second-person allowed.
- "your COB" is the canonical product reference. Lowercase "your," uppercase
  "COB." Never "the COB," never "our AI."
- Adjective economy: at most one adjective per noun. Cut the second.
- Numbers in copy use tabular figures and are written numerically when they
  carry weight (`two weeks`, not `fourteen days`, but `110%` not `one hundred
  and ten percent`).

### Banned on /dossier (in addition to project-wide bans)
- "AI" (use "COB," "operator," "intelligence")
- "Powered by," "seamless," "magic," "unlock," "leverage"
- Any em-dash or en-dash anywhere in body copy
- "Click here," "learn more," any CTA verb beyond `Download PDF`
- Exclamation marks
- Emoji

---

## 16 · Quick-reference checklist (pre-ship gate)

Run this before merging any change to `/dossier`:

- [ ] Every section opens with a mono overline `dossier NN · label`.
- [ ] Every section closes with a brass hairline.
- [ ] Every separator in prose is a middot `·`, never `—` or `–`.
- [ ] H1/H2 are Fraunces `font-bold`, `text-raddo-ink-deep`.
- [ ] Body is Inter, `text-raddo-charcoal`, `leading-relaxed`.
- [ ] No color outside the §2 palette.
- [ ] No shadow heavier than `shadow-sm`.
- [ ] No border radius except `rounded-sm` on the vault frame.
- [ ] All figures use the mat-frame recipe (or the vault exception).
- [ ] `max-w-5xl` container, `py-16 lg:py-24` rhythm.
- [ ] Print preview: each section breaks cleanly to its own Letter page.
- [ ] Header hidden in print; backgrounds force-printed.
- [ ] No motion. No spinners. No skeletons.
- [ ] No banned words present. No "AI" present.

If any box is unchecked, the dossier is not ready to ship.

---

*Authority order for /dossier: this file → `docs/BRAND_BIBLE.md` →
`docs/brand/README.md` → workspace knowledge. On conflict, halt and flag.*
