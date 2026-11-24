// Mercat ad — records the REAL Studio UI for the glass cards (A3, A6) and the posts panel (A8).
// Runs in the Higgsfield sandbox (node + Playwright + headless Chromium) or locally.
// Uses the Studio's demo mode (?mock=1): sample data, no API calls, no cost.
//
//   node record_ui.mjs [url] [outDir]
//   -> <outDir>/run.webm (whole run), frame_00..frame_15.png (one every 2.5 s), posts.png, full.png
// Then cut 2 s windows for SR-A3 / SR3..SR7 with ffmpeg (see claude-chat-prompt.md, STEP 5).

const url =
  process.argv[2] ??
  "https://mercat-ai.vercel.app/studio?mock=1&demo=bir-havola&channel=t.me/nafis_kiyim";
const out = process.argv[3] ?? "ui";

let pw;
for (const name of ["playwright", "playwright-core", "@playwright/test"]) {
  try {
    pw = await import(name);
    break;
  } catch {}
}
if (!pw) {
  console.error("Playwright not importable. Try: npm i -g playwright && npx playwright install chromium (or NODE_PATH=$(npm root -g))");
  process.exit(2);
}
const { chromium } = pw;
const fs = await import("node:fs");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 810 },
  recordVideo: { dir: out, size: { width: 1440, height: 810 } },
  colorScheme: "dark",
  locale: "uz-UZ",
});
const page = await context.newPage();
await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

// the demo starts ~0.5 s after load and animates node by node: sample it every 2.5 s
for (let i = 0; i < 16; i++) {
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/frame_${String(i).padStart(2, "0")}.png` });
}
// results (posts, inbox) usually sit below the canvas
await page.mouse.wheel(0, 900);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/posts.png` });
await page.screenshot({ path: `${out}/full.png`, fullPage: true });

const video = page.video();
await context.close();
await browser.close();
const src = await video.path();
fs.renameSync(src, `${out}/run.webm`);
console.log(JSON.stringify({ video: `${out}/run.webm`, frames: 16, every_s: 2.5, posts: `${out}/posts.png` }));
