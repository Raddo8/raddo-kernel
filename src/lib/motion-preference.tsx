import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";

/**
 * Motion preference · three-way override on top of the OS setting.
 *
 *   "system"  · honour prefers-reduced-motion (default)
 *   "reduce"  · force motion off, regardless of OS
 *   "full"    · force motion on, regardless of OS
 *
 * Wires into framer-motion via <MotionConfig reducedMotion="..."> so every
 * useReducedMotion() call in the app reflects this preference. Also injects
 * a CSS guard that disables non-framer transitions/animations when reduce
 * is active.
 */

export type MotionPref = "system" | "reduce" | "full";

const STORAGE_KEY = "raddo-motion-pref-v1";
const STYLE_TAG_ID = "raddo-motion-guard";

type Ctx = {
  pref: MotionPref;
  setPref: (p: MotionPref) => void;
  /** True when motion is currently suppressed (system + OS-reduce, or explicit "reduce"). */
  isReduced: boolean;
};

const MotionPreferenceContext = createContext<Ctx | null>(null);

function readStorage(): MotionPref {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "reduce" || v === "full" || v === "system") return v;
  } catch {
    // ignore
  }
  return "system";
}

function applyCssGuard(active: boolean) {
  if (typeof document === "undefined") return;
  let tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = STYLE_TAG_ID;
    document.head.appendChild(tag);
  }
  // When the user has explicitly asked to reduce motion (or system says so and
  // we're honouring it), disable CSS-driven transitions and animations app-wide.
  // Framer-motion is handled separately through MotionConfig.
  tag.textContent = active
    ? `
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
        scroll-behavior: auto !important;
      }
    `
    : "";
}

export function MotionPreferenceProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<MotionPref>(() => readStorage());
  const [systemReduce, setSystemReduce] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setSystemReduce(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  const isReduced =
    pref === "reduce" || (pref === "system" && systemReduce);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, pref); } catch { /* ignore */ }
    applyCssGuard(isReduced);
  }, [pref, isReduced]);

  const value = useMemo<Ctx>(
    () => ({ pref, setPref: setPrefState, isReduced }),
    [pref, isReduced],
  );

  // MotionConfig.reducedMotion accepts "always" | "never" | "user".
  // "user" = honour the OS media query (framer reads it itself).
  const motionConfigValue: "always" | "never" | "user" =
    pref === "reduce" ? "always" : pref === "full" ? "never" : "user";

  return (
    <MotionPreferenceContext.Provider value={value}>
      <MotionConfig reducedMotion={motionConfigValue}>{children}</MotionConfig>
    </MotionPreferenceContext.Provider>
  );
}

export function useMotionPreference() {
  const ctx = useContext(MotionPreferenceContext);
  if (!ctx) throw new Error("useMotionPreference must be used inside MotionPreferenceProvider");
  return ctx;
}
