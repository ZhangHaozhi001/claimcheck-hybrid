/**
 * Firebase configuration — ALL values come from environment variables.
 *
 * Copy `.env.example` to `.env` and fill in the config from the Firebase
 * console (Project settings → Your apps → Web app). Until then the app
 * boots in DEMO MODE with the mock backend and local history.
 *
 * TODO-HOOKUP: see HOOKUP.md step 2.
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const env = import.meta.env as Record<string, string | undefined>;

export const firebaseConfig: FirebaseWebConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: env.VITE_FIREBASE_APP_ID ?? "",
};

/** True once a real Firebase project config is present. */
export function hasFirebaseConfig(): boolean {
  return firebaseConfig.apiKey.length > 0 && firebaseConfig.projectId.length > 0;
}

/** Demo mode: forced by ?demo=1, or implied by a missing Firebase config. */
export function isDemoMode(): boolean {
  const forced = new URLSearchParams(location.search).get("demo");
  return forced === "1" || !hasFirebaseConfig();
}
