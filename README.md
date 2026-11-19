# ClaimCheck Hybrid

**Offline-first evidence checking with receipts.**

Paste any claim — a prize pool, a supply promise, a launch date, a
partnership announcement. ClaimCheck Hybrid screens it **on-device with
Gemini Nano** (private, works offline), and anything long, doubtful or
flagged escalates automatically to a **cloud deep check with Gemini via
Firebase AI Logic**. Every verdict follows the ClaimCheck methodology:
primary sources first, verbatim quotes for every load-bearing fact, the
negative space reported explicitly, and an honest `UNVERIFIABLE` when the
record does not settle the question.

Built for **#BuildHybridAI 2026** (Google × Firebase, Devpost) — Web track.

## Why hybrid?

| | On-device screen (Gemini Nano) | Cloud deep check (Gemini) |
|---|---|---|
| Latency | Instant | Seconds |
| Network | None — works offline | Required |
| Privacy | Claim text never leaves the device | Only escalated checks are sent |
| Depth | Preliminary verdict + red flags | Full evidence chain with citations |
| Cost | Free | Only paid for the checks that need it |

Most one-line claims are settled locally. The router escalates when any of
these fire: long input (> 600 chars), screen confidence < 0.70, any red
flag, an `UNVERIFIABLE` screen, or an explicit user request. The tier that
produced each verdict is recorded (`inferenceSource` from Firebase AI
Logic, plus the router's reasons) — the hybrid split is auditable, not
marketing.

## How Firebase AI Logic is used

- **Hybrid model for the screen** — `getGenerativeModel(ai, { mode:
  InferenceMode.PREFER_ON_DEVICE, inCloudParams: { model: "gemini-3.8-flash" } })`:
  Gemini Nano in Chrome when present, cloud Gemini as automatic fallback.
  When the Chrome Prompt API is directly available it is used for the
  screen, guaranteeing a zero-network first pass.
- **Cloud-only model for the deep check** — `InferenceMode.ONLY_IN_CLOUD`,
  so a deep check never silently degrades to the small on-device model.
- **App Check** — initialised with reCAPTCHA Enterprise when a site key is
  configured; a debug token is used for judging (see HOOKUP.md).
- **Firestore** — every completed check (verdict, evidence chain, tier,
  route reasons) is archived in the `checks` collection; a localStorage
  store keeps the app fully functional offline and in demo mode.

## Demo mode (no Firebase project needed)

With no `.env` config — or with `?demo=1` — the app runs end-to-end on a
deterministic mock backend: screen → route → deep check → history, using a
real bundled verification as the sample case ("Load the sample case").
Mock reports are labelled `mock (demo mode)` and can never be mistaken for
live checks.

```bash
npm install
npm run dev        # demo mode out of the box
npm test           # 24 tests: router, parsing, mock pipeline, methodology
npm run build      # production build (cloud layer is code-split)
```

## Going live

See **[HOOKUP.md](HOOKUP.md)** — create a Firebase project, paste the web
config into `.env`, enable AI Logic + App Check, deploy rules/hosting.
Five steps, ~10 minutes.

## Layout

```
src/
  methodology.ts  The ClaimCheck rules, encoded as both tiers' prompts
  ondevice.ts     Gemini Nano screen via the Chrome Prompt API
  router.ts       Escalation decisions (pure, fully tested)
  cloud.ts        Firebase AI Logic backends + App Check + Firestore store
  mock.ts         Deterministic demo-mode backend
  pipeline.ts     screen → route → deep → save orchestration
  verdict.ts      Strict parsing/validation of model JSON output
  store.ts        History: Firestore in production, localStorage offline
  main.ts         UI wiring
tests/            Vitest suite (router, verdict parsing, mock, pipeline, methodology)
docs/VIDEO-SCRIPT.md   ≤3-minute demo video script (EN + Chinese notes)
```

## Methodology credit

The verdict format — graded verdict, confidence with a one-line reason,
evidence ranked by source authority with verbatim quotes, "searched, not
found", plain-language bottom line — comes from **ClaimCheck**, an
evidence-checking service developed for the NEAR AI Agent Market. This
project turns that human-delivered methodology into a hybrid on-device /
cloud application.

## License

MIT — see [LICENSE](LICENSE).
