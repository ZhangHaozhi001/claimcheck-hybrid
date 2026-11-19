/**
 * ClaimCheck Hybrid — production smoke test (HOOKUP step 5).
 * Drives the real built app in headless Chromium (puppeteer-core + cached
 * Chrome) and records evidence for the five smoke checks:
 *   1. on-device Nano screen (Prompt API probe + real mini-session if ready)
 *   2. cloud deep check via Firebase AI Logic (network log + verdict card)
 *   3. Firestore write + read-back (history render + REST cross-check)
 *   4. history list visible in the page
 *   5. offline / demo-mode fallback still usable
 * Usage: node scripts/smoke.mjs [url]   (default: serve local dist/)
 */
import puppeteer from "puppeteer-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const EXE = "/home/hatch/.cache/puppeteer/chrome/linux-157.0.8103.78/chrome-linux64/chrome";
const DIST = new URL("../dist/", import.meta.url).pathname;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".map": "application/json", ".svg": "image/svg+xml" };

let base = process.argv[2];
let server = null;
if (!base) {
  server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p === "/") p = "/index.html";
      const data = await readFile(join(DIST, normalize(p)));
      res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" });
      res.end(data);
    } catch { res.writeHead(404).end("nf"); }
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
}
console.log("BASE:", base);

// The VM's egress goes through an authenticated proxy (env vars). Chrome
// cannot present those credentials itself (--proxy-server rejects userinfo,
// page.authenticate doesn't answer proxy 407s in headless), so point
// SMOKE_PROXY at a local relay that injects the auth header upstream.
// Without SMOKE_PROXY, fall back to the env proxy + page.authenticate().
const proxyRaw = [process.env.https_proxy, process.env.HTTPS_PROXY, process.env.all_proxy].find((v) => v && v.includes("@")) ?? process.env.https_proxy ?? "";
const proxyUrl = new URL(proxyRaw);
const proxyServer = process.env.SMOKE_PROXY ?? `${proxyUrl.protocol}//${proxyUrl.host}`;
const proxyAuth = process.env.SMOKE_PROXY ? null : proxyUrl.username ? { username: decodeURIComponent(proxyUrl.username), password: decodeURIComponent(proxyUrl.password) } : null;

const out = { base, console: [], net: [], phases: {} };
const browser = await puppeteer.launch({
  executablePath: EXE,
  headless: true,
  userDataDir: "/tmp/smoke-chrome-profile",
  args: [
    "--no-sandbox", "--disable-dev-shm-usage",
    // Test-harness only: the VM's MITM egress proxy presents a custom CA
    // that Chrome's root store doesn't trust (curl uses the system bundle
    // and is fine). Judges' browsers don't face this proxy.
    "--ignore-certificate-errors",
    `--proxy-server=${proxyServer}`, "--proxy-bypass-list=127.0.0.1;localhost",
    "--enable-features=OptimizationGuideOnDeviceModel,PromptApiForGeminiNano",
  ],
});

function wire(page, tag) {
  if (proxyAuth) page.authenticate(proxyAuth).catch(() => {});
  page.on("console", (m) => { const t = `${tag} [${m.type()}] ${m.text()}`; if (!/favicon/.test(t)) out.console.push(t.slice(0, 400)); });
  page.on("pageerror", (e) => out.console.push(`${tag} [pageerror] ${String(e).slice(0, 300)}`));
  page.on("response", (r) => {
    const u = r.url();
    if (/firebasevertexai|firestore\.googleapis|firebaseappcheck/.test(u)) {
      out.net.push(`${tag} ${r.status()} ${r.request().method()} ${u.replace(/^(https:\/\/[^/]+).*/, "$1/…")}${u.includes(":generateContent") ? " :generateContent" : u.includes("exchangeDebugToken") ? " :exchangeDebugToken" : u.includes("/documents") ? " /documents…" : ""}`);
    }
  });
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (/firebase|googleapis/.test(u)) out.net.push(`${tag} FAILED ${u.slice(0, 110)} :: ${r.failure()?.errorText}`);
  });
  page.on("request", (r) => {
    if (!/firebasevertexai/.test(r.url()) || r.method() !== "POST") return;
    const tok = r.headers()["x-firebase-appcheck"];
    if (!tok) { out.appcheck = out.appcheck ?? []; out.appcheck.push(`${tag} NO x-firebase-appcheck header`); return; }
    try {
      const p = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString());
      out.appcheck = out.appcheck ?? [];
      out.appcheck.push(`${tag} token claims: provider=${p.provider} aud=${JSON.stringify(p.aud)} exp=${p.exp} jti=${String(p.jti).slice(0, 8)} len=${tok.length}`);
    } catch { out.appcheck = out.appcheck ?? []; out.appcheck.push(`${tag} undecodable token len=${tok.length}`); }
  });
}

