import { useEffect, useState } from "react";

/**
 * Boolean view preference, persisted per surface in localStorage.
 * Used by the Revenue Desk and Pursuit Board "View" menu so forecast /
 * weighted / expected overlays are opt-in per the principal's preference.
 */
export function useViewPref(key: string, defaultValue: boolean) {
  const storageKey = `viewpref:${key}`;
  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return defaultValue;
      return raw === "1";
    } catch { return defaultValue; }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, value ? "1" : "0"); } catch { /* noop */ }
  }, [storageKey, value]);
  return [value, setValue] as const;
}
