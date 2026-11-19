/**
 * The hybrid pipeline: screen → route → (maybe) deep check → save.
 *
 * Backends are injected so the exact same pipeline runs against:
 *  - production: Gemini Nano screen + Firebase AI Logic cloud deep check
 *  - demo mode: the deterministic mock backend (src/mock.ts)
 */
import type { CheckInput, CheckReport, HistoryEntry, ScreenResult } from "./types";
import { decideRoute } from "./router";
import type { HistoryStore } from "./store";

export interface Backends {
  /** Fast first pass. On-device in production, mock in demo mode. */
  screen(input: CheckInput): Promise<ScreenResult>;
  /** Cloud deep check via Firebase AI Logic (or mock in demo mode). */
  deep(input: CheckInput): Promise<CheckReport>;
  /** Label shown in the UI, e.g. "Firebase AI Logic" or "Demo mode (mock)". */
  label: string;
}

export async function runCheck(
  input: CheckInput,
  backends: Backends,
  store: HistoryStore,
): Promise<HistoryEntry> {
  const screen = await backends.screen(input);
  const route = decideRoute(input, screen);

  let report: CheckReport;
  if (route.escalateToCloud) {
    report = await backends.deep(input);
  } else {
    // The screen settled it: promote the screen to a final report. This is
    // the offline path — no network was touched at all.
    report = {
      claim: input.claim,
      verdict: screen.preliminaryVerdict,
      confidence: screen.confidenceScore >= 0.9 ? "High" : "Medium",
      confidenceReason: "Settled by the on-device screen; no escalation trigger fired.",
      evidence: [],
      searchedNotFound: [],
      bottomLine: screen.summary,
      tier: "on-device",
      model: screen.model,
      checkedAt: new Date().toISOString(),
    };
  }

  const entry: HistoryEntry = {
    ...report,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    screen,
    route,
  };
  await store.save(entry);
  return entry;
}
