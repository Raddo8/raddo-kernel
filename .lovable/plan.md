## Cover revision · "What is COB?" section

### Heads-up before building

The lede currently in `cob_capability_brief_v6.html` is **not** the paragraph you quoted. It reads:

> "Your COB is a system of **intelligence, strategy, and competence**. Built around you from day one. Connected to your email, calendar, documents, team and data. It learns how you work. It is portable. It carries everything you teach it. The longer you use it, the better it gets at being yours. And it stays yours for decades."

The "Email, meetings, documents, business chat…" paragraph you asked to remove lived in an earlier draft. I'll treat your intent as: **replace whatever lede is currently there with the new "What is COB?" section.** Flag if that's wrong before I start.

### Placement recommendation

You offered two fallbacks if the cover gets too dense. My call: **option (b)** — keep the cover as hero-headline + video + index + CTA, and place "What is COB?" as the **first body section immediately after the cover page break**. Reasoning:

- Cover already carries overline + 3-line headline + video panel + 4-cell index + CTA box. Inlining a 6-paragraph editorial section pushes the CTA below a second scroll on screen and forces a print overflow that breaks the cover's single-page integrity.
- "What is COB?" reads as a foundational chapter, not a hero lede. Giving it its own breathing room honors restraint.
- The existing brass hairline between headline and video stays. The new section gets its own hairlines per spec.

If you'd rather force it inline on the cover, say so and I'll cut the index strip to page 2 instead.

### Build steps

1. **Remove** current `.cover-lede` `<p>` (line 909–911) from the cover.
2. **Remove** the now-redundant `.cover-hairline` div (line 913) — the video panel becomes the visual closer of the cover. (Or keep it; minor call. I'll keep it removed for cleaner cover rhythm. Flag if you want it retained.)
3. **Insert** new `<section class="what-is-cob">` immediately after `</div><!-- /cover -->`, before the existing body content begins.
4. **Add CSS** for the new section (scoped, no token drift):

```text
.what-is-cob {
  max-width: 660px;
  margin: 0 auto;
  padding: 72px 32px 88px;
  opacity: 0; transform: translateY(20px);
  animation: cv-rise 800ms cubic-bezier(0.22,1,0.36,1) 2100ms forwards;
}
.what-is-cob .eyebrow {
  font-family: 'Fraunces'; font-variant: small-caps;
  font-size: 11px; letter-spacing: 0.22em;
  color: var(--brass);            /* #EF9F27, bright */
  margin-bottom: 18px;
}
.what-is-cob h2 {
  font-family: 'Fraunces'; font-weight: 800;
  font-size: clamp(36px, 4.2vw, 48px);
  line-height: 1.1; color: var(--ink-deep);
  margin: 0 0 28px;
}
.what-is-cob .rule-wide {
  width: 280px; height: 1.5px; background: var(--brass);
  margin: 0 0 36px;               /* sits above the section, per spec */
}
.what-is-cob p {
  font-family: 'Inter'; font-size: 18px; line-height: 1.55;
  color: var(--charcoal); margin: 0 0 24px;
}
.what-is-cob p strong { color: var(--ink-deep); font-weight: 700; }
.what-is-cob .rule-close {
  width: 120px; height: 1.5px; background: var(--brass);
  margin: 8px 0 28px;
}
.what-is-cob .closer p {
  font-family: 'Fraunces'; font-style: italic;
  font-size: 21px; line-height: 1.45;
  color: var(--ink-deep); margin: 0 0 16px;
}
@media print {
  .what-is-cob { animation: none; opacity: 1; transform: none; padding-top: 56px; }
}
@media (prefers-reduced-motion: reduce) {
  .what-is-cob { animation: none; opacity: 1; transform: none; }
}
```

Closer treatment: **Fraunces italic** — carries more editorial weight than Inter italic on a paper field and pairs with the headline family without introducing a third register.

5. **HTML structure** (verbatim copy, bold per spec):

```text
<section class="what-is-cob">
  <div class="rule-wide" aria-hidden="true"></div>
  <div class="eyebrow">What it is</div>
  <h2>What is COB?</h2>

  <p>COB is a system of <strong>intelligence, strategy, and competence</strong> built around one person — or one business. It reads what you read, sits in your meetings, and holds the full context of your operation: finance, legal, people, risk, every functional domain. It learns how you think, how you write, what you weigh, what you cut. From that foundation, it produces the briefings, drafts, projects, reports, presentations, and counsel that let you show up as the sharpest version of yourself in every room you walk into.</p>

  <p>Two things separate COB from any tool you have used before.</p>

  <p><strong>It is portable.</strong> Not locked to one app, one platform, one provider. It carries everything you teach it across the systems you already use.</p>

  <p><strong>It is permanent.</strong> It does not reset when you change roles, restructure your team, or move on to the next thing. The longer you use it, the more of you it carries.</p>

  <p>Executives without a COB are now competing against executives with one. The gap shows up quietly — in who is prepared when the question lands, who has the draft ready before the meeting, who remembers what was decided three quarters ago when it matters again, who carries the full operation with them instead of behind them. The disadvantage is small at first. It compounds.</p>

  <div class="rule-close" aria-hidden="true"></div>

  <div class="closer">
    <p>The question is no longer whether decision intelligence at this depth becomes the standard for serious operators.</p>
    <p>The question is whether you have one when it does.</p>
  </div>
</section>
```

6. **QA**: headless Chromium → PDF → `pdftoppm` JPEGs at 150dpi. Verify:
   - Eyebrow renders small-caps brass at 0.22em tracking
   - Bold tokens render ink-deep
   - Closer renders Fraunces italic ~21px ink-deep
   - Both hairlines bright brass `#EF9F27`, correct widths (280 / 120)
   - Section reflows cleanly across page break in print
   - Motion cascade enters after the cover settles; reduced-motion snaps
7. **Re-emit** `presentation-artifact` for the updated brief.

### Out of scope (will not touch)

- `src/components/Hero.tsx` (live site)
- Setup form HTML
- Index strip wording, CTA copy, body sections below
- Token palette
