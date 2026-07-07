/**
 * Stable, tasteful categorical colors for account/stage/status series in the
 * Revenue ribbon chart. Assignments persist in localStorage so an account keeps
 * its color across sessions.
 *
 * Palette avoids bright/neon; leans into the app's ink/brass/paper family with
 * enough hue separation to distinguish 12+ series.
 */
const PALETTE = [
  "#0C447C", // raddo-ink
  "#EF9F27", // raddo-brass
  "#185FA5", // raddo-ink-soft
  "#854F0B", // raddo-brass-deep
  "#5F5E5A", // raddo-ash
  "#2C7A4B", // moss
  "#7A2E2E", // clay
  "#3E5C76", // slate blue
  "#8A6D3B", // ochre
  "#4B3F72", // aubergine
  "#2C2C2A", // charcoal
  "#B08050", // sand
  "#436850", // pine
  "#8C4A6E", // plum
  "#6A5D2E", // olive
];

const STORAGE_KEY = "revenue.seriesColors.v1";

type ColorMap = Record<string, string>;

function readMap(): ColorMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeMap(m: ColorMap) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(m)); } catch { /* noop */ }
}

/**
 * Assign a stable color per series key. Given the same set of keys, the
 * mapping is deterministic per-browser (order of first-seen).
 */
export function assignColors(keys: string[]): ColorMap {
  const map = readMap();
  let idx = Object.keys(map).length;
  let changed = false;
  for (const k of keys) {
    if (!map[k]) {
      map[k] = PALETTE[idx % PALETTE.length];
      idx += 1;
      changed = true;
    }
  }
  if (changed) writeMap(map);
  return map;
}
