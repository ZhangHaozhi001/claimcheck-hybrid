import { describe, expect, it } from "vitest";
import { mockDeep, mockScreen } from "../src/mock";
import { SAMPLE_CLAIM, SAMPLE_CONTEXT } from "../src/sample";

describe("mock backend — bundled sample case", () => {
  it("screen flags the missing payout asset", () => {
    const s = mockScreen({ claim: SAMPLE_CLAIM, context: SAMPLE_CONTEXT });
    expect(s.flags.length).toBeGreaterThan(0);
    expect(s.confidenceScore).toBeLessThan(0.7);
  });

  it("deep check returns MISLEADING with a verbatim quote from the fund line", () => {
    const r = mockDeep({ claim: SAMPLE_CLAIM, context: SAMPLE_CONTEXT });
    expect(r.verdict).toBe("MISLEADING");
    expect(r.confidence).toBe("High");
    expect(r.evidence.length).toBeGreaterThan(0);
    expect(r.evidence[0].quote).toContain("62,413,767 QOR");
    // Regression: the fund symbol must be the real ticker "QOR" — a
    // case-insensitive regex once extracted "ficial" from "official".
    expect(r.evidence[0].proves).toContain("denominated in QOR");
    expect(r.evidence[0].proves).not.toContain("ficial");
    expect(r.searchedNotFound.length).toBeGreaterThan(0);
    expect(r.model).toMatch(/mock/);
  });
});

describe("mock backend — other shapes", () => {
  it("confirms a figure that the context states verbatim", () => {
    const r = mockDeep({
      claim: "The fund holds a total of 416,091,780 QOR.",
      context: "The QOR Builders Fund holds a total of 416,091,780 QOR for ecosystem programmes.",
    });
    expect(r.verdict).toBe("TRUE");
  });

  it("refuses to guess when nothing settles the claim", () => {
    const r = mockDeep({ claim: "Project X will launch on March 3." });
    expect(r.verdict).toBe("UNVERIFIABLE");
    expect(r.searchedNotFound.length).toBeGreaterThan(0);
  });
});
