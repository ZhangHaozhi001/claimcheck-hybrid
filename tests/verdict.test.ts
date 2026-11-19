import { describe, expect, it } from "vitest";
import { extractJson, parseDeepReport, parseScreenResult } from "../src/verdict";

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses JSON wrapped in prose and code fences", () => {
    const raw = 'Here is the result:\n```json\n{"a": {"b": 2}}\n```\nDone.';
    expect(extractJson(raw)).toEqual({ a: { b: 2 } });
  });

  it("throws on output with no JSON object", () => {
    expect(() => extractJson("no json here")).toThrow(/no JSON object/);
  });

  it("throws on unbalanced JSON", () => {
    expect(() => extractJson('{"a": 1')).toThrow(/unbalanced/);
  });
});

describe("parseScreenResult", () => {
  it("accepts a valid screen payload", () => {
    const r = parseScreenResult(
      '{"preliminaryVerdict":"MISLEADING","confidenceScore":0.4,"summary":"s","flags":["f1"]}',
      "nano",
    );
    expect(r.preliminaryVerdict).toBe("MISLEADING");
    expect(r.confidenceScore).toBe(0.4);
    expect(r.flags).toEqual(["f1"]);
    expect(r.model).toBe("nano");
  });

  it("rejects an out-of-range confidence score", () => {
    expect(() =>
      parseScreenResult(
        '{"preliminaryVerdict":"TRUE","confidenceScore":1.7,"summary":"s"}',
        "nano",
      ),
    ).toThrow(/confidenceScore/);
  });

  it("rejects an unknown verdict", () => {
    expect(() =>
      parseScreenResult(
        '{"preliminaryVerdict":"MAYBE","confidenceScore":0.5,"summary":"s"}',
        "nano",
      ),
    ).toThrow(/invalid verdict/);
  });
});

describe("parseDeepReport", () => {
  it("accepts a valid report and sorts evidence by authority rank", () => {
    const raw = JSON.stringify({
      verdict: "FALSE",
      confidence: "High",
      confidenceReason: "primary source contradicts the claim",
      evidence: [
        { rank: 3, source: "blog", quote: "q3", proves: "p3" },
        { rank: 1, source: "official docs", quote: "q1", proves: "p1" },
      ],
      searchedNotFound: ["FAQ: no answer"],
      bottomLine: "Do not rely on the claim.",
    });
    const r = parseDeepReport(raw, "the claim", "gemini", "cloud");
    expect(r.verdict).toBe("FALSE");
    expect(r.evidence.map((e) => e.rank)).toEqual([1, 3]);
    expect(r.tier).toBe("cloud");
    expect(r.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("rejects an invalid confidence level", () => {
    const raw = JSON.stringify({
      verdict: "TRUE",
      confidence: "Certain",
      confidenceReason: "x",
      evidence: [],
      bottomLine: "y",
    });
    expect(() => parseDeepReport(raw, "c", "m", "cloud")).toThrow(/confidence/);
  });
});
