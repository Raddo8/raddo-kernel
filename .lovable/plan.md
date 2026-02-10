

## Remove Remaining Em Dashes from 3 Files

Safe UI cleanup pass. No backend changes. No migrations.

### 1. ActionsQueue.tsx (line 101)

Current:
```text
{a.items?.title} — {a.items?.accounts?.name}
```

Replace with (ternary to prevent stray spacing when account is missing):
```text
{a.items?.title}{a.items?.accounts?.name ? <span> · {a.items.accounts.name}</span> : null}
```

### 2. ItemsList.tsx (line 127)

Current:
```text
{item.accounts && <span className="text-xs text-muted-foreground ml-2">— {item.accounts.name}</span>}
```

Replace with (direct character swap, conditional rendering already correct):
```text
{item.accounts && <span className="text-xs text-muted-foreground ml-2">· {item.accounts.name}</span>}
```

### 3. ItemDetail.tsx (line 108)

Current:
```text
subtitle={`${item.type} · ${item.accounts?.name || "—"} · ${item.amount ? ...`}
```

Replace the em dash fallback with empty string for minimal UI noise:
```text
subtitle={`${item.type} · ${item.accounts?.name || ""} · ${item.amount ? ...`}
```

### Files Summary

| File | Line | Change |
|------|------|--------|
| `src/pages/ActionsQueue.tsx` | 101 | Em dash to middot with ternary guard |
| `src/pages/ItemsList.tsx` | 127 | Em dash to middot |
| `src/pages/ItemDetail.tsx` | 108 | Em dash fallback to empty string |

