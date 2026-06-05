## Goal

Across both `/consult` and `/debrief` (same data source, same form code paths), each category bucket should:
1. Have an **equal number of positive and negative current-state chips**.
2. Show **one neutral "In your words…" free-text box** at the bottom of the bucket.
3. Be presented in this **new order with two added categories**:

```
1. MONEY
2. MARKET POSITION
3. STRATEGY · DIRECTION   ← NEW (under MARKET POSITION)
4. OPERATIONS
5. SYSTEMS
6. CUSTOMERS
7. PEOPLE
8. CULTURE
9. RISK
10. AI                    ← NEW (above YOU)
11. YOU
```

No styling system changes. No new tables. No edge-function changes. The free-text per-bucket inputs are appended to the existing email payload so notifications still carry them.

## Files touched

- `src/lib/consult-data.ts` — rebalance chips, add 2 categories, update order/labels.
- `src/pages/ConsultForm.tsx` — render per-bucket textarea; thread values into submission.
- `src/pages/DebriefForm.tsx` — same render + threading as Consult.
- `src/lib/consult-analysis.ts` — accept `bucketNotes` and include them in the email body.
- `src/lib/consult-warm-start.ts` — accept the two new categories in iteration; no scoring changes required.
- `src/components/consult/ConfirmDebriefDialog.tsx` — show count of buckets with notes in the review summary.

No changes to `submit-consult` edge function — it already forwards the assembled payload + summary email text.

## Data changes (`consult-data.ts`)

### New `Category` union and order

```ts
export type Category =
  | "money" | "market_position" | "strategy" | "operations" | "systems"
  | "customers" | "people" | "culture" | "risk" | "ai" | "you";

export const CATEGORY_ORDER: Category[] = [
  "money","market_position","strategy","operations","systems",
  "customers","people","culture","risk","ai","you",
];

CATEGORY_LABELS.strategy = "STRATEGY · DIRECTION";
CATEGORY_LABELS.ai = "AI";
```

### Rebalanced `CURRENT_BY_CATEGORY` (equal positive : negative per bucket)

Each bucket below lists N negatives + N positives. Existing negatives are preserved; positives are added to match. AI and STRATEGY are pulled out of `market_position` into their own buckets.

- **money** (4 + 4): neg `bleeding cash, feast-or-famine, undercharging, margin-thin` · pos `profitable, steady demand, cash cushion, predictable revenue`
- **market_position** (3 + 3): neg `invisible in the market, undifferentiated, wasted ad spend` · pos `known brand, differentiated, market presence`
- **strategy** (4 + 4) NEW: neg `no game plan, stuck at a ceiling, drifting, reactive direction` · pos `clear positioning, clear plan, focused bets, decisive direction`
- **operations** (5 + 5): neg `dropping balls, inconsistent, rework, deadlines slip, no playbooks` · pos `reliable, repeatable, on time, clean handoffs, dependable output`
- **systems** (4 + 4): neg `duct-taped, everything's manual, scattered tools, blind spots` · pos `documented, tracked, one source of truth, real-time numbers`
- **customers** (5 + 5): neg `losing customers, high churn, complaints piling up, no referrals, low NPS` · pos `loyal customers, repeat buyers, high retention, referrals flowing, raving fans`
- **people** (5 + 5): neg `short-staffed, doing it all myself, can't delegate, key-person risk, bottlenecked on me` · pos `strong team, aligned, deep bench, accountable team, leaders I trust`
- **culture** (5 + 5): neg `low trust, gossip, fear of speaking up, burnout culture, going through the motions` · pos `candid culture, team energy, high-trust, everyone engaged, magnet for talent`
- **risk** (5 + 5): neg `legal exposure, no contracts, cyber-vulnerable, no succession plan, uninsured` · pos `protected, well-papered, succession-ready, cyber-secure, audit-ready`
- **ai** (3 + 3) NEW: neg `behind on AI, AI tools collecting dust, no AI strategy` · pos `AI as edge, AI-augmented, AI moving the needle`
- **you** (5 + 5): neg `burned out, running on fumes, in over my head, maxed out, firefighting` · pos `sharp, decisive, clear-headed, in command, breathing room`

(Labels chosen to avoid duplicate slugs — the existing `slug()` helper handles ids.)

### `ASPIRATION_BY_CATEGORY`

Extended to cover the two new buckets (`strategy` keeps the existing aspiration labels that were previously in market_position; `ai` keeps `AI as edge`, `AI-augmented`, plus 1–2 forward-looking additions). All other buckets keep their current aspiration sets unchanged.

### Theme tags

All new chips reuse the existing `ThemeId` union (`strategy`, `ai`, etc. already exist) so warm-start analysis keeps working without changes.

## Form changes (`ConsultForm.tsx` and `DebriefForm.tsx`)

Add per-bucket free-text state:

```ts
const [bucketNotes, setBucketNotes] = useState<Record<Category, string>>(
  Object.fromEntries(CATEGORY_ORDER.map((c) => [c, ""])) as Record<Category, string>
);
```

Inside the existing bucket renderer (under both current-state and aspiration chip groups), add a single textarea per bucket, placed under the bucket as the last row:

```
Label (mono overline): IN YOUR WORDS · {CATEGORY_LABELS[c]}
<textarea maxLength={400} placeholder="Anything in this area you want us to know…" />
```

Styling uses existing Panel/paper/charcoal tokens — no new colors or radii.

Validation: notes are optional everywhere. `maxLength={400}` per bucket. Client-side `.trim()` on submit.

Threading into payload (already-existing `submit-consult` invocation):

```ts
const bucketNotesArray = CATEGORY_ORDER
  .map((c) => ({ category: c, label: CATEGORY_LABELS[c], note: bucketNotes[c].trim() }))
  .filter((row) => row.note.length > 0);

// included in the submit-consult body and in the analysis email text
```

## Email body (`consult-analysis.ts`)

`buildConsultEmailText` extended to append, when non-empty:

```
In your words:
- MONEY: …
- STRATEGY · DIRECTION: …
- AI: …
```

So Jake's lead-notification email shows every per-bucket note alongside the existing summary.

## Review dialog (`ConfirmDebriefDialog.tsx`)

Add one row: `"Buckets with notes" → "{count} of 11"` so the user sees their free-text was captured before confirming.

## Out of scope

- No changes to DISC, tools, contact fields, or the submit edge function logic.
- No changes to `submit-consult` schema or response.
- No new routes.
- No re-skin of the chips or panels.
