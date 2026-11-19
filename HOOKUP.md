# HOOKUP — connecting a real Firebase project

Everything that does not need the project owner's Google account is already
built and tested. These are the only remaining steps. Total ≈ 10 minutes.

## Step 1 — Create the Firebase project (project owner, ~3 min)

1. Open <https://console.firebase.google.com> and sign in.
2. **Add project** → name it `claimcheck-hybrid` → disable Google Analytics
   (not needed) → Create.
3. In the project overview, click the **Web** icon (`</>`) to add a web app,
   nickname `claimcheck-hybrid-web`, tick "Also set up Firebase Hosting",
   Register app. Keep the resulting `firebaseConfig` object on screen for
   step 2.

## Step 2 — Fill in the config (Muse or owner, ~1 min)

Copy `.env.example` to `.env` and paste the values from step 1:

```bash
cp .env.example .env
# VITE_FIREBASE_API_KEY=…  VITE_FIREBASE_AUTH_DOMAIN=…  etc.
```

No secrets are committed: `.env` is git-ignored, and Firebase web config
values are project identifiers, not private keys. Then:

```bash
npm run build && npm run preview   # banner must now read "Production mode…"
```

## Step 3 — Enable Firebase AI Logic + App Check (~3 min)

1. Firebase console → **Build → AI Logic** → Get started → choose the
   **Gemini Developer API** backend (free tier / Spark is fine for judging).
2. **App settings → App Check** → register the web app with
   **reCAPTCHA Enterprise**, copy the site key into `.env` as
   `VITE_RECAPTCHA_SITE_KEY=…`.
   - Judging shortcut (accepted by the contest rules): skip reCAPTCHA,
     register a **debug token** instead — run the app once locally, copy
     the debug token printed in the browser console
     (`self.FIREBASE_APPCHECK_DEBUG_TOKEN`), and add it under
     App Check → Apps → Manage debug tokens.

## Step 4 — Firestore (~2 min)

1. Firebase console → **Build → Firestore Database** → Create database
   (production mode, nearest region).
2. Deploy the bundled rules:

```bash
npx firebase-tools login
npx firebase-tools use <your-project-id>
npx firebase-tools deploy --only firestore:rules
```

## Step 5 — Deploy hosting + smoke test (~2 min)

```bash
npx firebase-tools deploy --only hosting
```

Open the hosting URL, run the bundled sample case, and confirm:
- the banner reads "Production mode",
- the verdict card shows `tier: cloud` with model `gemini-3.8-flash`,
- the check appears in Firestore under the `checks` collection,
- in Chrome with Gemini Nano available, a short settled claim reports
  `tier: on-device`.

## After hookup

- Record the demo video per `docs/VIDEO-SCRIPT.md` against the live URL.
- Submit on Devpost before **2026-11-30 14:00 PT (Dec 1, 06:00 CST)**:
  repo URL, hosting URL, video (≤ 3 min), and the text description from
  the README's "How Firebase AI Logic is used" section.
