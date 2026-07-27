/**
 * Integration test · MCP envelope conformance.
 *
 * Why this exists: the official MCP SDK validates every inbound frame with
 * JSONRPCMessageSchema, which is STRICT — any unrecognized top-level key
 * (e.g. a `build_id` stamp) makes the client discard the frame silently.
 * The client then waits for a response that never arrives and times out.
 *
 * This test does two things:
 *   1. Replicates JSONRPCMessageSchema and validates representative envelopes
 *      produced by the mcp-council edge function's response helpers.
 *   2. Statically scans supabase/functions/mcp-council/index.ts for every
 *      hand-built `jsonrpc: "2.0"` object literal and asserts none of them
 *      carry extra top-level keys.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// ── JSONRPCMessageSchema replica (modelcontextprotocol/typescript-sdk) ──

const JSONRPC_VERSION = "2.0";
const RequestId = z.union([z.string(), z.number().int()]);

const JSONRPCRequestSchema = z
  .object({
    jsonrpc: z.literal(JSONRPC_VERSION),
    id: RequestId,
    method: z.string(),
    params: z.optional(z.object({}).passthrough()),
  })
  .strict();

const JSONRPCNotificationSchema = z
  .object({
    jsonrpc: z.literal(JSONRPC_VERSION),
    method: z.string(),
    params: z.optional(z.object({}).passthrough()),
  })
  .strict();

const JSONRPCResponseSchema = z
  .object({
    jsonrpc: z.literal(JSONRPC_VERSION),
    id: RequestId.nullable(),
    result: z.object({}).passthrough(),
  })
  .strict();

const JSONRPCErrorSchema = z
  .object({
    jsonrpc: z.literal(JSONRPC_VERSION),
    id: RequestId.nullable(),
    error: z
      .object({
        code: z.number().int(),
        message: z.string(),
        data: z.optional(z.unknown()),
      })
      .passthrough(),
  })
  .strict();

const JSONRPCMessageSchema = z.union([
  JSONRPCRequestSchema,
  JSONRPCNotificationSchema,
  JSONRPCResponseSchema,
  JSONRPCErrorSchema,
]);

// ── Helpers mirroring the edge function's envelope builders ──

const rpcResult = (id: unknown, result: unknown) => ({
  jsonrpc: "2.0",
  id: (id ?? null) as string | number | null,
  result,
});

const rpcError = (id: unknown, code: number, message: string) => ({
  jsonrpc: "2.0",
  id: (id ?? null) as string | number | null,
  error: { code, message },
});

const progressFrame = (
  progressToken: string | number,
  progress: number,
  message: string,
) => ({
  jsonrpc: "2.0",
  method: "notifications/progress",
  params: { progressToken, progress, message },
});

describe("MCP JSON-RPC envelope conformance", () => {
  it("accepts a tools/call result envelope", () => {
    const env = rpcResult(7, {
      content: [{ type: "text", text: "ok" }],
      structuredContent: { ok: true },
      isError: false,
    });
    expect(JSONRPCMessageSchema.safeParse(env).success).toBe(true);
  });

  it("accepts initialize, tools/list and resources/read envelopes", () => {
    const envelopes = [
      rpcResult(1, { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "cob", version: "1" } }),
      rpcResult(2, { tools: [{ name: "welcome_party", description: "d", inputSchema: { type: "object" } }] }),
      rpcResult(3, { contents: [{ uri: "ui://cob/welcome", mimeType: "text/html", text: "<div/>" }] }),
      rpcResult(null, { resources: [] }),
    ];
    for (const env of envelopes) {
      expect(JSONRPCMessageSchema.safeParse(env).success).toBe(true);
    }
  });

  it("accepts error envelopes and SSE progress notifications", () => {
    expect(JSONRPCMessageSchema.safeParse(rpcError(4, -32600, "invalid_request")).success).toBe(true);
    expect(JSONRPCMessageSchema.safeParse(rpcError(null, -32700, "parse_error")).success).toBe(true);
    expect(JSONRPCMessageSchema.safeParse(progressFrame("tok", 2, "working")).success).toBe(true);
  });

  it("rejects an envelope carrying a build_id stamp (the timeout regression)", () => {
    const stamped = { ...rpcResult(9, { tools: [] }), build_id: "welcome_party_v19" };
    expect(JSONRPCMessageSchema.safeParse(stamped).success).toBe(false);
  });

  it("rejects an envelope carrying both result and error", () => {
    const both = { jsonrpc: "2.0", id: 1, result: {}, error: { code: -1, message: "x" } };
    expect(JSONRPCMessageSchema.safeParse(both).success).toBe(false);
  });
});

// ── Static scan of the shipped edge function source ──

const SOURCE = path.resolve(
  __dirname,
  "../../supabase/functions/mcp-council/index.ts",
);

/** Collect top-level keys of every object literal that opens a jsonrpc envelope. */
function envelopeKeySets(src: string): string[][] {
  const sets: string[][] = [];
  const marker = /jsonrpc:\s*"2\.0"/g;
  let m: RegExpExecArray | null;

  while ((m = marker.exec(src)) !== null) {
    // Walk backwards to the opening brace of this literal.
    let open = m.index;
    while (open >= 0 && src[open] !== "{") open--;
    if (open < 0) continue;

    // Walk forward tracking depth; record keys seen at depth 1.
    const keys: string[] = [];
    let depth = 0;
    let i = open;
    let buf = "";
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{" || c === "[" || c === "(") {
        if (depth === 1) buf = "";
        depth++;
        continue;
      }
      if (c === "}" || c === "]" || c === ")") {
        depth--;
        if (depth === 0) break;
        continue;
      }
      if (depth === 1) {
        if (c === ":") {
          const key = buf.trim().replace(/^["']|["']$/g, "");
          if (/^[A-Za-z_$][\w$]*$/.test(key)) keys.push(key);
          buf = "";
        } else if (c === "," || c === "\n") {
          buf = "";
        } else {
          buf += c;
        }
      }
    }
    sets.push(keys);
  }
  return sets;
}

describe("mcp-council source · no extra envelope keys", () => {
  const src = readFileSync(SOURCE, "utf8");
  const allowed = new Set(["jsonrpc", "id", "result", "error", "method", "params"]);

  it("finds the envelope builders in source", () => {
    const sets = envelopeKeySets(src);
    expect(sets.length).toBeGreaterThan(0);
  });

  it("emits only jsonrpc/id/result|error (or method/params for notifications)", () => {
    const offenders = envelopeKeySets(src)
      .filter((keys) => keys.some((k) => !allowed.has(k)))
      .map((keys) => keys.join(","));
    expect(offenders).toEqual([]);
  });

  it("never stamps build_id onto a JSON-RPC envelope", () => {
    const offenders = envelopeKeySets(src).filter((keys) => keys.includes("build_id"));
    expect(offenders).toEqual([]);
  });
});
