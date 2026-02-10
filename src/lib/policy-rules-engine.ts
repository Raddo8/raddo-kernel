/**
 * Pure policy-rules engine. Zero imports, zero side effects.
 */

export function canonicalStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalStringify).join(",") + "]";
  }
  if (typeof obj === "object") {
    const sorted = Object.keys(obj as Record<string, unknown>).sort();
    return (
      "{" +
      sorted
        .map((k) => JSON.stringify(k) + ":" + canonicalStringify((obj as Record<string, unknown>)[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(obj);
}

export async function hashPredicate(predicate: unknown): Promise<string> {
  const str = canonicalStringify(predicate);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 8);
}

export function resolveField(item: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split(".");
  let current: unknown = item;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function evaluatePredicate(
  condition: Record<string, unknown>,
  item: Record<string, unknown>,
  now: number
): boolean {
  // Combinators
  if ("all" in condition) {
    const clauses = condition.all as Record<string, unknown>[];
    return clauses.every((c) => evaluatePredicate(c, item, now));
  }
  if ("any" in condition) {
    const clauses = condition.any as Record<string, unknown>[];
    return clauses.some((c) => evaluatePredicate(c, item, now));
  }

  const field = condition.field as string;
  const op = condition.op as string;
  const expected = condition.value;
  const resolved = resolveField(item, field);

  switch (op) {
    case "exists":
      return resolved !== undefined && resolved !== null;
    case "not_exists":
      return resolved === undefined || resolved === null;
    case "is_true":
      return resolved === true;
    case "is_false":
      return resolved === false;
    case "equals":
      return resolved !== undefined && resolved === expected;
    case "not_equals":
      return resolved !== undefined && resolved !== expected;
    case "gt":
      return resolved !== undefined && (resolved as number) > (expected as number);
    case "gte":
      return resolved !== undefined && (resolved as number) >= (expected as number);
    case "lt":
      return resolved !== undefined && (resolved as number) < (expected as number);
    case "lte":
      return resolved !== undefined && (resolved as number) <= (expected as number);
    case "in":
      return resolved !== undefined && (expected as unknown[]).includes(resolved);
    case "not_in":
      return resolved !== undefined && !(expected as unknown[]).includes(resolved);
    case "older_than_minutes": {
      if (resolved === undefined || resolved === null) return false;
      const fieldTime = new Date(resolved as string).getTime();
      return now - fieldTime > (expected as number) * 60000;
    }
    case "newer_than_minutes": {
      if (resolved === undefined || resolved === null) return false;
      const fieldTime = new Date(resolved as string).getTime();
      return now - fieldTime < (expected as number) * 60000;
    }
    default:
      return false;
  }
}
