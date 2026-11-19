/**
 * Strict parsing/validation of model JSON output.
 *
 * Both tiers are instructed to answer with a single JSON object. Models
 * still wrap output in prose or code fences often enough that parsing must
 * be defensive — and anything that does not validate is rejected, never
 * silently repaired into a verdict the model did not give.
 */
import type { CheckReport, Confidence, EvidenceItem, ScreenResult, Verdict } from "./types";
import { VERDICTS } from "./methodology";

const CONFIDENCES: Confidence[] = ["High", "Medium", "Low"];

/** Extract the first balanced JSON object from raw model text. */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = (fenced ? fenced[1] : raw).trim();
  const start = text.indexOf("{");
  if (start < 0) throw new Error("model output contains no JSON object");
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("model output JSON is unbalanced");
}

function asVerdict(v: unknown): Verdict {
  if (typeof v === "string" && (VERDICTS as readonly string[]).includes(v)) return v as Verdict;
  throw new Error(`invalid verdict: ${String(v)}`);
}

function asString(v: unknown, field: string): string {
  if (typeof v === "string" && v.length > 0) return v;
  throw new Error(`missing/invalid string field: ${field}`);
}

function asStringArray(v: unknown): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error("expected string array");
  return v.filter((x): x is string => typeof x === "string");
}

export function parseScreenResult(raw: string, model: string): ScreenResult {
  const obj = extractJson(raw) as Record<string, unknown>;
  const score = Number(obj.confidenceScore);
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new Error(`invalid confidenceScore: ${String(obj.confidenceScore)}`);
  }
  return {
    preliminaryVerdict: asVerdict(obj.preliminaryVerdict),
    confidenceScore: score,
    summary: asString(obj.summary, "summary"),
    flags: asStringArray(obj.flags),
    model,
  };
}

export function parseDeepReport(
  raw: string,
  claim: string,
  model: string,
  tier: "on-device" | "cloud",
): CheckReport {
  const obj = extractJson(raw) as Record<string, unknown>;
  const confidence = obj.confidence;
  if (typeof confidence !== "string" || !CONFIDENCES.includes(confidence as Confidence)) {
    throw new Error(`invalid confidence: ${String(confidence)}`);
  }
  const rawEvidence = obj.evidence === undefined ? [] : obj.evidence;
  if (!Array.isArray(rawEvidence)) throw new Error("evidence must be an array");
  const evidence: EvidenceItem[] = rawEvidence.map((e, i) => {
    const item = e as Record<string, unknown>;
    const rank = Number(item.rank);
    return {
      rank: Number.isFinite(rank) && rank >= 1 ? rank : i + 1,
      source: asString(item.source, `evidence[${i}].source`),
      url: typeof item.url === "string" ? item.url : undefined,
      quote: asString(item.quote, `evidence[${i}].quote`),
      proves: asString(item.proves, `evidence[${i}].proves`),
    };
  });
  evidence.sort((a, b) => a.rank - b.rank);

  return {
    claim,
    verdict: asVerdict(obj.verdict),
    confidence: confidence as Confidence,
    confidenceReason: asString(obj.confidenceReason, "confidenceReason"),
    evidence,
    searchedNotFound: asStringArray(obj.searchedNotFound),
    bottomLine: asString(obj.bottomLine, "bottomLine"),
    tier,
    model,
    checkedAt: new Date().toISOString(),
  };
}
