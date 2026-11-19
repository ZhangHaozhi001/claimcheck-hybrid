/**
 * ClaimCheck Hybrid — UI wiring.
 *
 * Boot sequence:
 *  1. If a Firebase config exists and demo mode is not forced, build the
 *     production backends (Gemini Nano screen + Firebase AI Logic deep
 *     check + Firestore history). Any failure falls back to demo mode with
 *     a visible banner — the app must never dead-end on a config problem.
 *  2. Otherwise run in demo mode: mock backends + local history.
 */
import { isDemoMode } from "./config";
import { mockDeep, mockScreen } from "./mock";
import { runCheck, type Backends } from "./pipeline";
import { LocalStore, type HistoryStore } from "./store";
import type { HistoryEntry } from "./types";
import { SAMPLE_CLAIM, SAMPLE_CONTEXT } from "./sample";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const claimEl = $<HTMLTextAreaElement>("claim");
const contextEl = $<HTMLTextAreaElement>("context");
const forceEl = $<HTMLInputElement>("force-deep");
const runBtn = $<HTMLButtonElement>("run");
const statusEl = $<HTMLParagraphElement>("status");
const resultEl = $<HTMLElement>("result");
const historyEl = $<HTMLUListElement>("history");
const bannerEl = $<HTMLParagraphElement>("mode-banner");
const historyHintEl = $<HTMLParagraphElement>("history-hint");

let backends: Backends;
let store: HistoryStore;

async function boot(): Promise<void> {
  if (!isDemoMode()) {
    try {
      const cloud = await import("./cloud");
      backends = await cloud.createFirebaseBackends();
      store = await cloud.createHistoryStore();
      bannerEl.textContent =
        "Production mode: Gemini Nano on-device screen + Firebase AI Logic cloud deep check. History in Firestore.";
      historyHintEl.textContent = "Stored in Firestore (collection: checks).";
      return;
    } catch (err) {
      console.error("Firebase boot failed, falling back to demo mode:", err);
    }
  }
  backends = {
    label: "Demo mode (mock backends — connect Firebase for live models)",
    screen: async (input) => mockScreen(input),
    deep: async (input) => mockDeep(input),
  };
  store = new LocalStore();
  bannerEl.textContent =
    "DEMO MODE: no Firebase config found, so mock backends and local history are active. The full hybrid flow still runs end-to-end — see HOOKUP.md to go live.";
  historyHintEl.textContent = "Stored locally in your browser (demo mode).";
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function renderEntry(entry: HistoryEntry): void {
  const ev = entry.evidence
    .map(
      (e) => `
        <li>
          <div><strong>#${e.rank} ${esc(e.source)}</strong>${
            e.url ? ` — <a href="${esc(e.url)}" target="_blank" rel="noreferrer">source</a>` : ""
          }</div>
          <blockquote>${esc(e.quote)}</blockquote>
          <div>${esc(e.proves)}</div>
        </li>`,
    )
    .join("");
  const notFound = entry.searchedNotFound.map((s) => `<li>${esc(s)}</li>`).join("");
  const route = entry.route
    ? entry.route.escalateToCloud
      ? `Escalated to cloud: ${entry.route.reasons.map(esc).join("; ")}`
      : "Settled on-device (offline path — no network used)."
    : "";

  resultEl.innerHTML = `
    <h2>Verdict</h2>
    <p>
      <span class="verdict ${entry.verdict}">${entry.verdict}</span>
      <span class="tier">confidence ${entry.confidence} · tier: ${entry.tier} · model: ${esc(entry.model)}</span>
    </p>
    <p><strong>Claim:</strong> ${esc(entry.claim)}</p>
    <p><strong>Why this confidence:</strong> ${esc(entry.confidenceReason)}</p>
    ${route ? `<p class="tier">${route}</p>` : ""}
    ${ev ? `<h3>Evidence (ranked by authority)</h3><ol>${ev}</ol>` : ""}
    ${notFound ? `<h3>Searched, not found</h3><ul>${notFound}</ul>` : ""}
    <h3>Bottom line</h3>
    <p>${esc(entry.bottomLine)}</p>
    <p class="tier">Checked at ${esc(entry.checkedAt)}</p>`;
  resultEl.classList.remove("hidden");
}

async function refreshHistory(): Promise<void> {
  const entries = await store.list(20);
  historyEl.innerHTML = "";
  for (const e of entries) {
    const li = document.createElement("li");
    li.textContent = `${e.verdict} · ${e.claim.slice(0, 90)}`;
    li.title = `${e.checkedAt} — click to view`;
    li.addEventListener("click", () => renderEntry(e));
    historyEl.appendChild(li);
  }
}

runBtn.addEventListener("click", async () => {
  const claim = claimEl.value.trim();
  if (!claim) {
    statusEl.textContent = "Enter a claim first.";
    return;
  }
  runBtn.disabled = true;
  statusEl.textContent = `Running hybrid check (${backends.label})…`;
  try {
    const entry = await runCheck(
      { claim, context: contextEl.value.trim() || undefined, forceDeep: forceEl.checked },
      backends,
      store,
    );
    renderEntry(entry);
    await refreshHistory();
    statusEl.textContent = "Done.";
  } catch (err) {
    statusEl.textContent = `Check failed: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    runBtn.disabled = false;
  }
});

$<HTMLButtonElement>("demo-case").addEventListener("click", () => {
  claimEl.value = SAMPLE_CLAIM;
  contextEl.value = SAMPLE_CONTEXT;
  statusEl.textContent = "Sample case loaded — a real verification. Hit “Check this claim”.";
});

boot().then(refreshHistory).catch((err) => {
  bannerEl.textContent = `Boot error: ${err instanceof Error ? err.message : String(err)}`;
});
