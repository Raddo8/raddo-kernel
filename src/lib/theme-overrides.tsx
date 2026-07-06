import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Live theme override system.
 *
 * Lets the /style-guide page tweak any design token at runtime, persist the
 * change to localStorage, and broadcast it across the app via a CSS variable
 * stylesheet injected into <head>. Defaults live in src/index.css — overrides
 * are additive and never mutate the source files.
 *
 * Token names match the CSS variables declared in :root (without the leading
 * `--`). Values are stored verbatim (e.g. `210 82% 27%` for HSL triplets,
 * `0.375rem` for radii, `'Inter', system-ui, sans-serif` for fonts).
 */

const STORAGE_KEY = "dossier-theme-overrides-v1";
const STYLE_TAG_ID = "dossier-theme-overrides";

export type ThemeOverrides = Record<string, string>;

type Ctx = {
  overrides: ThemeOverrides;
  setOverride: (token: string, value: string) => void;
  clearOverride: (token: string) => void;
  resetAll: () => void;
};

const ThemeOverridesContext = createContext<Ctx | null>(null);

function readStorage(): ThemeOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as ThemeOverrides;
  } catch {
    // ignore
  }
  return {};
}

function writeStorage(o: ThemeOverrides) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch {
    // ignore
  }
}

function applyToDom(overrides: ThemeOverrides) {
  if (typeof document === "undefined") return;
  let tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = STYLE_TAG_ID;
    document.head.appendChild(tag);
  }
  const lines = Object.entries(overrides)
    .filter(([k, v]) => k && v != null)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join("\n");
  tag.textContent = lines ? `:root {\n${lines}\n}\n` : "";
}

export function ThemeOverridesProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<ThemeOverrides>(() => readStorage());

  useEffect(() => {
    applyToDom(overrides);
    writeStorage(overrides);
  }, [overrides]);

  const value = useMemo<Ctx>(
    () => ({
      overrides,
      setOverride: (token, val) =>
        setOverrides((prev) => ({ ...prev, [token]: val })),
      clearOverride: (token) =>
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[token];
          return next;
        }),
      resetAll: () => setOverrides({}),
    }),
    [overrides],
  );

  return (
    <ThemeOverridesContext.Provider value={value}>
      {children}
    </ThemeOverridesContext.Provider>
  );
}

export function useThemeOverrides() {
  const ctx = useContext(ThemeOverridesContext);
  if (!ctx) throw new Error("useThemeOverrides must be used inside ThemeOverridesProvider");
  return ctx;
}

/**
 * Read the live computed value of a CSS variable from :root.
 * Used by the style guide to seed editor inputs with the current value
 * (whether that value comes from index.css defaults or an override).
 */
export function readVar(token: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--${token}`)
    .trim();
}
