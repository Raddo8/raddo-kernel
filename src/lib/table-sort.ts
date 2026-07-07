import { useEffect, useMemo, useState } from "react";

export type SortDir = "asc" | "desc";
export interface SortState { key: string; dir: SortDir; }

/**
 * Sortable-table hook · localStorage-persisted per surface.
 *
 * Usage:
 *   const { sort, toggle, filter, setFilter, sorted } = useTableSort(
 *     rows,
 *     { storageKey: "revenue.ledger", defaultSort: { key: "next_due", dir: "asc" },
 *       getters: {
 *         account: r => r.accounts?.name ?? "",
 *         amount:  r => Number(r.amount_usd),
 *         next_due: r => r.next_due ?? "",
 *         status:  r => r.status,
 *         kind:    r => r.kind,
 *       },
 *       filterFields: ["accounts.name", "description"] })
 */
export function useTableSort<T>(
  rows: T[],
  opts: {
    storageKey: string;
    defaultSort?: SortState;
    getters: Record<string, (row: T) => unknown>;
    filterFn?: (row: T, needle: string) => boolean;
  }
) {
  const sortKey = `sort:${opts.storageKey}`;
  const filterKey = `filter:${opts.storageKey}`;

  const [sort, setSort] = useState<SortState>(() => {
    try {
      const raw = localStorage.getItem(sortKey);
      if (raw) return JSON.parse(raw);
    } catch { /* noop */ }
    return opts.defaultSort ?? { key: Object.keys(opts.getters)[0], dir: "asc" };
  });

  const [filter, setFilter] = useState<string>(() => {
    try { return localStorage.getItem(filterKey) ?? ""; } catch { return ""; }
  });

  useEffect(() => {
    try { localStorage.setItem(sortKey, JSON.stringify(sort)); } catch { /* noop */ }
  }, [sortKey, sort]);
  useEffect(() => {
    try { localStorage.setItem(filterKey, filter); } catch { /* noop */ }
  }, [filterKey, filter]);

  const toggle = (key: string) =>
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: "asc" });

  const sorted = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    let out = rows;
    if (needle && opts.filterFn) out = out.filter(r => opts.filterFn!(r, needle));
    const getter = opts.getters[sort.key];
    if (!getter) return [...out];
    const copy = [...out];
    copy.sort((a, b) => {
      const av = getter(a); const bv = getter(b);
      const na = av == null || av === ""; const nb = bv == null || bv === "";
      if (na && nb) return 0;
      if (na) return 1;              // nulls last, regardless of dir
      if (nb) return -1;
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort, filter, opts]);

  return { sort, toggle, filter, setFilter, sorted };
}

/** Small header-cell component: click to toggle, shows indicator. */
export function sortIndicator(active: boolean, dir: SortDir): string {
  if (!active) return "↕";
  return dir === "asc" ? "↑" : "↓";
}
