import { describe, expect, it } from "vitest";
import { DEEP_SYSTEM_PROMPT, SCREEN_SYSTEM_PROMPT } from "../src/methodology";

describe("ClaimCheck methodology is encoded in both tier prompts", () => {
  it("deep prompt demands primary sources and verbatim quotes", () => {
    expect(DEEP_SYSTEM_PROMPT).toMatch(/source of truth/i);
    expect(DEEP_SYSTEM_PROMPT).toMatch(/verbatim quote/i);
  });

  it("deep prompt encodes the negative-space rule and the no-guessing rule", () => {
    expect(DEEP_SYSTEM_PROMPT).toMatch(/negative space/i);
    expect(DEEP_SYSTEM_PROMPT).toMatch(/UNVERIFIABLE/);
    expect(DEEP_SYSTEM_PROMPT).toMatch(/Never guess/);
  });

  it("screen prompt is conservative about unverifiable specifics", () => {
    expect(SCREEN_SYSTEM_PROMPT).toMatch(/UNVERIFIABLE/);
    expect(SCREEN_SYSTEM_PROMPT).toMatch(/below 0\.7/);
  });
});
