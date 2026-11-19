/**
 * Deterministic mock backend — DEMO MODE ONLY.
 *
 * Used when no Firebase config is present (or ?demo=1): it lets the whole
 * hybrid pipeline (screen → route → deep check → history) run locally with
 * zero accounts, so judges and developers can exercise the app before the
 * Firebase project exists. It is a small rule engine over the provided
 * text — it does NOT call any model, and its reports are labelled
 * model: "mock (demo mode)" so they can never be mistaken for real checks.
 *
 * The rules implement the ClaimCheck methodology in miniature:
 * source-of-truth text first, verbatim quotes, negative space reported.
 */
import type { CheckInput, CheckReport, ScreenResult } from "./types";

const MONEY_RE = /\$\s?[\d,]+|USD|prize|reward|grant/i;
const STABLE_RE = /\b(USDT|USDC|USD|stablecoin)\b/i;
// Case-sensitive on purpose: the symbol must be a real uppercase ticker
// (QOR) — a case-insensitive match famously grabs "ficial" out of
// "official Tokenomics". Word boundary + uppercase-only avoids that.
const TOKEN_FUND_RE = /\b([A-Z]{2,6})\s+(?:Builders Fund|Fund|Tokenomics)\b/;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

export function mockScreen(input: CheckInput): ScreenResult {
  const text = `${input.claim}\n${input.context ?? ""}`;
  const flags: string[] = [];

  if (MONEY_RE.test(input.claim) && !STABLE_RE.test(text)) {
    flags.push("claim cites money but no payout asset/currency is named anywhere");
  }
  if (/guaranteed|risk-free|无风险|保本/i.test(input.claim)) {
    flags.push('"guaranteed return" language — a classic red flag');
  }
  if (/\b(20\d{2})\b/.test(input.claim) === false && /deadline|launch|ship/i.test(input.claim)) {
    flags.push("time-bound claim with no concrete date in the text");
  }

  const settleableFromText =
    input.context !== undefined &&
    input.context.length > 0 &&
    sentences(input.context).some((s) => input.claim.split(/\s+/).some((w) => w.length > 5 && s.includes(w)));

  const confidenceScore = flags.length > 0 ? 0.45 : settleableFromText ? 0.82 : 0.5;

  return {
    preliminaryVerdict: flags.length > 0 ? "MISLEADING" : settleableFromText ? "TRUE" : "UNVERIFIABLE",
    confidenceScore,
    summary: `Claim asserts: ${input.claim.trim().slice(0, 140)}`,
    flags,
    model: "mock on-device screen (demo mode)",
  };
}

export function mockDeep(input: CheckInput): CheckReport {
  const ctx = input.context ?? "";
  const ctxSentences = sentences(ctx);
  const evidence: CheckReport["evidence"] = [];
  const searchedNotFound: string[] = [];

  // Negative-space check: money claim, fund denominated in a project token,
  // and no stablecoin payout line for prizes.
  const fundMatch = ctx.match(TOKEN_FUND_RE);
  const prizeLine = ctxSentences.find((s) => /hackathon|prize|competition/i.test(s) && /%|fund/i.test(s));
  const stablePrizeLine = ctxSentences.find((s) => STABLE_RE.test(s) && /prize|bount/i.test(s));

  if (MONEY_RE.test(input.claim) && fundMatch && prizeLine && !stablePrizeLine) {
    evidence.push({
      rank: 1,
      source: "Provided official tokenomics / fund document",
      quote: prizeLine,
      proves: `The prize line sits inside a fund denominated in ${fundMatch[1]}, not in USD or a stablecoin.`,
    });
    searchedNotFound.push(
      "Provided materials: no sentence names a stablecoin or USD as the prize payout asset.",
    );
    return {
      claim: input.claim,
      verdict: "MISLEADING",
      confidence: "High",
      confidenceReason: "The decisive evidence is in the organiser's own fund document provided as context.",
      evidence,
      searchedNotFound,
      bottomLine:
        "The headline money figure may be real, but the payout asset is the project's own token, not dollars. Treat the USD value as materially lower than the headline until the organiser states the payout asset in writing.",
      tier: "cloud",
      model: "mock cloud deep check (demo mode)",
      checkedAt: new Date().toISOString(),
    };
  }

  // Direct confirmation: a context sentence shares the claim's key number.
  const claimNumber = input.claim.match(/[\d][\d,]*(\.\d+)?/)?.[0];
  const confirmLine = claimNumber
    ? ctxSentences.find((s) => s.includes(claimNumber))
    : undefined;
  if (confirmLine) {
    evidence.push({
      rank: 1,
      source: "Provided source material",
      quote: confirmLine,
      proves: "The source states the same figure the claim asserts.",
    });
    return {
      claim: input.claim,
      verdict: "TRUE",
      confidence: "Medium",
      confidenceReason: "Confirmed against the provided source text; no independent source was consulted in demo mode.",
      evidence,
      searchedNotFound,
      bottomLine:
        "The provided source backs the claim's key figure. In production mode the cloud tier cross-checks independent primary sources before raising confidence to High.",
      tier: "cloud",
      model: "mock cloud deep check (demo mode)",
      checkedAt: new Date().toISOString(),
    };
  }

  return {
    claim: input.claim,
    verdict: "UNVERIFIABLE",
    confidence: "Low",
    confidenceReason: "The provided material does not settle the claim, and demo mode has no live sources.",
    evidence,
    searchedNotFound: [
      "Provided context: no sentence settles the claim.",
      "Live primary sources: not consulted in demo mode (connect Firebase to enable the real cloud tier).",
    ],
    bottomLine:
      "Nothing in the provided material proves or refutes this claim. Per ClaimCheck methodology the honest verdict is UNVERIFIABLE — connect Firebase AI Logic for a live deep check against primary sources.",
    tier: "cloud",
    model: "mock cloud deep check (demo mode)",
    checkedAt: new Date().toISOString(),
  };
}
