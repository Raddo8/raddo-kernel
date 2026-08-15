/**
 * HARDEN-10 · K3(a)(d) · Tool contract generator for edge-served tools.
 *
 * A hand-written contract drifts. This one is read off the source on every
 * deploy: it segments the connector dispatch by tool, then collects the
 * registers each segment touches and the database functions it calls.
 *
 * Output is a JSON array shaped for public.sync_tool_contract_edge(jsonb).
 * Run: bun scripts/derive-tool-contract.ts > /tmp/tool-contract.json
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "supabase/functions/mcp-council";
const EDGE_FUNCTION = "mcp-council";

/** Read every .ts file under the connector directory, concatenated in a stable order. */
const sources = (): string => {
  const walk = (dir: string): string[] =>
    readdirSync(dir)
      .sort()
      .flatMap((entry) => {
        const path = join(dir, entry);
        return statSync(path).isDirectory()
          ? walk(path)
          : path.endsWith(".ts")
            ? [path]
            : [];
      });
  return walk(ROOT)
    .map((path) => `\n/* FILE ${path} */\n${readFileSync(path, "utf8")}`)
    .join("");
};

const WRITE_VERBS = /\.(insert|upsert|update|delete)\s*\(/;

type Contract = {
  tool_key: string;
  edge_function: string;
  reads: string[];
  writes: string[];
  degraded_behavior: string;
};

/**
 * Segment boundaries: the connector dispatches on `name === "tool"`, and several
 * branches handle a group of tools in one condition. Markers closer together
 * than GROUP_GAP belong to the same branch and therefore share its body.
 */
const GROUP_GAP = 140;

const segmentByTool = (src: string): Map<string, string> => {
  const marker = /name\s*===\s*"([a-z0-9_]+)"/g;
  const hits: Array<{ tool: string; at: number }> = [];
  for (const m of src.matchAll(marker)) hits.push({ tool: m[1], at: m.index ?? 0 });

  // Collapse adjacent markers into branches.
  const branches: Array<{ tools: string[]; at: number }> = [];
  for (const hit of hits) {
    const last = branches[branches.length - 1];
    if (last && hit.at - last.at < GROUP_GAP * last.tools.length + GROUP_GAP) {
      last.tools.push(hit.tool);
    } else {
      branches.push({ tools: [hit.tool], at: hit.at });
    }
  }

  const out = new Map<string, string>();
  branches.forEach((branch, i) => {
    const end = branches[i + 1]?.at ?? Math.min(branch.at + 20_000, src.length);
    const body = src.slice(branch.at, end);
    for (const tool of branch.tools) out.set(tool, (out.get(tool) ?? "") + body);
  });
  return out;
};

const registersIn = (segment: string): { reads: string[]; writes: string[] } => {
  const reads = new Set<string>();
  const writes = new Set<string>();

  for (const m of segment.matchAll(/\.from\(\s*"([a-z0-9_]+)"\s*\)/g)) {
    const table = m[1];
    const tail = segment.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 200);
    if (WRITE_VERBS.test(tail)) writes.add(table);
    else reads.add(table);
  }
  for (const m of segment.matchAll(/\.rpc\(\s*"([a-z0-9_]+)"/g)) {
    // The path is declared even when the register is reached through a function.
    writes.add(`rpc:${m[1]}`);
  }
  return { reads: [...reads].sort(), writes: [...writes].sort() };
};

/**
 * A dispatch branch usually delegates: `out = await laneRecord(admin, cid, args)`.
 * Follow one level so the declared path names the registers the helper touches
 * rather than stopping at the call site.
 */
const followHelpers = (segment: string, src: string): string => {
  const called = new Set<string>();
  for (const m of segment.matchAll(/await\s+([A-Za-z_$][\w$]*)\s*\(/g)) called.add(m[1]);

  let extra = "";
  for (const fn of called) {
    const decl = new RegExp(
      `(?:export\\s+)?(?:async\\s+function\\s+${fn}\\b|(?:const|let)\\s+${fn}\\s*[:=][^\\n]*=>)`,
    );
    const hit = decl.exec(src);
    if (hit) extra += src.slice(hit.index, hit.index + 8_000);
  }
  return segment + extra;
};

export const deriveContracts = (toolKeys: string[]): Contract[] => {
  const src = sources();
  const segments = segmentByTool(src);
  return toolKeys.map((tool_key) => {
    const segment = followHelpers(segments.get(tool_key) ?? "", src);
    const { reads, writes } = registersIn(segment);
    return {
      tool_key,
      edge_function: EDGE_FUNCTION,
      reads,
      writes,
      degraded_behavior: segment
        ? `Served by ${EDGE_FUNCTION}. Registers and function calls above are read off the deployed source, not authored. On failure the tool returns a stated error object rather than a bare success.`
        : `Served by ${EDGE_FUNCTION}. No dispatch segment was found for this tool key in the deployed source, which is itself a finding: the catalog names a tool the code does not serve.`,
    };
  });
};

if (import.meta.main) {
  const keys = process.argv.slice(2);
  if (keys.length === 0) {
    console.error("usage: bun scripts/derive-tool-contract.ts <tool_key> [<tool_key> ...]");
    process.exit(1);
  }
  console.log(JSON.stringify(deriveContracts(keys), null, 2));
}
