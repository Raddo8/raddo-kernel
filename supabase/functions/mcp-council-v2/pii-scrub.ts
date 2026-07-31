// supabase/functions/mcp-council/pii-scrub.ts
//
// harden-v1 · defense-in-depth PII scrub applied before Notion write-back.
// This is NOT the primary control (the customer principle and prompt
// boundaries are). It catches obvious patterns that should never end up in
// the boardroom database.

function luhnOk(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function scrubPii(input: string): string {
  if (!input) return input;
  let out = input;

  // US SSN (NNN-NN-NNNN)
  out = out.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED-SSN]");

  // IBAN (loose: 2 letters + 2 digits + up to 30 alphanumerics)
  out = out.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, "[REDACTED-IBAN]");

  // Card numbers 13-19 digits (with optional separators), Luhn-validated
  out = out.replace(/\b(?:\d[ -]?){12,18}\d\b/g, (m) => {
    const digits = m.replace(/[^\d]/g, "");
    if (digits.length < 13 || digits.length > 19) return m;
    return luhnOk(digits) ? "[REDACTED-CARD]" : m;
  });

  // Long generic digit blocks 12+ (account numbers, routing+account combos)
  out = out.replace(/\b\d{12,}\b/g, "[REDACTED-ACCOUNT]");

  return out;
}
