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

/**
 * Cloud model for both the hybrid screen's cloud fallback and the deep
 * check. NOTE (2026-11-19 smoke test): gemini-2.5-flash is retired for
 * new users — the live API answers 404 "no longer available to new
 * users" and names gemini-3.8-flash as the replacement, which was
 * verified working against this project (see BUILD-REPORT.md 冒烟）.
 */
const CLOUD_MODEL = "gemini-3.8-flash";

let app: FirebaseApp | null = null;
let ai: AI | null = null;
let db: Firestore | null = null;
let readyPromise: Promise<{ app: FirebaseApp; ai: AI; db: Firestore }> | null = null;

/**
 * Initialise Firebase exactly once. ORDER MATTERS: App Check must be
 * initialised BEFORE getAI(). The AI service snapshots the app-check
 * instance in its constructor (getImmediate({ optional: true })); if
 * App Check is not registered yet at that moment, the snapshot is null
 * forever, no X-Firebase-AppCheck header is ever attached, and every
 * AI Logic call fails with 401 "Firebase App Check token is invalid".
 * (Found by the 2026-11-19 smoke test — see BUILD-REPORT.md 冒烟一节.)
 */
function ensureApp(): Promise<{ app: FirebaseApp; ai: AI; db: Firestore }> {
  if (app && ai && db) return Promise.resolve({ app, ai, db });
  if (!readyPromise) {
    readyPromise = (async () => {
      app = initializeApp(firebaseConfig);
      await initAppCheck(app);
      ai = getAI(app, { backend: new GoogleAIBackend() });
      db = getFirestore(app);
      return { app, ai, db };
    })();
  }
  return readyPromise;
}

/**
 * Firebase AI Logic requires App Check. Two supported setups:
 *  - reCAPTCHA Enterprise: set VITE_RECAPTCHA_SITE_KEY and the real
 *    provider is initialised.
 *  - Debug token (judging shortcut, HOOKUP.md step 3): set
 *    VITE_APPCHECK_DEBUG_TOKEN to a token registered in the console
 *    (App Check → Manage debug tokens). The value is injected at build
 *    time from .env (git-ignored) and is never committed to the repo.
 *    In debug mode the SDK exchanges it for a real App Check token via
 *    REST and never calls the provider, so a placeholder provider that
 *    always rejects is safe — and loud if debug mode ever fails to
 *    engage.
 */
async function initAppCheck(firebaseApp: FirebaseApp): Promise<void> {
  const env = import.meta.env as Record<string, string | undefined>;
  const siteKey = env.VITE_RECAPTCHA_SITE_KEY;
  const debugToken = env.VITE_APPCHECK_DEBUG_TOKEN;
  if (!siteKey && !debugToken) {
    console.warn(
      "[ClaimCheck] Neither VITE_RECAPTCHA_SITE_KEY nor VITE_APPCHECK_DEBUG_TOKEN is set — " +
        "App Check not initialised. TODO-HOOKUP: see HOOKUP.md step 3 (a debug token is fine for judging).",
    );
    return;
  }
  const { initializeAppCheck, ReCaptchaEnterpriseProvider, CustomProvider } =
    await import("firebase/app-check");
  if (debugToken) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string })
      .FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    initializeAppCheck(firebaseApp, {
      provider: new CustomProvider({
        getToken: () =>
          Promise.reject(
            new Error("App Check debug token active — provider must not be called"),
          ),
      }),
      isTokenAutoRefreshEnabled: true,
    });
    return;
  }
  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(siteKey as string),
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
  const { ai: aiInstance } = await ensureApp();
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
  const { db: firestore } = await ensureApp();
  return new FirestoreStore(firestore);
}
