#!/usr/bin/env node
// Builds the Chrome Web Store "small promo tile" (exactly 440x280 PNG).
// Writes a standalone HTML source (icon inlined) and renders it with the
// bundled Chromium.  Run:  node tools/gen-promo.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'promo');
mkdirSync(OUT, { recursive: true });

const iconB64 = readFileSync(join(ROOT, 'icons', 'icon128.png')).toString('base64');
const ICON = `data:image/png;base64,${iconB64}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root { --neon:#0aff9c; }
  html,body { width:440px; height:280px; overflow:hidden; }
  .tile {
    width:440px; height:280px; position:relative; overflow:hidden;
    font-family:"SF Mono","Cascadia Code",ui-monospace,"DejaVu Sans Mono",Menlo,Consolas,monospace;
    color:#c7d2dd;
    background:
      radial-gradient(560px 300px at 20% 2%, rgba(10,255,156,.16), transparent 58%),
      radial-gradient(420px 380px at 108% 120%, rgba(10,255,156,.10), transparent 60%),
      linear-gradient(158deg,#0e1626 0%, #0a0e14 52%, #05070a 100%);
  }
  /* faint terminal grid, faded toward edges */
  .tile::before {
    content:""; position:absolute; inset:0;
    background-image:
      linear-gradient(rgba(120,200,170,.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(120,200,170,.06) 1px, transparent 1px);
    background-size:24px 24px;
    -webkit-mask:radial-gradient(circle at 26% 34%, #000 0%, transparent 78%);
  }
  /* scanlines */
  .tile::after {
    content:""; position:absolute; inset:0; pointer-events:none; opacity:.5;
    background:repeating-linear-gradient(0deg,rgba(0,0,0,0) 0 2px,rgba(0,0,0,.16) 3px,rgba(0,0,0,0) 4px);
  }
  .inner { position:absolute; inset:0; display:flex; align-items:center; gap:22px; padding:26px 30px; z-index:2; }
  .logo { width:118px; height:118px; flex:none;
    filter:drop-shadow(0 0 14px rgba(10,255,156,.55)) drop-shadow(0 0 30px rgba(10,255,156,.25)); }
  .text { min-width:0; }
  .kicker { font-size:11px; letter-spacing:.02em; color:var(--neon); opacity:.9; margin-bottom:9px; white-space:nowrap; }
  .kicker b { color:#eafff6; }
  .word { font-size:31px; font-weight:800; letter-spacing:.5px; line-height:1; color:#f2f6fa; white-space:nowrap; }
  .word .neon { color:var(--neon); text-shadow:0 0 16px rgba(10,255,156,.45); }
  .sub { display:flex; align-items:center; gap:9px; margin-top:11px; }
  .tag { font-size:10px; letter-spacing:.18em; color:#9fb0bf; border:1px solid #2a3644;
    border-radius:5px; padding:3px 8px; }
  .pro { font-size:12px; letter-spacing:.22em; font-weight:700; color:var(--neon); }
  .tagline { margin-top:14px; font-size:12.5px; line-height:1.5; color:#b7c3ce; }
  .tagline b { color:var(--neon); }
  .cursor { display:inline-block; width:8px; height:14px; background:var(--neon); translate:0 2px; margin-left:3px;
    box-shadow:0 0 8px rgba(10,255,156,.7); }
  .foot { position:absolute; left:30px; right:30px; bottom:15px; z-index:2;
    display:flex; justify-content:space-between; align-items:center;
    font-size:10px; letter-spacing:.02em; color:#5b6b7a; white-space:nowrap; }
  .foot .sig { color:var(--neon); opacity:.75; }
</style></head><body>
  <div class="tile">
    <div class="inner">
      <img class="logo" src="${ICON}" alt="">
      <div class="text">
        <div class="kicker">❯ suspend --idle --dev<span class="cursor"></span></div>
        <div class="word">TAB<span class="neon">HIBERNATOR</span></div>
        <div class="sub"><span class="tag">DEV EDITION</span><span class="pro">PRO</span></div>
        <div class="tagline">Freeze idle tabs &amp; reclaim RAM.<br>Never kill a <b>localhost</b>, PR,<br>or unsaved form.</div>
      </div>
    </div>
    <div class="foot">
      <span>Tab hibernation &amp; organizer for developers</span>
      <span class="sig">no&nbsp;telemetry</span>
    </div>
  </div>
</body></html>`;

writeFileSync(join(OUT, 'small-tile.html'), html);

const { chromium } = pw;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
});
const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(150);
await page.screenshot({ path: join(OUT, 'small-tile-440x280.png'), clip: { x: 0, y: 0, width: 440, height: 280 } });
await browser.close();
console.log('wrote docs/promo/small-tile-440x280.png and small-tile.html');
