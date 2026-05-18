# Phase 1A — Analytics + SEO + Sitemap

Three concerns, one pass. All public marketing routes get per-route head; the gated `/app/*` product surfaces are intentionally excluded (noindex by virtue of auth gate + not in sitemap).

## Existing state worth noting

- `index.html` already ships a sitewide title, description, canonical, og:* and twitter:* — the per-route Helmet will override these on routes that set their own; `index.html` remains the fallback for non-JS social crawlers.
- `public/og-image.png` already exists → reuse it. No new image generation.
- `public/robots.txt` exists with per-bot Allow blocks; will be edited in place to add Disallow + Sitemap, not replaced.
- Routes in `App.tsx`: public marketing = `/`, `/consult`, `/consult/thank-you`, `/style-guide`, `/respond/:token`. Product lives under `/app/*` behind AuthGate.

## ITEM 1 — Plausible

- Add to `index.html` `<head>`:
  `<script defer data-domain="raddo.ai,raddo.lovable.app" src="https://plausible.io/js/script.js"></script>`
  Dual-track via comma-separated `data-domain` so pageviews land in both Plausible properties while we're on the lovable subdomain. (Single script tag, no proxy needed.)
- `src/vite-env.d.ts`: extend `Window` with optional `plausible(eventName: string, opts?: { props?: Record<string, string | number | boolean> }): void`.
- `src/pages/ConsultForm.tsx`: in `handleSubmit`, after a successful `supabase.functions.invoke` and before `navigate("/consult/thank-you")`, fire:
  `window.plausible?.("consult_submission")`.

Note for report: Plausible needs both `raddo.ai` and `raddo.lovable.app` added as properties in the Plausible dashboard before events show up. I'll flag this in the post-build report.

## ITEM 2 — react-helmet-async

- `bun add react-helmet-async`.
- `src/main.tsx`: wrap `<App />` in `<HelmetProvider>`.
- Per-route `<Helmet>` blocks (each includes title, description, canonical, og:*, twitter:*):

| Route | Title | Description |
|---|---|---|
| `/` (Hero.tsx) | RADDO · Your Chief of Business | RADDO is a Chief of Business built around you — drawing on every system you run to keep you sharp across email, meetings, decisions, and direction. |
| `/consult` (ConsultForm.tsx) | Begin your consult · RADDO | A 5-minute consult to surface where your COB will start. Words for your current state, your aspiration, the systems you run, and how you decide. |
| `/consult/thank-you` (ConsultThankYou.tsx) | Consult received · RADDO | Your consult is in. Expect a response within 2 business days. + `<meta name="robots" content="noindex,follow" />` |
| `/style-guide` (StyleGuide.tsx) | Style guide · RADDO (internal) | Internal RADDO design system reference. + `noindex,nofollow` (internal) |
| `/respond/:token` (RespondPage.tsx) | Respond · RADDO | Secure single-use response surface. + `noindex,nofollow` (token URLs, never index) |
| `*` (NotFound.tsx) | Not found · RADDO | This page could not be located. + `noindex,follow` |

Canonical hosts use `https://raddo.ai` per dispatch (even though deployment is currently on `raddo.lovable.app` — Helmet writes the canonical the dispatch specified).

`/app/*` product routes get no Helmet treatment in this dispatch — they sit behind AuthGate and are not in scope.

## ITEM 3a — sitemap.xml

Create `public/sitemap.xml` (static, hand-edited file — no generator script; route set is tiny and stable). Entries:

- `/` priority 1.0, changefreq weekly
- `/consult` priority 0.9, changefreq monthly

Excluded: `/consult/thank-you` (per dispatch), `/style-guide` (internal), `/respond/:token` (dynamic token URLs), `/app/*` (gated), `*` (404). `lastmod` = today.

## ITEM 3b — robots.txt

Edit `public/robots.txt` in place. Keep existing per-bot Allow blocks; add at the end:

```
Disallow: /consult/thank-you
Disallow: /style-guide
Disallow: /respond/
Disallow: /app/

Sitemap: https://raddo.ai/sitemap.xml
```

(I'm adding the additional `Disallow` lines for `/style-guide`, `/respond/`, and `/app/` defensively — they're already noindex via Helmet but robots-level disallow keeps them out of crawl entirely. I'll flag this in the report; happy to remove if you want only the dispatch-specified single Disallow.)

## ITEM 3c — OG meta

OG + Twitter mirrors are part of each Helmet block in ITEM 2. Image source: `https://raddo.ai/og-image.png` (existing asset in `public/`). No new image needed.

## ITEM 3d — OG image

Reusing existing `public/og-image.png`. Will report dimensions; if it's not 1200×630 I'll flag for follow-up but not regenerate in this pass.

## Files to write

- `index.html` (Plausible script)
- `src/vite-env.d.ts` (window.plausible type)
- `src/main.tsx` (HelmetProvider wrap)
- `src/pages/ConsultForm.tsx` (Plausible event + Helmet)
- `src/components/Hero.tsx` (Helmet for `/`)
- `src/pages/ConsultThankYou.tsx` (Helmet + noindex)
- `src/pages/StyleGuide.tsx` (Helmet + noindex)
- `src/pages/RespondPage.tsx` (Helmet + noindex)
- `src/pages/NotFound.tsx` (Helmet + noindex)
- `public/sitemap.xml` (new)
- `public/robots.txt` (append Disallow + Sitemap)
- `package.json` (react-helmet-async)

## Out of scope

RAD-42 (Resend on /consult) — not touched.

## Open questions before I build

None blocking. Two flags for the report after build:
1. Plausible dashboard must have both `raddo.ai` and `raddo.lovable.app` properties created — I can't do that from code.
2. Extra defensive `Disallow` lines in robots.txt beyond the one you specified — easy to drop if you'd rather keep the file minimal.
