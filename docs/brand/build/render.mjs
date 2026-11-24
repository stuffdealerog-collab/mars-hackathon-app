// Renders the Mercat brand kit PNGs from kit.html and the SVG marks in public/brand.
//
//   PLAYWRIGHT_CORE=<path to playwright-core> ONEST_DIR=<dir with Onest woff2> node docs/brand/build/render.mjs
//
// PLAYWRIGHT_CORE defaults to the `playwright-core` package; Chromium must be installed for it.
// ONEST_DIR holds onest-latin.woff2, onest-latin-ext.woff2, onest-cyrillic.woff2 and
// onest-cyrillic-ext.woff2 (the variable Onest faces next/font downloads into .next/**/media).
// No network and no paid image APIs: everything is drawn by the browser.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const brand = join(repo, "public/brand");
const app = join(repo, "src/app");
const fontDir = process.env.ONEST_DIR;
const faces = ["latin", "latin-ext", "cyrillic", "cyrillic-ext"];
if (!fontDir || faces.some((f) => !existsSync(join(fontDir, `onest-${f}.woff2`)))) {
  throw new Error("Set ONEST_DIR to a folder with onest-{latin,latin-ext,cyrillic,cyrillic-ext}.woff2");
}
const fontCss = faces
  .map((f) => `@font-face{font-family:Onest;font-weight:100 900;src:url("${pathToFileURL(join(fontDir, `onest-${f}.woff2`)).href}") format("woff2")}`)
  .join("\n");

const kit = (params) => `${pathToFileURL(join(here, "kit.html")).href}?${new URLSearchParams(params)}`;
const svgIcon = (file, size) => ({ url: kit({ s: "icon", src: `../../../public/brand/${file}`, size }), w: size, h: size, transparent: true });

const jobs = [
  ...["uz", "ru", "en"].map((lang) => ({ out: join(brand, `og-${lang}.png`), url: kit({ s: "og", lang }), w: 1200, h: 630 })),
  { out: join(brand, "github-social.png"), url: kit({ s: "gh" }), w: 1280, h: 640 },
  ...["uz", "ru", "en"].map((lang) => ({
    out: join(brand, lang === "uz" ? "tg-cover.png" : `tg-cover-${lang}.png`),
    url: kit({ s: "cover", lang }),
    w: 1280,
    h: 720,
  })),
  { out: join(brand, "readme-hero.png"), url: kit({ s: "hero" }), w: 1280, h: 560, dpr: 1.5 },
  { out: join(brand, "bot-avatar.png"), url: kit({ s: "avatar" }), w: 640, h: 640 },
  ...[16, 32, 48].map((size) => ({ out: join(brand, `icon-${size}.png`), ...svgIcon("mark-small.svg", size) })),
  ...[192, 512].map((size) => ({ out: join(brand, `icon-${size}.png`), ...svgIcon("mark.svg", size) })),
  { out: join(brand, "icon-maskable-512.png"), ...svgIcon("mark-full.svg", 512), transparent: false },
  { out: join(brand, "apple-touch-icon.png"), ...svgIcon("mark-full.svg", 180), transparent: false },
];

// The contact sheet for docs/brand/brand-kit.md and the PR: drawn last, from the files above.
const b = (file) => `../../../public/brand/${file}`;
const sheet = [
  { src: b("og-uz.png"), w: 740, span: 2, label: "og-uz.png · 1200×630 · opengraph-image, twitter-image" },
  { src: b("github-social.png"), w: 740, span: 2, label: "github-social.png · 1280×640" },
  { src: b("tg-cover.png"), w: 740, span: 2, label: "tg-cover.png · 1280×720" },
  { src: b("readme-hero.png"), w: 740, span: 2, label: "readme-hero.png · 1920×840" },
  { src: b("og-ru.png"), w: 350, label: "og-ru.png" },
  { src: b("og-en.png"), w: 350, label: "og-en.png" },
  { src: b("tg-cover-ru.png"), w: 350, label: "tg-cover-ru.png" },
  { src: b("tg-cover-en.png"), w: 350, label: "tg-cover-en.png" },
  { src: b("bot-avatar.png"), w: 220, label: "bot-avatar.png · 640, circle-safe" },
  { src: b("icon-maskable-512.png"), w: 220, label: "icon-maskable-512.png" },
  { src: b("apple-touch-icon.png"), w: 180, label: "apple-touch-icon.png · 180" },
  { src: b("mark.svg"), w: 220, label: "mark.svg" },
  { src: b("logo.svg"), w: 520, span: 2, label: "logo.svg · outlined Onest 600" },
  { src: b("logo-light.svg"), w: 520, span: 2, chk: true, label: "logo-light.svg" },
  { src: b("mark-small.svg"), w: 64, label: "mark-small.svg · favicon, icon.svg" },
  { src: b("icon-32.png"), w: 32, label: "icon-32.png at 1×" },
  { src: b("mark-mono.svg"), w: 96, label: "mark-mono.svg" },
  { src: b("miniapp-loading.svg"), w: 96, chk: true, label: "miniapp-loading.svg · BotFather" },
];
jobs.push({ out: join(here, "..", "contact-sheet.png"), url: kit({ s: "sheet", items: encodeURIComponent(JSON.stringify(sheet)) }), w: 1600, h: 1500, fit: true });

const browser = await chromium.launch();
for (const job of jobs) {
  const page = await browser.newPage({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: job.dpr ?? 1 });
  await page.goto(job.url);
  await page.addStyleTag({ content: fontCss });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode()));
  });
  const height = job.fit ? await page.evaluate(() => document.body.scrollHeight) : job.h;
  await page.screenshot({ path: job.out, omitBackground: !!job.transparent, clip: { x: 0, y: 0, width: job.w, height }, fullPage: !!job.fit });
  await page.close();
  console.log("wrote", job.out.slice(repo.length + 1));
}
await browser.close();

// Next.js metadata files (src/app): the Uzbek card is the default link preview.
copyFileSync(join(brand, "og-uz.png"), join(app, "opengraph-image.png"));
copyFileSync(join(brand, "og-uz.png"), join(app, "twitter-image.png"));
copyFileSync(join(brand, "apple-touch-icon.png"), join(app, "apple-icon.png"));
copyFileSync(join(brand, "mark-small.svg"), join(app, "icon.svg"));

// favicon.ico: 16, 32 and 48 px PNG frames in one ICO container.
const frames = [16, 32, 48].map((size) => ({ size, png: readFileSync(join(brand, `icon-${size}.png`)) }));
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach(({ size, png }, i) => {
  const at = 6 + 16 * i;
  header.writeUInt8(size, at);
  header.writeUInt8(size, at + 1);
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(png.length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += png.length;
});
writeFileSync(join(app, "favicon.ico"), Buffer.concat([header, ...frames.map((f) => f.png)]));
console.log("wrote src/app/{opengraph-image,twitter-image,apple-icon}.png, icon.svg, favicon.ico");
