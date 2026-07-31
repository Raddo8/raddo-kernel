// ritual-scrub · SCRUB-BEFORE-HQ coverage for the ritual write paths.
//
// WHY THIS FILE EXISTS
// `scrubPii` was invoked in exactly one place in the whole edge function — on the outgoing
// council minute inside `file_to_office`. Every ritual write path (/save, /sync, /end) reached
// both Postgres and Notion with zero screening, while `memory[].body_md` and
// `decisions[].rationale` are free-text fields explicitly designed to carry what the principal
// said out loud. That is a direct code-level gap against the Keystone Directive.
//
// DESIGN NOTES (deliberate, do not "simplify")
//  1. SKIP-LIST, NOT ALLOW-LIST. Every string is screened by default; only keys that are
//     structurally identifiers (ids, refs, hashes, urls, enums) are skipped. A field added to a
//     ritual payload six months from now is screened automatically instead of silently bypassing
//     the control. Coverage-by-default is the correct posture for a safety layer.
//  2. `scrubPii` IS NOT MODIFIED. It remains the exact primary control for `file_to_office`.
//     Ritual text gets strictly-stronger screening layered on top, so this change cannot alter
//     council-minute behaviour.
//  3. REDACT vs FLAG is calibrated to the principals' OWN written rules. JAEL forbids "SSNs,
//     full account/card numbers, balances, EINs"; SPINNEY forbids "SSNs, account/card numbers,
//     balances". Those get REDACTED. Emails, phone numbers and currency amounts are COUNTED AND
//     FLAGGED but NOT redacted — no tenant rule forbids them, and blanket-redacting currency
//     would gut `checkpoint.financial_residue`, a field whose entire purpose is financial state.
//     Destroying the record to satisfy a rule nobody wrote is not a safety win.
//  4. THIS IS DEFENCE IN DEPTH, NOT THE PRIMARY CONTROL. No regex detects narrative privileged,
//     health, or religious content. The primary control stays doctrine-level: the full
//     unscrubbed transcript lives client-side and HQ receives a pointer.

import { scrubPii } from "./pii-scrub.ts";
import { sanitizeText } from "./injection.ts";

const MAX_DEPTH = 8;
const MAX_ARRAY = 500;
const MAX_PATHS_REPORTED = 25;

// Keys whose values are structural identifiers, never principal prose.
const SKIP_KEY = /(^|_)id$|_ids$|_ref$|_refs$|^sha256$|^hash$|^url$|^href$|^kind$|^state$|^scope$|^status$|^category$|^owner$|^tenant$|^build_id$|^session_id$|^notion_page_id$|^notion_block_ref$/i;

// EIN — named explicitly in JAEL's own no-PII rule.
const EIN = /\b\d{2}-\d{7}\b/g;
// Date of birth, only when explicitly labelled. Bare dates are load-bearing in business
// records and are never blanket-redacted.
const LABELLED_DOB = /\b(DOB|D\.O\.B\.|date of birth)\s*[:\-]?\s*\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/gi;

// Flag-only detectors. Counted for observability; never rewritten.
const EMAIL_LIKE = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/g;
const PHONE_LIKE = /\b(?:\+1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g;
const CURRENCY_LIKE = /\$\s?\d[\d,]*(?:\.\d{2})?/g;

export interface RitualScrubReport {
  fields_scanned: number;
  fields_changed: number;
  changed_paths: string[];
  /** Detected but deliberately NOT redacted — observability only. */
  flagged: { emails: number; phones: number; currency: number };
  truncated: boolean;
}

function countMatches(s: string, re: RegExp): number {
  const m = s.match(re);
  return m ? m.length : 0;
}

/** The ritual text transform. scrubPii is applied UNCHANGED, then the ritual-only additions. */
export function scrubRitualText(input: string): string {
  if (!input) return input;
  // sanitizeText strips ASCII control characters only and preserves \n \r \t, so it cannot
  // mangle a principal's stored prose. Verified by reading injection.ts before composing it.
  let out = scrubPii(sanitizeText(input));
  out = out.replace(LABELLED_DOB, (m) => {
    const label = m.split(/[:\-]/)[0];
    return `${label}: [REDACTED-DOB]`;
  });
  out = out.replace(EIN, "[REDACTED-EIN]");
  return out;
}

/**
 * Walk a ritual payload and screen every string that is not a structural identifier.
 * Returns a NEW object — the caller's input is never mutated.
 */
export function scrubRitualArgs(input: any): { payload: any; report: RitualScrubReport } {
  const report: RitualScrubReport = {
    fields_scanned: 0,
    fields_changed: 0,
    changed_paths: [],
    flagged: { emails: 0, phones: 0, currency: 0 },
    truncated: false,
  };

  const walk = (node: any, path: string, depth: number): any => {
    if (node === null || node === undefined) return node;
    if (depth > MAX_DEPTH) {
      report.truncated = true;
      return node;
    }
    if (typeof node === "string") {
      report.fields_scanned++;
      report.flagged.emails += countMatches(node, EMAIL_LIKE);
      report.flagged.phones += countMatches(node, PHONE_LIKE);
      report.flagged.currency += countMatches(node, CURRENCY_LIKE);
      const next = scrubRitualText(node);
      if (next !== node) {
        report.fields_changed++;
        if (report.changed_paths.length < MAX_PATHS_REPORTED) report.changed_paths.push(path);
        else report.truncated = true;
      }
      return next;
    }
    if (Array.isArray(node)) {
      const cap = Math.min(node.length, MAX_ARRAY);
      if (node.length > MAX_ARRAY) report.truncated = true;
      const out = node.slice(0, cap).map((v, i) => walk(v, `${path}[${i}]`, depth + 1));
      // Anything past the cap is passed through unscreened rather than dropped — a ritual must
      // never lose the principal's data to the safety layer. `truncated` records that it happened.
      return cap < node.length ? out.concat(node.slice(cap)) : out;
    }
    if (typeof node === "object") {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === "string" && SKIP_KEY.test(k)) { out[k] = v; continue; }
        out[k] = walk(v, path ? `${path}.${k}` : k, depth + 1);
      }
      return out;
    }
    return node;
  };

  const payload = walk(input, "", 0);
  return { payload, report };
}
