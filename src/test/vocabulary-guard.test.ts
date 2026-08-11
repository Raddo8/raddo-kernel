import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  resolvesLoopState,
  resolvesVerificationState,
  VERIFICATION_STATE_ALIASES,
} from "@/lib/vocabulary";

// Standing guard for HARDEN-01 M1's regression class: a vocabulary-controlled
// column gained a trigger that rejects unmapped values, while live writers kept
// emitting values nobody had inventoried. This scans every writer in the repo
// and fails the build on any literal the vocabulary would refuse.

const ROOTS = ["src", "supabase/functions", "public"];
const EXTS = [".ts", ".tsx", ".js", ".html", ".sql"];
const SKIP = new Set(["node_modules", "dist", "build", ".git"]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXTS.some((ext) => path.endsWith(ext))) out.push(path);
  }
  return out;
}

const FILES = ROOTS.flatMap((root) => walk(root)).filter(
  (path) => !path.endsWith("vocabulary.ts") && !path.endsWith("vocabulary-guard.test.ts"),
);

/** Captures `verification_state: "x"`, `verification_state = 'x'`, `p_verification_state: "x"`. */
const VERIFICATION_PATTERN =
  /\bp?_?verification_state\b\s*[:=]{1,2}\s*["'`]([^"'`]+)["'`]/gi;

/** Captures `state: "x"` only in files that also mention a loop table. */
const LOOP_PATTERN = /\bstate\b\s*[:=]{1,2}\s*["'`]([^"'`]+)["'`]/gi;
const LOOP_FILE_HINT = /open_loops|loop_state|work_item/i;

function collect(pattern: RegExp, source: string): string[] {
  const found: string[] = [];
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const value = match[1].trim();
    // Skip interpolations and placeholders; only literal words are writers.
    if (!value || /[${}<>|,\s]/.test(value)) continue;
    found.push(value.toLowerCase());
  }
  return found;
}

describe("controlled vocabularies", () => {
  it("every verification_state a writer can emit resolves to a canonical value", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const source = readFileSync(file, "utf8");
      for (const value of collect(VERIFICATION_PATTERN, source)) {
        if (!resolvesVerificationState(value)) offenders.push(`${file}: "${value}"`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every loop state a writer can emit resolves to a canonical value", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const source = readFileSync(file, "utf8");
      if (!LOOP_FILE_HINT.test(source)) continue;
      for (const value of collect(LOOP_PATTERN, source)) {
        if (!resolvesLoopState(value)) offenders.push(`${file}: "${value}"`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("keeps the alias the decision writer depends on", () => {
    // cob_decision_write defaults to "recorded"; losing this alias took the
    // decision register down fleet-wide once already.
    expect(VERIFICATION_STATE_ALIASES.recorded).toBe("asserted");
  });
});
