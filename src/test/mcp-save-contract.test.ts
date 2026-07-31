/**
 * Lane A · Commit 1 — tool contract parity.
 *
 * Why this exists: RITUAL_SAVE_PROPS declares `additionalProperties: false`,
 * so any field the handler reads but the schema omits is unsendable by a
 * conforming client. These tests pin the published contract to the fields the
 * save handler actually reads.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";

const SOURCE = path.resolve(
  __dirname,
  "../../supabase/functions/mcp-council/index.ts",
);
const src = readFileSync(SOURCE, "utf8");

/** Extract the shipped RITUAL_SAVE_PROPS literal from source. */
function ritualSaveProps(): Record<string, unknown> {
  const start = src.indexOf("const RITUAL_SAVE_PROPS = {");
  expect(start).toBeGreaterThan(-1);
  const open = src.indexOf("{", start);
  const end = src.indexOf("\n} as const;", open);
  const literal = src.slice(open, end + 2);
  const MANIFEST_PROP = { client_manifest_version: { type: "string" } };
  // eslint-disable-next-line no-new-func -- reads the shipped literal verbatim
  return new Function("MANIFEST_PROP", `return (${literal});`)(MANIFEST_PROP);
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile({
  type: "object",
  properties: ritualSaveProps(),
  required: ["session_id", "client_request_id"],
  additionalProperties: false,
});

/** Mirror of the shipped handler mapping (asserted against source below). */
const toDecisionRpc = (d: Record<string, string>) => ({
  p_title: d.title,
  p_decision_md: d.decision_md ?? d.title,
  p_authority_tier: d.authority_tier ?? null,
  p_client_ref: d.client_ref ?? null,
});
const toSignalRpc = (sg: Record<string, string>) => ({
  p_title: sg.title,
  p_pattern: sg.pattern ?? null,
  p_client_ref: sg.client_ref ?? null,
});

describe("save_session contract parity", () => {
  it("MAXIMAL: every declared decision and signal field validates and survives the handler mapping", () => {
    const payload = {
      session_id: "11111111-1111-1111-1111-111111111111",
      client_request_id: "req-maximal-0001",
      decisions: [{
        title: "Ship Lane A",
        rationale: "Contract drift is silent data loss.",
        decision_owner: "Jake",
        execution_owner: "COB",
        reversible: "yes",
        decision_md: "Full text of the decision, materially longer than the title.",
        authority_tier: "T2",
        client_ref: "dec-001",
      }],
      signals: [{
        title: "Schema drift",
        description: "Handler read fields the schema rejected.",
        implication: "Silent degradation",
        type: "risk",
        status: "open",
        pattern: "contract-drift",
        client_ref: "sig-001",
      }],
    };
    expect(validate(payload)).toBe(true);

    const dec = toDecisionRpc(payload.decisions[0]);
    expect(dec.p_decision_md).toBe(payload.decisions[0].decision_md);
    expect(dec.p_decision_md).not.toBe(dec.p_title);
    expect(dec.p_authority_tier).toBe("T2");
    expect(dec.p_client_ref).toBe("dec-001");

    const sig = toSignalRpc(payload.signals[0]);
    expect(sig.p_pattern).toBe("contract-drift");
    expect(sig.p_client_ref).toBe("sig-001");
  });

  it("MINIMAL: required-only payload still validates and degrades decision_md to title", () => {
    const payload = {
      session_id: "22222222-2222-2222-2222-222222222222",
      client_request_id: "req-minimal-0001",
      decisions: [{ title: "Hold" }],
      signals: [{ title: "Quiet" }],
    };
    expect(validate(payload)).toBe(true);
    expect(toDecisionRpc(payload.decisions[0]).p_decision_md).toBe("Hold");
    expect(toSignalRpc(payload.signals[0]).p_pattern).toBeNull();
  });

  it("FORBIDDEN: an undeclared property is rejected before the handler runs", () => {
    const payload = {
      session_id: "33333333-3333-3333-3333-333333333333",
      client_request_id: "req-forbidden-0001",
      decisions: [{ title: "Typo", decision_md_typo: "nope" }],
    };
    expect(validate(payload)).toBe(false);
    expect(JSON.stringify(validate.errors)).toContain("decision_md_typo");
  });

  it("handler mapping mirrors the shipped source", () => {
    expect(src).toContain("p_decision_md: d.decision_md ?? d.title");
    expect(src).toContain("p_authority_tier: d.authority_tier ?? null");
    expect(src).toContain("p_pattern: sg.pattern ?? null");
  });

  it("TOOL_MANIFEST_VERSION was bumped to 2026.07.31.3", () => {
    expect(src).toContain('const TOOL_MANIFEST_VERSION = "2026.07.31.3";');
  });
});
