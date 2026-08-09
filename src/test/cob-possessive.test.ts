import { describe, expect, it } from "vitest";

import { possessiveSuffix, railSuffix } from "@/lib/cob-possessive";

describe("possessiveSuffix", () => {
  it("drops the S for a name ending in uppercase S", () => {
    expect(possessiveSuffix("ATLAS")).toBe("'");
    expect(railSuffix("ATLAS")).toBe("' \u00b7 HQ");
  });

  it("drops the S for a name ending in lowercase s", () => {
    expect(possessiveSuffix("Ross")).toBe("'");
  });

  it("keeps the S for an ordinary name", () => {
    expect(possessiveSuffix("JAEL")).toBe("'S");
    expect(railSuffix("COB")).toBe("'S \u00b7 HQ");
  });

  it("keeps the S for an empty or null name", () => {
    expect(possessiveSuffix("")).toBe("'S");
    expect(possessiveSuffix(null)).toBe("'S");
    expect(possessiveSuffix(undefined)).toBe("'S");
  });

  it("ignores trailing whitespace", () => {
    expect(possessiveSuffix("ATLAS  ")).toBe("'");
    expect(possessiveSuffix("JAEL ")).toBe("'S");
  });
});