try {
  // ---------- Phase A: production mode ----------
  const page = await browser.newPage();
  wire(page, "A");
  await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
  // Wait for boot to settle (production banner, demo banner, or boot error).
  await page.waitForFunction(
    () => /Production mode|DEMO MODE|Boot error/.test(document.querySelector("#mode-banner")?.textContent ?? ""),
    { timeout: 90000 },
  ).catch(() => {});
  out.phases.A_banner = await page.$eval("#mode-banner", (el) => el.textContent);

  // 1) On-device Nano probe
  out.phases.A_nano = await page.evaluate(async () => {
    const r = { hasLanguageModelGlobal: typeof window.LanguageModel !== "undefined", hasAiLanguageModel: !!(window.ai && window.ai.languageModel) };
    const factory = window.LanguageModel ?? window.ai?.languageModel;
    if (factory?.availability) {
      try { r.availability = await Promise.race([factory.availability(), new Promise((_, rej) => setTimeout(() => rej(new Error("availability timeout 20s")), 20000))]); }
      catch (e) { r.availabilityError = String(e).slice(0, 200); }
    }
    if (factory && ["available", "readily", "downloadable", "downloading"].includes(r.availability ?? "")) {
      try {
        const s = await Promise.race([
          factory.create({ systemPrompt: "You reply with JSON only." }),
          new Promise((_, rej) => setTimeout(() => rej(new Error("create timeout 240s (model download?)")), 240000)),
        ]);
        r.miniSessionOutput = (await s.prompt('Reply with exactly this JSON: {"ok":true}')).slice(0, 200);
        s.destroy?.();
      } catch (e) { r.miniSessionError = String(e).slice(0, 200); }
    }
    return r;
  });

  // Run the bundled sample case end-to-end (screen -> escalate -> deep -> save)
  await page.click("#demo-case");
  await page.click("#run");
  try {
    await page.waitForFunction(
      () => /^Done\.|Check failed/.test(document.querySelector("#status")?.textContent ?? ""),
      { timeout: 300000 },
    );
  } catch { out.phases.A_runTimeout = true; }
  out.phases.A_status = await page.$eval("#status", (el) => el.textContent);
  out.phases.A_result = await page.evaluate(() => {
    const el = document.querySelector("#result");
    if (!el || el.classList.contains("hidden")) return null;
    return el.textContent.replace(/\s+/g, " ").slice(0, 900);
  });
  out.phases.A_historyCount = await page.$$eval("#history li", (els) => els.length).catch(() => -1);
  out.phases.A_historyHint = await page.$eval("#history-hint", (el) => el.textContent).catch(() => null);
  await page.close();

  // ---------- Phase A2: history list fallback ----------
  // Seed the local store before boot; in production mode the history list
  // must still render it if Firestore reads are rejected (rules pending).
  const page2 = await browser.newPage();
  wire(page2, "A2");
  await page2.evaluateOnNewDocument(() => {
    const entry = {
      id: "smoke-seed-1", claim: "SMOKE SEED: fallback list probe", verdict: "UNVERIFIABLE",
      confidence: "Low", confidenceReason: "seed", evidence: [], searchedNotFound: [],
      bottomLine: "seed", tier: "cloud", model: "seed", checkedAt: new Date().toISOString(),
    };
    localStorage.setItem("claimcheck-hybrid-history-v1", JSON.stringify([entry]));
  });
  await page2.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await new Promise((r) => setTimeout(r, 20000));
  out.phases.A2_historyTexts = await page2.$$eval("#history li", (els) => els.map((e) => e.textContent)).catch(() => []);
  out.phases.A2_bannerAfterSettle = await page2.$eval("#mode-banner", (el) => el.textContent).catch(() => null);
  await page2.close();

  // ---------- Phase B: offline + demo fallback ----------
  const pageB = await browser.newPage();
  wire(pageB, "B");
  await pageB.goto(base + "/?demo=1", { waitUntil: "domcontentloaded", timeout: 90000 });
  await pageB.waitForFunction(() => document.querySelector("#mode-banner")?.textContent?.includes("DEMO"), { timeout: 60000 });
  out.phases.B_banner = await pageB.$eval("#mode-banner", (el) => el.textContent.slice(0, 80));
  await pageB.emulateNetworkConditions({ latency: 0, downloadThroughput: 0, uploadThroughput: 0, offline: true });
  await pageB.click("#demo-case");
  await pageB.click("#run");
  try {
    await pageB.waitForFunction(() => document.querySelector("#result")?.textContent?.includes("MISLEADING"), { timeout: 30000 });
    out.phases.B_offlineVerdict = "MISLEADING shown while offline";
  } catch { out.phases.B_offlineVerdict = "FAILED: no verdict while offline"; }
  out.phases.B_status = await pageB.$eval("#status", (el) => el.textContent);
  out.phases.B_historyCount = await pageB.$$eval("#history li", (els) => els.length).catch(() => -1);
  await pageB.close();
} finally {
  await browser.close();
  server?.close();
}
console.log(JSON.stringify(out, null, 1));
