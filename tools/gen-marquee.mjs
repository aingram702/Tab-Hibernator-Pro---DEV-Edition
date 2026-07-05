#!/usr/bin/env node
// Builds the Chrome Web Store "marquee promo tile" (exactly 1400x560 PNG).
// Writes a standalone HTML source (icon inlined) and renders it with the
// bundled Chromium.  Run:  node tools/gen-marquee.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'promo');
mkdirSync(OUT, { recursive: true });

const ICON = `data:image/png;base64,${readFileSync(join(ROOT, 'icons', 'icon128.png')).toString('base64')}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root { --neon:#0aff9c; }
  html,body { width:1400px; height:560px; overflow:hidden; }
  .tile {
    width:1400px; height:560px; position:relative; overflow:hidden;
    font-family:"SF Mono","Cascadia Code",ui-monospace,"DejaVu Sans Mono",Menlo,Consolas,monospace;
    color:#c7d2dd;
    background:
      radial-gradient(760px 460px at 16% -6%, rgba(10,255,156,.16), transparent 60%),
      radial-gradient(700px 620px at 104% 118%, rgba(10,255,156,.12), transparent 62%),
      linear-gradient(150deg,#0e1626 0%, #0a0e14 50%, #05070a 100%);
  }
  .tile::before {
    content:""; position:absolute; inset:0;
    background-image:
      linear-gradient(rgba(120,200,170,.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(120,200,170,.06) 1px, transparent 1px);
    background-size:40px 40px;
    -webkit-mask:radial-gradient(circle at 24% 40%, #000 0%, transparent 82%);
  }
  .tile::after {
    content:""; position:absolute; inset:0; pointer-events:none; opacity:.45;
    background:repeating-linear-gradient(0deg,rgba(0,0,0,0) 0 3px,rgba(0,0,0,.14) 4px,rgba(0,0,0,0) 6px);
  }
  .inner { position:absolute; inset:0; display:flex; align-items:center; gap:56px; padding:0 72px; z-index:2; }

  .left { width:700px; flex:none; }
  .kicker { font-size:16px; color:var(--neon); opacity:.9; margin-bottom:20px; white-space:nowrap; }
  .kicker b { color:#eafff6; }
  .cursor { display:inline-block; width:10px; height:18px; background:var(--neon); translate:0 3px; margin-left:4px;
    box-shadow:0 0 10px rgba(10,255,156,.7); }
  .brand { display:flex; align-items:center; gap:22px; }
  .logo { width:104px; height:104px; flex:none;
    filter:drop-shadow(0 0 18px rgba(10,255,156,.55)) drop-shadow(0 0 40px rgba(10,255,156,.22)); }
  .word { font-size:58px; font-weight:800; letter-spacing:1px; line-height:.96; color:#f2f6fa; white-space:nowrap; }
  .word .neon { color:var(--neon); text-shadow:0 0 22px rgba(10,255,156,.45); }
  .sub { display:flex; align-items:center; gap:12px; margin:14px 0 0 126px; }
  .tag { font-size:12px; letter-spacing:.2em; color:#9fb0bf; border:1px solid #2a3644; border-radius:6px; padding:4px 10px; }
  .pro { font-size:15px; letter-spacing:.24em; font-weight:700; color:var(--neon); }
  .tagline { margin-top:28px; font-size:20px; line-height:1.55; color:#b7c3ce; }
  .tagline b { color:var(--neon); }
  .chips { display:flex; flex-wrap:wrap; gap:10px; margin-top:26px; }
  .chip { font-size:14px; color:#cdd8e2; background:rgba(10,255,156,.06);
    border:1px solid #23414f; border-radius:999px; padding:8px 14px; white-space:nowrap; }
  .chip .i { color:var(--neon); margin-right:7px; }

  /* right: terminal card echoing the freeze screen */
  .right { flex:1; display:flex; justify-content:center; }
  .term { width:470px; border:1px solid #1c2530; border-radius:14px; overflow:hidden;
    background:linear-gradient(180deg,#0d1117,#0a0e14); box-shadow:0 24px 70px -20px rgba(0,0,0,.8), 0 0 0 1px rgba(10,255,156,.06); }
  .bar { display:flex; align-items:center; gap:9px; padding:13px 16px; background:#131a24; border-bottom:1px solid #1c2530; }
  .dot { width:12px; height:12px; border-radius:50%; }
  .r{background:#ff5f56}.y{background:#ffbd2e}.g{background:#27c93f}
  .bt { margin-left:10px; font-size:14px; color:#7d8b9a; }
  .flake { margin-left:auto; color:var(--neon); filter:drop-shadow(0 0 8px rgba(10,255,156,.6)); }
  .body { padding:22px 22px 24px; }
  .body .l { font-size:15.5px; margin-bottom:12px; }
  .prompt { color:var(--neon); }
  .ok { color:var(--neon); }
  .stat { display:flex; align-items:baseline; gap:12px; padding:9px 0; border-top:1px dashed #1c2530; }
  .stat .n { font-size:26px; font-weight:800; color:#f2f6fa; font-variant-numeric:tabular-nums; min-width:118px; }
  .stat .n.accent { color:var(--neon); }
  .stat .k { font-size:13px; color:#7d8b9a; text-transform:uppercase; letter-spacing:.08em; }
  .wake { margin-top:18px; display:flex; align-items:center; justify-content:center; gap:10px;
    border:1px solid var(--neon); color:#eafff6; background:rgba(10,255,156,.14);
    border-radius:9px; padding:12px; font-size:15px; }
  .wake .key { margin-left:auto; font-size:12px; color:#7d8b9a; border:1px solid #263241; border-radius:5px; padding:2px 8px; }
</style></head><body>
  <div class="tile">
    <div class="inner">
      <div class="left">
        <div class="kicker">❯ suspend --idle-tabs --keep <b>localhost</b><span class="cursor"></span></div>
        <div class="brand">
          <img class="logo" src="${ICON}" alt="">
          <div class="word">TAB<span class="neon">HIBERNATOR</span></div>
        </div>
        <div class="sub"><span class="tag">DEV EDITION</span><span class="pro">PRO</span></div>
        <div class="tagline">Developer-first tab hibernation. Freeze idle tabs,<br>reclaim RAM, and never lose a <b>localhost</b>, PR,<br>or unsaved form.</div>
        <div class="chips">
          <span class="chip"><span class="i">❄</span>Auto-freeze idle tabs</span>
          <span class="chip"><span class="i">🖥</span>Protects localhost &amp; dev sites</span>
          <span class="chip"><span class="i">🗂</span>One-click group by site</span>
          <span class="chip"><span class="i">🧠</span>Keeps unsaved work</span>
        </div>
      </div>

      <div class="right">
        <div class="term">
          <div class="bar">
            <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
            <span class="bt">tab-hibernator://frozen</span><span class="flake">❄</span>
          </div>
          <div class="body">
            <div class="l"><span class="prompt">❯ </span>suspend --idle-tabs <span class="ok">OK</span></div>
            <div class="stat"><span class="n accent">128</span><span class="k">tabs frozen</span></div>
            <div class="stat"><span class="n">11.5<span style="font-size:15px;color:#7d8b9a"> GB</span></span><span class="k">ram reclaimed</span></div>
            <div class="stat"><span class="n">0</span><span class="k">unsaved forms lost</span></div>
            <div class="wake"><span style="color:var(--neon)">☀</span> Wake all tabs <span class="key">Alt+Shift+R</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body></html>`;

writeFileSync(join(OUT, 'marquee-tile.html'), html);

const { chromium } = pw;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 560 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(150);
await page.screenshot({ path: join(OUT, 'marquee-tile-1400x560.png'), clip: { x: 0, y: 0, width: 1400, height: 560 } });
await browser.close();
console.log('wrote docs/promo/marquee-tile-1400x560.png and marquee-tile.html');
