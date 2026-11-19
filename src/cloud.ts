/**
 * Production backends — Firebase AI Logic (hybrid inference) + Firestore.
 *
 * This module is imported dynamically by main.ts only when a Firebase
 * config exists. Everything Firebase-specific lives here so the rest of
 * the app (router, methodology, parsing) stays platform-pure and testable.
 *
 * Hybrid design (the core of the #BuildHybridAI entry):
 *  - SCREEN: a Firebase AI Logic hybrid model with
 *    InferenceMode.PREFER_ON_DEVICE — Gemini Nano in Chrome when present,
 *    cloud Gemini as automatic fallback. When the Chrome Prompt API is
 *    directly available we use it for the screen (zero network at all).
 *  - DEEP: a Firebase AI Logic model with InferenceMode.ONLY_IN_CLOUD —
 *    the deep check must never silently degrade to the small model.
 *  - The response's `inferenceSource` is recorded on every report so the
 *    tier that actually produced a verdict is auditable, not assumed.
 *
 * TODO-HOOKUP: needs a real Firebase project — see HOOKUP.md steps 1–4.
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  type AI,
  type GenerativeModel,
} from "firebase/ai";
import { firebaseConfig } from "./config";
import { DEEP_SYSTEM_PROMPT, SCREEN_SYSTEM_PROMPT } from "./methodology";
import { hasOnDeviceModel, screenOnDevice } from "./ondevice";
import { parseDeepReport, parseScreenResult } from "./verdict";
import { FirestoreStore, type HistoryStore } from "./store";
import type { Backends } from "./pipeline";
import type { CheckInput } from "./types";

const CLOUD_MODEL = "gemini-2.5-flash";

let app: FirebaseApp | null = null;
let ai: AI | null = null;
let db: Firestore | null = null;

function ensureApp(): { app: FirebaseApp; ai: AI; db: Firestore } {
  if (app && ai && db) return { app, ai, db };
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  ai = getAI(app, { backend: new GoogleAIBackend() });
  void initAppCheck(app);
  return { app, ai, db };
}

/**
 * Firebase AI Logic requires App Check. With a reCAPTCHA Enterprise site
 * key in VITE_RECAPTCHA_SITE_KEY we initialise the real provider; for
 * judging, a debug token is accepted instead (see HOOKUP.md step 3).
 */
async function initAppCheck(firebaseApp: FirebaseApp): Promise<void> {
  const siteKey = (import.meta.env as Record<string, string | undefined>)
    .VITE_RECAPTCHA_SITE_KEY;
  if (!siteKey) {
    console.warn(
      "[ClaimCheck] VITE_RECAPTCHA_SITE_KEY not set — App Check not initialised. " +
        "TODO-HOOKUP: see HOOKUP.md step 3 (a debug token is fine for judging).",
    );
    return;
  }
  const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import(
    "firebase/app-check"
  );
  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

function screenModel(aiInstance: AI): GenerativeModel {
  return getGenerativeModel(aiInstance, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    inCloudParams: { model: CLOUD_MODEL, systemInstruction: SCREEN_SYSTEM_PROMPT },
  });
}

function deepModel(aiInstance: AI): GenerativeModel {
  return getGenerativeModel(aiInstance, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: CLOUD_MODEL, systemInstruction: DEEP_SYSTEM_PROMPT },
  });
}

function userText(input: CheckInput): string {
  return (
    `CLAIM:\n${input.claim}\n\n` +
    (input.context ? `SOURCE MATERIAL PROVIDED BY THE USER:\n${input.context}\n` : "") +
    `\nApply the methodology now. JSON only.`
  );
}

export async function createFirebaseBackends(): Promise<Backends> {
  const { ai: aiInstance } = ensureApp();
  const screen = screenModel(aiInstance);
  const deep = deepModel(aiInstance);

  return {
    label: "Firebase AI Logic (hybrid)",
    async screen(input: CheckInput) {
      // Prefer the raw Chrome Prompt API when present: guaranteed local.
      if (hasOnDeviceModel()) {
        try {
          return await screenOnDevice(input);
        } catch (err) {
          console.warn("Prompt API screen failed, using hybrid model:", err);
        }
      }
      const result = await screen.generateContent(userText(input));
      const source = result.response.inferenceSource;
      const where =
        source === InferenceSource.ON_DEVICE ? "on-device via Firebase AI Logic" : "cloud fallback via Firebase AI Logic";
      return parseScreenResult(result.response.text(), `gemini-nano hybrid screen (${where})`);
    },
    async deep(input: CheckInput) {
      const result = await deep.generateContent(userText(input));
      return parseDeepReport(
        result.response.text(),
        input.claim,
        `${CLOUD_MODEL} (cloud, Firebase AI Logic)`,
        "cloud",
      );
    },
  };
}

export async function createHistoryStore(): Promise<HistoryStore> {
  const { db: firestore } = ensureApp();
  return new FirestoreStore(firestore);
}
