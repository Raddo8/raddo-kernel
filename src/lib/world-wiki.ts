/** Wiki-dossier helpers for /hq/world: honest date parsing and inline linking.
 *
 * Honesty law: a date is only ever read out of the material. Nothing here
 * invents a date, and a countdown is only produced when the year is either
 * written down or unambiguous (the coming twelve months).
 */
import type { ReactNode } from "react";
import { createElement, Fragment } from "react";

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

export interface DatedLine {
  /** The date exactly as the material writes it. */
  label: string;
  /** Resolvable calendar date, when the material makes one unambiguous. */
  date: Date | null;
  /** The one sentence the date sits in. */
  sentence: string;
}

const MONTH_RE = new RegExp(
  `\\b(${Object.keys(MONTHS).join("|")})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`,
  "i",
);
const SLASH_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
const YEAR_RE = /\b(20\d{2})\b/;

function resolve(month: number, day: number, year?: number): Date | null {
  if (typeof year === "number") {
    const d = new Date(Date.UTC(year, month, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // No year written. Take the current year, and only accept it when the date
  // lands inside the window a reader would assume: 60 days back, a year ahead.
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), month, day));
  if (Number.isNaN(d.getTime())) return null;
  const delta = (d.getTime() - now.getTime()) / 86_400_000;
  return delta > -60 && delta < 365 ? d : null;
}

function firstDate(sentence: string): { label: string; date: Date | null } | null {
  const m = MONTH_RE.exec(sentence);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    const day = Number(m[2]);
    const year = m[3] ? Number(m[3]) : undefined;
    return { label: m[0].replace(/\s+/g, " "), date: resolve(month, day, year) };
  }
  const s = SLASH_RE.exec(sentence);
  if (s) {
    const month = Number(s[1]) - 1;
    const day = Number(s[2]);
    let year: number | undefined;
    if (s[3]) year = s[3].length === 2 ? 2000 + Number(s[3]) : Number(s[3]);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return { label: s[0], date: resolve(month, day, year) };
    }
  }
  const y = YEAR_RE.exec(sentence);
  if (y) return { label: y[1], date: null };
  return null;
}

const SPLIT = /(?<=[.;!?])\s+/;

/** Every dated sentence in a block of material, in the order it is written. */
export function datedLines(text: string): DatedLine[] {
  const plain = String(text ?? "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>]/g, "");
  const out: DatedLine[] = [];
  for (const raw of plain.split(SPLIT)) {
    const sentence = raw.replace(/\s+/g, " ").trim();
    if (!sentence) continue;
    const hit = firstDate(sentence);
    if (hit) out.push({ label: hit.label, date: hit.date, sentence });
  }
  return out;
}

/** Days from today, or null when the material never fixed a calendar date. */
export function daysAway(d: Date | null): number | null {
  if (!d) return null;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((d.getTime() - today) / 86_400_000);
}

/** The nearest date still ahead of today · the loudest clock in the lane. */
export function loudestClock(lines: DatedLine[]): DatedLine | null {
  const future = lines
    .filter((l) => {
      const n = daysAway(l.date);
      return n !== null && n >= 0;
    })
    .sort((a, b) => (a.date as Date).getTime() - (b.date as Date).getTime());
  return future[0] ?? null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** First 2-4 sentences of a block, for the lead paragraph. */
export function leadSentences(text: string, max = 4): string {
  const plain = String(text ?? "")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = plain.split(SPLIT);
  return parts.slice(0, max).join(" ").trim();
}

export interface LinkTarget {
  id: string;
  name: string;
}

/** Wrap every named entity that appears in the text as an inline graph link. */
export function linkify(
  text: string,
  targets: LinkTarget[],
  render: (target: LinkTarget, key: string) => ReactNode,
): ReactNode {
  const usable = targets.filter((t) => t.name && t.name.length > 2);
  if (!usable.length) return text;
  const ordered = [...usable].sort((a, b) => b.name.length - a.name.length);
  const re = new RegExp(`(${ordered.map((t) => escapeRe(t.name)).join("|")})`, "gi");
  const parts = text.split(re);
  const nodes: ReactNode[] = [];
  parts.forEach((part, i) => {
    const match = ordered.find((t) => t.name.toLowerCase() === part.toLowerCase());
    if (match) nodes.push(render(match, `${match.id}-${i}`));
    else if (part) nodes.push(createElement(Fragment, { key: `t-${i}` }, part));
  });
  return nodes;
}
