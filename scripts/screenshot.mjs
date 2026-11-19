/**
 * Screenshot proof for demo mode: serves dist/, loads the sample case,
 * runs the full hybrid pipeline in a real Chromium, and captures:
 *   docs/screenshots/01-home.png       — initial page (demo banner visible)
 *   docs/screenshots/02-verdict.png    — sample-case verdict card + history
 * Run: npm run build && node scripts/screenshot.mjs
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const outDir = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".map": "application/json", ".svg": "image/svg+xml" };

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path === "/") path = "/index.html";
    const file = join(root, normalize(path));
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
});

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
console.log(`serving dist on http://127.0.0.1:${port}`);

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 1400 });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#mode-banner:not(:empty)");
  await page.screenshot({ path: join(outDir, "01-home.png"), fullPage: true });
  console.log("saved 01-home.png");

  await page.click("#demo-case");
  await page.click("#run");
  await page.waitForFunction(
    () => document.querySelector("#result")?.textContent?.includes("MISLEADING"),
    { timeout: 15000 },
  );
  // Let history render, then capture the verdict.
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: join(outDir, "02-verdict.png"), fullPage: true });
  console.log("saved 02-verdict.png");

  const banner = await page.$eval("#mode-banner", (el) => el.textContent);
  const verdict = await page.$eval("#result .verdict", (el) => el.textContent);
  const historyCount = await page.$$eval("#history li", (els) => els.length);
  console.log(JSON.stringify({ banner: banner?.slice(0, 60), verdict, historyCount }));
} finally {
  await browser.close();
  server.close();
}
