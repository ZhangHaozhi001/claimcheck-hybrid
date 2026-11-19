/**
 * Shared types for ClaimCheck Hybrid.
 *
 * The verdict format mirrors the ClaimCheck evidence-checking methodology
 * (see src/methodology.ts): a graded verdict, a confidence level with a
 * one-line reason, an evidence chain ranked by source authority with
 * verbatim quotes, an explicit "searched, not found" list, and a plain
 * language bottom line.
 */

export type Verdict = "TRUE" | "FALSE" | "MISLEADING" | "UNVERIFIABLE";

export type Confidence = "High" | "Medium" | "Low";

export type Tier = "on-device" | "cloud";

/** One piece of evidence, ranked by source authority (1 = primary source). */
export interface EvidenceItem {
  /** Authority rank: 1 official/primary, 2 corroborating official, 3 reputable secondary, 4 lead only. */
  rank: number;
  source: string;
  url?: string;
  /** Verbatim quote from the source — never paraphrased. */
  quote: string;
  /** What this quote proves, in one line. */
  proves: string;
}

export interface CheckReport {
  /** The claim, restated precisely. */
  claim: string;
  verdict: Verdict;
  confidence: Confidence;
  /** One-line reason for the confidence level. */
  confidenceReason: string;
  evidence: EvidenceItem[];
  /** Channels searched with no answer — proves the check was exhaustive. */
  searchedNotFound: string[];
  /** 2–4 sentences: what this means for the reader's decision. */
  bottomLine: string;
  /** Which tier produced the FINAL verdict. */
  tier: Tier;
  /** Model identifier that produced the final verdict (for audit). */
  model: string;
  /** ISO timestamp of the check. */
  checkedAt: string;
}

/** Result of the fast on-device screen (Gemini Nano). */
export interface ScreenResult {
  /** Preliminary verdict from the on-device model. */
  preliminaryVerdict: Verdict;
  /** 0..1 self-reported confidence of the on-device screen. */
  confidenceScore: number;
  /** Short on-device summary of what the claim asserts. */
  summary: string;
  /** Red flags spotted locally (missing payout asset, vague dates, …). */
  flags: string[];
  model: string;
}

/** Routing decision produced by src/router.ts. */
export interface RouteDecision {
  escalateToCloud: boolean;
  reasons: string[];
}

/** A saved history entry (Firestore document / local fallback record). */
export interface HistoryEntry extends CheckReport {
  id: string;
  /** The screen that preceded the final verdict, when a screen ran. */
  screen?: ScreenResult;
  route?: RouteDecision;
}

/** Raw text payload the user wants checked: a claim, optionally with source material. */
export interface CheckInput {
  claim: string;
  /** Optional long source material (rules page, doc excerpt, whitepaper text…). */
  context?: string;
  /** Force a cloud deep check even if the screen is confident. */
  forceDeep?: boolean;
}
