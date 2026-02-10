import { describe, it, expect } from "vitest";
import {
  canonicalStringify,
  hashPredicate,
  resolveField,
  evaluatePredicate,
} from "@/lib/policy-rules-engine";

const NOW = new Date("2025-06-15T12:00:00Z").getTime();
const past = (minAgo: number) => new Date(NOW - minAgo * 60000).toISOString();
const future = (minAhead: number) => new Date(NOW + minAhead * 60000).toISOString();

describe("V1 operators", () => {
  it("equals / not_equals", () => {
    const item = { status: "active" };
    expect(evaluatePredicate({ field: "status", op: "equals", value: "active" }, item, NOW)).toBe(true);
    expect(evaluatePredicate({ field: "status", op: "equals", value: "closed" }, item, NOW)).toBe(false);
    expect(evaluatePredicate({ field: "status", op: "not_equals", value: "closed" }, item, NOW)).toBe(true);
    expect(evaluatePredicate({ field: "status", op: "not_equals", value: "active" }, item, NOW)).toBe(false);
  });

  it("gt / gte / lt / lte", () => {
    const item = { amount: 100 };
    expect(evaluatePredicate({ field: "amount", op: "gt", value: 50 }, item, NOW)).toBe(true);
    expect(evaluatePredicate({ field: "amount", op: "gt", value: 100 }, item, NOW)).toBe(false);
    expect(evaluatePredicate({ field: "amount", op: "gte", value: 100 }, item, NOW)).toBe(true);
    expect(evaluatePredicate({ field: "amount", op: "lt", value: 200 }, item, NOW)).toBe(true);
    expect(evaluatePredicate({ field: "amount", op: "lt", value: 100 }, item, NOW)).toBe(false);
    expect(evaluatePredicate({ field: "amount", op: "lte", value: 100 }, item, NOW)).toBe(true);
  });

  it("in / not_in", () => {
    const item = { status: "active" };
    expect(evaluatePredicate({ field: "status", op: "in", value: ["active", "paused"] }, item, NOW)).toBe(true);
    expect(evaluatePredicate({ field: "status", op: "in", value: ["closed"] }, item, NOW)).toBe(false);
    expect(evaluatePredicate({ field: "status", op: "not_in", value: ["closed"] }, item, NOW)).toBe(true);
    expect(evaluatePredicate({ field: "status", op: "not_in", value: ["active"] }, item, NOW)).toBe(false);
  });

  it("exists / not_exists", () => {
    expect(evaluatePredicate({ field: "name", op: "exists" }, { name: "x" }, NOW)).toBe(true);
    expect(evaluatePredicate({ field: "name", op: "exists" }, {}, NOW)).toBe(false);
    expect(evaluatePredicate({ field: "name", op: "exists" }, { name: null }, NOW)).toBe(false);
    expect(evaluatePredicate({ field: "name", op: "not_exists" }, {}, NOW)).toBe(true);
    expect(evaluatePredicate({ field: "name", op: "not_exists" }, { name: null }, NOW)).toBe(true);
    expect(evaluatePredicate({ field: "name", op: "not_exists" }, { name: "x" }, NOW)).toBe(false);
  });

  it("is_true / is_false", () => {
    expect(evaluatePredicate({ field: "active", op: "is_true" }, { active: true }, NOW)).toBe(true);
    expect(evaluatePredicate({ field: "active", op: "is_true" }, { active: false }, NOW)).toBe(false);
    expect(evaluatePredicate({ field: "active", op: "is_false" }, { active: false }, NOW)).toBe(true);
    expect(evaluatePredicate({ field: "active", op: "is_false" }, { active: true }, NOW)).toBe(false);
  });

  it("older_than_minutes", () => {
    const item = { due_date: past(10) };
    expect(evaluatePredicate({ field: "due_date", op: "older_than_minutes", value: 5 }, item, NOW)).toBe(true);
    expect(evaluatePredicate({ field: "due_date", op: "older_than_minutes", value: 15 }, item, NOW)).toBe(false);
    // future due_date: now - futureTime is negative, so always < positive threshold
    const futureItem = { due_date: future(10) };
    expect(evaluatePredicate({ field: "due_date", op: "older_than_minutes", value: 1 }, futureItem, NOW)).toBe(false);
  });

  it("newer_than_minutes", () => {
    const item = { due_date: past(5) };
    expect(evaluatePredicate({ field: "due_date", op: "newer_than_minutes", value: 10 }, item, NOW)).toBe(true);
    expect(evaluatePredicate({ field: "due_date", op: "newer_than_minutes", value: 3 }, item, NOW)).toBe(false);
  });

  it("all / any combinators", () => {
    const item = { amount: 100, status: "active" };
    expect(evaluatePredicate({ all: [{ field: "amount", op: "gt", value: 50 }, { field: "status", op: "equals", value: "active" }] }, item, NOW)).toBe(true);
    expect(evaluatePredicate({ all: [{ field: "amount", op: "gt", value: 50 }, { field: "status", op: "equals", value: "closed" }] }, item, NOW)).toBe(false);
    expect(evaluatePredicate({ any: [{ field: "status", op: "equals", value: "closed" }, { field: "amount", op: "gt", value: 50 }] }, item, NOW)).toBe(true);
    expect(evaluatePredicate({ any: [{ field: "status", op: "equals", value: "closed" }, { field: "amount", op: "lt", value: 1 }] }, item, NOW)).toBe(false);
  });

  it("nested combinators", () => {
    const item = { a: 1, b: 2, c: 3 };
    const pred = { all: [{ field: "a", op: "equals", value: 1 }, { any: [{ field: "b", op: "equals", value: 99 }, { field: "c", op: "equals", value: 3 }] }] };
    expect(evaluatePredicate(pred, item, NOW)).toBe(true);
  });
});

