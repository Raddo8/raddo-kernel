## Fix vault legend top borders

The 2-column grid currently suppresses the top border on the first item in each column (indexes 0 and 5), so rows `01` and `06` have no separator above them while the other rows do. The user wants those separators present for visual consistency.

### Change

In `src/components/Hero.tsx`, inside the `VAULT_LEGEND.map(...)` render:

- Remove the `isFirstInColumn` check.
- Apply `borderTop: "1px solid hsl(var(--raddo-paper-edge))"` to every `<li>` unconditionally.

That's it — one-line behavior change, no other surfaces touched.