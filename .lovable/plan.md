

## Fix Double Separator in ItemDetail Subtitle

### Verified Current State

- **ItemsList.tsx line 127**: Valid JSX. Middot inside `<span>` with `text-xs text-muted-foreground ml-2` classes. No change needed.
- **ActionsQueue.tsx line 101**: Valid JSX. Ternary guard with `<span> · {name}</span>`. No change needed.
- **ItemDetail.tsx line 108**: Empty string fallback creates double separators (`type ·  · $1,000`) when account is missing. Needs fix.

### Change: ItemDetail.tsx (line 108)

Current:
```text
subtitle={`${item.type} · ${item.accounts?.name || ""} · ${item.amount ? "$" + Number(item.amount).toLocaleString() : `No ${labels.itemLower} amount`}`}
```

Replace with conditional account segment:
```text
subtitle={`${item.type}${item.accounts?.name ? ` · ${item.accounts.name}` : ""} · ${item.amount ? "$" + Number(item.amount).toLocaleString() : `No ${labels.itemLower} amount`}`}
```

Renders as:
- With account and amount: `invoice · Acme Corp · $5,000`
- Without account: `invoice · $5,000`
- Without amount: `invoice · Acme Corp · No item amount`
- Without either: `invoice · No item amount`

### Post-Edit Verification

1. Confirm build compiles without errors
2. Open Items list page: verify account names render as `· AccountName` with muted styling
3. Open an item detail page with an account: verify subtitle shows `type · account · amount`
4. Open an item detail page without an account: verify subtitle shows `type · amount` (no double separator)
5. Open Actions Queue: verify account names render with middot separator

### Files Summary

| File | Status |
|------|--------|
| `src/pages/ItemsList.tsx` | Verified correct, no change |
| `src/pages/ActionsQueue.tsx` | Verified correct, no change |
| `src/pages/ItemDetail.tsx` | Fix line 108: conditional account segment |