describe("dot-path resolution", () => {
  it("simple field", () => expect(resolveField({ name: "x" }, "name")).toBe("x"));
  it("nested path", () => expect(resolveField({ metadata: { foo: { bar: 42 } } }, "metadata.foo.bar")).toBe(42));
  it("missing intermediate", () => expect(resolveField({ metadata: {} }, "metadata.foo.bar")).toBeUndefined());
  it("null intermediate", () => expect(resolveField({ metadata: null }, "metadata.foo")).toBeUndefined());
  it("empty string path", () => expect(resolveField({ a: 1 }, "")).toBeUndefined());
});

describe("missing fields never throw", () => {
  const ops = ["equals", "not_equals", "gt", "gte", "lt", "lte", "in", "not_in"];
  for (const op of ops) {
    it(`${op} returns false for undefined field`, () => {
      const val = op === "in" || op === "not_in" ? ["a"] : 1;
      expect(evaluatePredicate({ field: "missing", op, value: val }, {}, NOW)).toBe(false);
    });
  }
  it("exists returns false for missing", () => expect(evaluatePredicate({ field: "x", op: "exists" }, {}, NOW)).toBe(false));
  it("not_exists returns true for missing", () => expect(evaluatePredicate({ field: "x", op: "not_exists" }, {}, NOW)).toBe(true));
  it("older_than_minutes returns false for missing", () => expect(evaluatePredicate({ field: "x", op: "older_than_minutes", value: 1 }, {}, NOW)).toBe(false));
  it("newer_than_minutes returns false for missing", () => expect(evaluatePredicate({ field: "x", op: "newer_than_minutes", value: 1 }, {}, NOW)).toBe(false));
});

describe("canonical hashing", () => {
  it("key order independence", async () => {
    const a = await hashPredicate({ a: 1, b: 2 });
    const b = await hashPredicate({ b: 2, a: 1 });
    expect(a).toBe(b);
  });
  it("nested key reorder stability", async () => {
    const a = await hashPredicate({ x: { b: 2, a: 1 } });
    const b = await hashPredicate({ x: { a: 1, b: 2 } });
    expect(a).toBe(b);
  });
  it("different values produce different hashes", async () => {
    const a = await hashPredicate({ a: 1 });
    const b = await hashPredicate({ a: 2 });
    expect(a).not.toBe(b);
  });
  it("array order preserved", async () => {
    const a = await hashPredicate([1, 2]);
    const b = await hashPredicate([2, 1]);
    expect(a).not.toBe(b);
  });
});

describe("idempotency key format", () => {
  it("produces deterministic key", async () => {
    const ruleId = "rule-abc";
    const itemId = "item-xyz";
    const predicate = { all: [{ field: "due_date", op: "older_than_minutes", value: 1 }] };
    const index = 0;
    const hash = await hashPredicate(predicate);
    const key1 = `policy:${ruleId}:${itemId}:${hash}:${index}`;
    const hash2 = await hashPredicate(predicate);
    const key2 = `policy:${ruleId}:${itemId}:${hash2}:${index}`;
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^policy:rule-abc:item-xyz:[a-f0-9]{8}:0$/);
  });
});
