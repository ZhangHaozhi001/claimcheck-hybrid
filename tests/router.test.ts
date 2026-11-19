import { describe, expect, it } from "vitest";
import { decideRoute } from "../src/router";
import type { ScreenResult } from "../src/types";

const calmScreen: ScreenResult = {
  preliminaryVerdict: "TRUE",
  confidenceScore: 0.95,
  summary: "Settled from the text.",
  flags: [],
  model: "test",
};

describe("decideRoute", () => {
  it("settles a short, confident, flag-free claim on-device", () => {
    const d = decideRoute({ claim: "The fund holds 100 tokens." }, calmScreen);
    expect(d.escalateToCloud).toBe(false);
    expect(d.reasons).toEqual([]);
  });

  it("escalates long input (document, not a one-liner)", () => {
    const d = decideRoute({ claim: "short", context: "x".repeat(700) }, calmScreen);
    expect(d.escalateToCloud).toBe(true);
    expect(d.reasons.join(" ")).toMatch(/long input/);
  });

  it("escalates when screen confidence is below the floor", () => {
    const d = decideRoute({ claim: "c" }, { ...calmScreen, confidenceScore: 0.4 });
    expect(d.escalateToCloud).toBe(true);
    expect(d.reasons.join(" ")).toMatch(/confidence/);
  });

  it("escalates when the screen raised flags", () => {
    const d = decideRoute({ claim: "c" }, { ...calmScreen, flags: ["missing payout asset"] });
    expect(d.escalateToCloud).toBe(true);
    expect(d.reasons.join(" ")).toMatch(/flag/);
  });

  it("escalates an UNVERIFIABLE screen — a screen is never the final word on a claim it cannot settle", () => {
    const d = decideRoute(
      { claim: "c" },
      { ...calmScreen, preliminaryVerdict: "UNVERIFIABLE", confidenceScore: 0.99 },
    );
    expect(d.escalateToCloud).toBe(true);
  });

  it("escalates when the user forces a deep check", () => {
    const d = decideRoute({ claim: "c", forceDeep: true }, calmScreen);
    expect(d.escalateToCloud).toBe(true);
    expect(d.reasons.join(" ")).toMatch(/user requested/);
  });
});
