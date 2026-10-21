// Makes the pictures that show when someone posts a junhots.com link in Discord, X or Twitch chat
// (1200x630 JPGs in public/img/og/): one per hero for the Builds pages, plus one per main page.
// Run after new heroes or new hero art:
//
//     npm i -g playwright && npx playwright install chromium
//     node tools/make_link_previews.mjs            (all)
//     node tools/make_link_previews.mjs jaina      (one hero)
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const OUT = path.join(SITE, "img", "og");
const file = p => pathToFileURL(path.join(SITE, p)).href;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Role icons, same as public/site.js
const site = readFileSync(path.join(SITE, "site.js"), "utf8");
const ROLE_COLORS = eval("(" + site.match(/ROLE_COLORS = (\{[^;]*\});/)[1] + ")");
const ROLE_PATHS = eval("(" + site.match(/ROLE_PATHS = (\{[\s\S]*?\n\});/)[1] + ")");
const roleIcon = r => `<svg viewBox="0 0 24 24" style="color:${ROLE_COLORS[r]}">${ROLE_PATHS[r]}</svg>`;

const heroes = JSON.parse(readFileSync(path.join(SITE, "data", "heroes.json"), "utf8")).map(([id, name, , grole]) => ({ id, name, grole }));

const BASE = `
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500&display=block">
<style>
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; overflow: hidden; position: relative; background: #0b0c0f; color: #ececef; font-family: Geist, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.glow { position: absolute; inset: 0; background: radial-gradient(700px 360px at 18% -10%, rgba(82, 199, 255, 0.16), transparent 70%); }
.edge { position: absolute; left: 0; right: 0; bottom: 0; height: 6px; background: linear-gradient(90deg, #52c7ff, rgba(82, 199, 255, 0)); opacity: .8; }
.txt { position: absolute; left: 72px; top: 64px; bottom: 64px; width: 620px; display: flex; flex-direction: column; }
.logo { font-weight: 700; font-size: 34px; letter-spacing: -0.02em; }
.logo span { color: #52c7ff; text-shadow: 0 0 18px rgba(82, 199, 255, 0.6); }
.kicker { margin-top: auto; font: 500 22px "Geist Mono", monospace; color: #8b8f9a; letter-spacing: .02em; }
h1 { margin-top: 10px; font-weight: 700; font-size: 96px; line-height: .98; letter-spacing: -0.045em; }
h1.small { font-size: 80px; }
.role { margin-top: 22px; display: flex; align-items: center; gap: 12px; font-size: 28px; color: #c3c6ce; }
.role svg { width: 32px; height: 32px; }
.sub { margin-top: 22px; font-size: 28px; line-height: 1.35; color: #a3a7b1; max-width: 560px; }
.url { margin-top: auto; font: 500 22px "Geist Mono", monospace; color: #8b8f9a; }
.url b { color: #ececef; font-weight: 500; }
</style>`;

function heroPage(h) {
  return `${BASE}
<style>
.art { position: absolute; right: -10px; top: -40px; width: 520px; height: 755px; object-fit: cover; object-position: center top;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 38%), linear-gradient(to bottom, #000 70%, transparent); -webkit-mask-composite: source-in; }
</style>
<div class="glow"></div>
${existsSync(path.join(SITE, "img", "art", h.id + ".webp")) ? `<img class="art" src="${file(`img/art/${h.id}.webp`)}">` : ""}
<div class="txt">
  <div class="logo">Jun<span>HotS</span></div>
  <div class="kicker">TALENT BUILDS</div>
  <h1${h.name.length > 9 ? ' class="small"' : ""}>${esc(h.name)}</h1>
  <div class="role">${roleIcon(h.grole)}${esc(h.grole)}</div>
  <div class="url">junhots.com/<b>builds</b></div>
</div>
<div class="edge"></div>`;
}

// Main pages: words on the left, the page's own preview picture on the right
const PAGES = [
  ["home", "HEROES OF THE STORM", "Tier list, builds and stream overlay", "Jun plays HotS live on Twitch.", null, ""],
  ["tierlist", "TIER LIST", "Jun's tier list", "Every hero ranked, with counters, synergy and win rates.", "previews/tierlist.webp", "tierlist"],
  ["builds", "TALENT BUILDS", "Builds for every hero", "Talents, abilities and Jun's builds to copy into the game.", null, "builds"],
  ["maker", "MAKE YOUR OWN", "Tier list maker", "Drag heroes into your own tiers and share it.", "previews/maker.webp", "tierlist-maker"],
  ["overlay", "STREAM OVERLAY", "HotS stream overlay", "Live talents, rank, win streak and a draft banner.", "previews/overlay-talents.webp", "overlay"],
];
// A tilted wall of hero portraits for pages without their own picture
function mosaic() {
  const pick = heroes.filter((_, i) => i % 3 === 0).slice(0, 30);
  return `<style>
.wall { position: absolute; left: 690px; top: -60px; display: grid; grid-template-columns: repeat(5, 112px); gap: 14px; transform: rotate(-8deg); }
.wall img { width: 112px; height: 112px; border-radius: 14px; border: 1px solid #2e323c; }
.fade { position: absolute; inset: 0; background: linear-gradient(to right, #0b0c0f 54%, rgba(11,12,15,.2) 70%, rgba(11,12,15,.5)); }
</style><div class="wall">${pick.map(h => `<img src="${file(`img/heroes/${h.id}.webp`)}">`).join("")}</div><div class="fade"></div><div class="glow"></div>`;
}
function mainPage([, kicker, title, sub, pic, slug]) {
  return `${BASE}
<style>
.shot { position: absolute; left: 700px; top: 92px; width: 640px; height: 446px; border-radius: 16px; overflow: hidden; border: 1px solid #2e323c; box-shadow: 0 30px 80px rgba(0,0,0,.7), 0 0 60px rgba(82,199,255,.08); }
.shot img { width: 100%; height: 100%; object-fit: cover; object-position: top left; }
.shot::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to right, transparent 60%, #0b0c0f); }
h1 { font-size: 72px; }
.txt { width: 600px; }
</style>
<div class="glow"></div>
${pic ? `<div class="shot"><img src="${file("img/" + pic)}"></div>` : mosaic()}
<div class="txt">
  <div class="logo">Jun<span>HotS</span></div>
  <div class="kicker">${kicker}</div>
  <h1>${esc(title)}</h1>
  <div class="sub">${esc(sub)}</div>
  <div class="url">junhots.com${slug ? `/<b>${slug}</b>` : ""}</div>
</div>
<div class="edge"></div>`;
}

mkdirSync(OUT, { recursive: true });
const only = process.argv[2];
const TMP = path.join(os.tmpdir(), "junhots-og.html");
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
async function shoot(html, name) {
  writeFileSync(TMP, `<!doctype html><meta charset="utf-8">${html}`);
  await page.goto(pathToFileURL(TMP).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, name + ".jpg"), type: "jpeg", quality: 82 });
  console.log("made", name + ".jpg");
}
for (const h of heroes) if (!only || only === h.id) await shoot(heroPage(h), h.id);
if (!only) for (const p of PAGES) await shoot(mainPage(p), "_" + p[0]);
await browser.close();
rmSync(TMP, { force: true });
