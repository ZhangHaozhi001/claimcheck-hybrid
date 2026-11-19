/**
 * Hybrid routing: decide whether the on-device screen is enough, or the
 * check must escalate to the cloud deep check (Firebase AI Logic / Gemini).
 *
 * Escalation triggers (any one is enough):
 *  - the combined input is long (a document, not a one-liner)
 *  - the on-device screen's confidence is below the floor
 *  - the screen raised any red flag
 *  - the screen's preliminary verdict is UNVERIFIABLE (a screen that cannot
 *    settle a claim must never be the final word)
 *  - the user explicitly asked for a deep check
 */
import type { CheckInput, RouteDecision, ScreenResult } from "./types";
import { LONG_INPUT_THRESHOLD, SCREEN_CONFIDENCE_FLOOR } from "./methodology";

export function decideRoute(input: CheckInput, screen: ScreenResult): RouteDecision {
  const reasons: string[] = [];
  const totalLength = input.claim.length + (input.context?.length ?? 0);

  if (input.forceDeep) reasons.push("user requested a deep check");
  if (totalLength > LONG_INPUT_THRESHOLD) {
    reasons.push(`long input (${totalLength} chars > ${LONG_INPUT_THRESHOLD})`);
  }
  if (screen.confidenceScore < SCREEN_CONFIDENCE_FLOOR) {
    reasons.push(
      `on-device confidence ${screen.confidenceScore.toFixed(2)} below floor ${SCREEN_CONFIDENCE_FLOOR}`,
    );
  }
  if (screen.flags.length > 0) {
    reasons.push(`on-device screen raised ${screen.flags.length} flag(s)`);
  }
  if (screen.preliminaryVerdict === "UNVERIFIABLE") {
    reasons.push("on-device screen could not settle the claim");
  }

  return { escalateToCloud: reasons.length > 0, reasons };
}
