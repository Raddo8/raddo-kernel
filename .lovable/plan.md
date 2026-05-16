## Status — LOCKED. Ready to build.

All three gates answered: **A · yes-i · A**. Setup v1.0 in hand (871 lines, validated). Mandala asset verified (2.5 MB, sufficient for 300dpi print). Video clip validated (8s, 1280×720, h264+aac, 2.9 MB).

---

## Build plan (final)

### 1 · `cob_capability_brief_v6.html` — cover redesigned, body verbatim

**Cover layout (top→bottom):**
1. Brand bar: `RADDO` mark left · `EDITION 01 · 2026` over `Capability Brief` italic right
2. Overline: `Clarity · Origin · Decision.` (brass, 0.25em tracking)
3. Headline (Fraunces 800, clamp 56–88px):
   - "Built for you day one." — ink-deep
   - "*Sharpens with every action.*" — italic, brass-deep
   - "Yours to wield anywhere." — ink-deep
4. Lede (Inter 19px, charcoal, max-width 640px) — verbatim from dispatch
5. Brass hairline (asymmetric, 280px scaleX entrance)
6. **Hero video panel** (1100×620, 8px border-radius, 1.5px brass border, paper inner):
   - `<video autoplay muted loop playsinline poster="assets/hero-poster.jpg">` with mp4 + webm sources
   - Mandala becomes the poster (frame from `public/brand/hero-six-source-mandala.png` re-cropped to 1100×620, used in print + `prefers-reduced-motion`)
   - `@media print` and `@media (prefers-reduced-motion: reduce)` swap video → poster `<img>`
7. Editorial index strip — two columns, brass roman numerals, ink labels (I/II/III/IV per spec)
8. Brass CTA box (≈540×140, centered): `BEGIN` eyebrow · `Set up your COB` Fraunces 28px · sub · `Begin setup →` brass-deep
   - href: `./RADDO_Individual_COB_Setup.html`

**Body preserved verbatim** (Day One / Decade Ten, Spokes, Split, Industries, Roles, Integrations, footer). Existing blue `.cta` in body left untouched — flagged for separate v7 sweep dispatch.

**Motion cascade** (curve `cubic-bezier(0.22,1,0.36,1)`):
overline fade 600ms → headline rise 1200ms @200 → lede rise 800ms @600 → hairline scaleX 600ms @1100 → video panel fade 800ms @1300 (video begins playing on fade-in) → index strip rise 800ms @1700 → CTA rise 800ms @2100. Total ≤2900ms. CTA hover: 1px lift, 220ms.

**Print stylesheet:** `@page { size: Letter; margin: 0.6in }`, cover page-break-after always, video→poster swap, hero poster prints at 300dpi via mandala source.

### 2 · `RADDO_Individual_COB_Setup.html` — v1.0 bundled verbatim

Drop user-uploaded HTML (871 lines, theme-gap + 10×10 word grids + 15-row DISC + `mailto:cob.brahan@gmail.com` submit) into:
- `/mnt/documents/raddo-brief/RADDO_Individual_COB_Setup.html` (resolves cover CTA `./` href)
- `public/setup.html` (mirrors for `raddo.lovable.app/setup.html`)

Zero edits to the Setup HTML.

### 3 · Hero video assets

- Strip audio + re-encode mp4 (h264, CRF 22, ~1.2 MB)
- Generate webm sibling (vp9, ~900 KB) for broader browser fidelity
- Extract poster JPEG from frame 0 (1100×620, q=85, ~120 KB)
- All three written to `/mnt/documents/raddo-brief/assets/`

### 4 · Deliverables (final)

```
/mnt/documents/raddo-brief/
  cob_capability_brief_v6.html
  RADDO_Individual_COB_Setup.html
  assets/
    hero.mp4
    hero.webm
    hero-poster.jpg
public/setup.html
```

`presentation-artifact` tags for the brief, Setup, and poster JPEG.

### 5 · QA protocol (mandatory, blocks delivery)

- Chromium headless → PDF → `pdftoppm` JPEGs at 150dpi
- Inspect cover at 1100 / 860 / 520 viewport renders
- Verify: headline italic + brass-deep on line 2 only · video plays muted+loop on screen · poster appears in PDF · CTA href resolves to bundled Setup in headless click-test · `prefers-reduced-motion` emulation snaps video→poster · all bible tokens render correctly
- Composite confidence reported in HANDOFF · no "clean" claim without screenshots

### 6 · Post-build HANDOFF

Signed `— LOVABLE`, posted to `docs/HANDOFF.md` with files changed, bible sections honored, ambiguous calls (none expected — all resolved at planning), QA screenshots inline, composite confidence score, reassign to COB-RADDO.

---

## Out of scope (separate dispatches)

- Body `.cta` blue→brass sweep across v6 body (v7)
- Live-site `src/components/Hero.tsx` headline propagation (separate dispatch)
- Expanding `public/brand/` allow-list with additional light-variant imagery (v7)
- Any backend / Supabase touches

— LOVABLE