/**
 * On-device tier: Gemini Nano in Chrome via the Prompt API.
 *
 * Chrome exposes the built-in model as `window.ai.languageModel`
 * (older flag builds) or the global `LanguageModel` (current builds).
 * Both shapes are feature-detected; if neither exists — or the model is
 * not downloaded yet — the caller falls back to the Firebase AI Logic
 * hybrid model with PREFER_ON_DEVICE, and finally to demo mode.
 *
 * This tier never leaves the device: the claim text is screened locally,
 * which is the privacy/offline half of the hybrid design.
 */
import type { CheckInput, ScreenResult } from "./types";
import { SCREEN_SYSTEM_PROMPT } from "./methodology";
import { parseScreenResult } from "./verdict";

interface PromptSession {
  prompt(input: string): Promise<string>;
  destroy?: () => void;
}

interface LanguageModelFactory {
  availability?: () => Promise<string>;
  capabilities?: () => Promise<{ available: string }>;
  create: (opts?: Record<string, unknown>) => Promise<PromptSession>;
}

function getFactory(): LanguageModelFactory | null {
  const w = window as unknown as Record<string, unknown>;
  const ai = w.ai as Record<string, unknown> | undefined;
  if (ai && typeof ai.languageModel === "object" && ai.languageModel !== null) {
    return ai.languageModel as LanguageModelFactory;
  }
  if (typeof w.LanguageModel === "object" && w.LanguageModel !== null) {
    return w.LanguageModel as LanguageModelFactory;
  }
  return null;
}

/** True when a Gemini Nano Prompt API surface exists in this browser. */
export function hasOnDeviceModel(): boolean {
  return getFactory() !== null;
}

export async function onDeviceAvailable(): Promise<boolean> {
  const factory = getFactory();
  if (!factory) return false;
  try {
    if (factory.availability) return (await factory.availability()) !== "unavailable";
    if (factory.capabilities) return (await factory.capabilities()).available !== "no";
    return true;
  } catch {
    return false;
  }
}

/** Run the screening prompt on Gemini Nano, fully on-device. */
export async function screenOnDevice(input: CheckInput): Promise<ScreenResult> {
  const factory = getFactory();
  if (!factory) throw new Error("Gemini Nano Prompt API not available in this browser");
  const session = await factory.create({ systemPrompt: SCREEN_SYSTEM_PROMPT });
  try {
    const userText =
      `CLAIM:\n${input.claim}\n\n` +
      (input.context ? `SOURCE MATERIAL PROVIDED BY THE USER:\n${input.context}\n` : "") +
      `\nScreen this claim now. JSON only.`;
    const raw = await session.prompt(userText);
    return parseScreenResult(raw, "gemini-nano (on-device, Chrome Prompt API)");
  } finally {
    session.destroy?.();
  }
}
